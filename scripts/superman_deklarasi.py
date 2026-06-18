#!/usr/bin/env python
"""
Isi draft SPPn di Superman dari data DO Monitoring Pemasaran.

Dokumen pendukung otomatis dari upload aplikasi:
  - Kontrak standar → dokumen kontrak (entity kontrak/{no_kontrak})
  - Kontrak payung (PAYUNG_BA) → Berita Acara (entity ba/{no_ba})

Jenis form otomatis:
  - Ada PPh (pph_persen > 0) → SPPb dan SPPn (PPh di SPPb GL 11600000)
  - Tanpa PPh → SPPn Saja

Contoh:
  python scripts/superman_login.py
  python scripts/superman_deklarasi.py --no-do DO-2026-001 --dry-run
  python scripts/superman_deklarasi.py --no-do DO-2026-001 --submit
  python scripts/superman_deklarasi.py --no-do DO-2026-001 --doc path/manual.pdf
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from services.superman.auth import open_authenticated_context
from services.superman.config import SupermanConfig
from services.superman.documents import resolve_support_doc_from_do
from services.superman.filler import fill_sppn_draft, pause_for_review, submit_sppn_draft
from services.superman.payload import build_payload_from_do


def main() -> int:
    parser = argparse.ArgumentParser(description="Isi draft SPPn Superman dari DO")
    parser.add_argument("--no-do", required=True, help="Nomor DO di Monitoring Pemasaran")
    parser.add_argument(
        "--doc",
        help="File dokumen pendukung manual (default: kontrak atau BA dari upload aplikasi)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Hanya tampilkan payload JSON")
    parser.add_argument("--submit", action="store_true", help="Klik Simpan setelah pause")
    parser.add_argument("--headless", action="store_true", help="Browser tanpa UI")
    parser.add_argument("--no-pause", action="store_true", help="Tidak tunggu Enter di akhir")
    args = parser.parse_args()

    payload = build_payload_from_do(args.no_do)

    support: Path | None = Path(args.doc) if args.doc else None
    support_source = "manual (--doc)" if support else ""
    if not support:
        resolved = resolve_support_doc_from_do(args.no_do)
        support = resolved.path
        support_source = resolved.describe()

    if args.dry_run:
        data = payload.to_dict()
        data["support_doc"] = {
            "path": str(support),
            "source": support_source,
        }
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return 0

    print(f"Dokumen pendukung: {support_source}")
    print(f"  → {support}")

    cfg = SupermanConfig.from_env()
    if args.headless:
        data = asdict(cfg)
        data["headless"] = True
        cfg = SupermanConfig(**data)
    pw, browser, context = open_authenticated_context(cfg)
    page = context.new_page()
    try:
        fill_sppn_draft(page, cfg, payload, support_doc=support)
        out = ROOT / "scripts" / "_superman_probe" / f"draft_{args.no_do.replace('/', '_')}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(out), full_page=True)
        print(f"Screenshot draft: {out}")
        print(f"Jenis form: {payload.jenis_form}")
        print(f"Total DPP+PPN: Rp {payload.dpp_pokok + payload.pajak_ppn:,}")
        if payload.pph_nominal > 0:
            print(f"PPh (SPPb): Rp {payload.pph_nominal:,}")

        if not args.no_pause:
            pause_for_review(
                page,
                "Periksa Profit Center / Kode GL di tab Isi. Lengkapi upload jika perlu.",
            )

        if args.submit:
            try:
                submit_sppn_draft(page)
            except Exception as exc:
                err_shot = (
                    ROOT
                    / "scripts"
                    / "_superman_probe"
                    / f"submit_error_{args.no_do.replace('/', '_')}.png"
                )
                page.screenshot(path=str(err_shot), full_page=True)
                print(f"Screenshot error: {err_shot}", file=sys.stderr)
                if "disabled" in str(exc).lower() or "Validasi" in str(exc):
                    print(
                        "Gagal simpan — cek upload dokumen / field wajib di tab Informasi & Isi.",
                        file=sys.stderr,
                    )
                    if not cfg.headless:
                        pause_for_review(page, "Lengkapi form lalu klik Simpan di browser.")
                raise SystemExit(2) from exc

            post_shot = (
                ROOT
                / "scripts"
                / "_superman_probe"
                / f"submitted_{args.no_do.replace('/', '_')}.png"
            )
            page.screenshot(path=str(post_shot), full_page=True)
            print(f"SPPn tersimpan. URL: {page.url}")
            print(f"Screenshot setelah simpan: {post_shot}")
        else:
            print("Mode draft — form BELUM disimpan (tanpa --submit).")
    finally:
        context.close()
        browser.close()
        pw.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())