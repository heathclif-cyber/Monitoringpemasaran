"""Ambil To Do List Superman dan cari baris yang cocok dengan DO."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from services.superman.auth import ensure_session, open_authenticated_context
from services.superman.config import SupermanConfig
from services.superman.payload import build_payload_from_do
from services.superman.runner import _score_todo_row, _coalesce_spp_numbers, _extract_numbers_from_blob

NO_DO = sys.argv[1] if len(sys.argv) > 1 else "0004/SPPB/GKP-PTPN24/KKB/SG35/2026"


def main() -> int:
    cfg = SupermanConfig.from_env()
    ensure_session(cfg, auto_login=False)
    payload = build_payload_from_do(NO_DO)
    total_sppn = int(payload.dpp_pokok or 0) + int(payload.pajak_ppn or 0)
    expect_sppb = payload.pph_nominal > 0
    print(f"DO={NO_DO} kontrak={payload.no_kontrak} mitra={payload.mitra_pembeli}")
    print(f"total_sppn={total_sppn} expect_sppb={expect_sppb}")

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        page.goto(cfg.base_url.rstrip("/") + "/sppd", wait_until="networkidle")
        resp = page.request.get(f"{cfg.base_url.rstrip('/')}/sppd/getTodo")
        rows = resp.json().get("data") or [] if resp.ok else []
        print(f"todo_rows={len(rows)}")

        hits = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            blob = json.dumps(row, ensure_ascii=False).lower()
            if NO_DO.lower() in blob or payload.no_kontrak.lower() in blob:
                score = _score_todo_row(
                    row,
                    no_do=payload.no_do,
                    no_kontrak=payload.no_kontrak,
                    mitra_pembeli=payload.mitra_pembeli,
                    total_sppn=total_sppn,
                    expect_sppb=expect_sppb,
                )
                hits.append((score, row))

        hits.sort(key=lambda x: -x[0])
        print(f"direct_hits={len(hits)}")
        for score, row in hits[:8]:
            sppb, sppn = _extract_numbers_from_blob(json.dumps(row, ensure_ascii=False))
            print(f"\nscore={score} sppn_no={row.get('sppn_no')!r} sppb_no={row.get('sppb_no')!r}")
            print(f"  regex_blob: sppb={sppb!r} sppn={sppn!r}")
            print(json.dumps(row, ensure_ascii=False, default=str)[:2000])

        if hits:
            best = hits[0][1]
            sppb, sppn = _coalesce_spp_numbers(store_sppb=None, store_sppn=None, match=best, store_body=None)
            print(f"\ncoalesce_from_best: sppb={sppb!r} sppn={sppn!r}")
    finally:
        context.close()
        browser.close()
        pw.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
