"""Debug ekstraksi nomor SPPn setelah submit — dump store_body + todo rows."""
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
from services.superman.documents import resolve_support_doc_from_do
from services.superman.filler import fill_sppn_draft, submit_sppn_draft
from services.superman.payload import build_payload_from_do
from services.superman.runner import (
    _coalesce_spp_numbers,
    _extract_numbers_from_store,
    _find_todo_match,
    _score_todo_row,
)

NO_DO = sys.argv[1] if len(sys.argv) > 1 else "0003/SPPB/GKP-PTPN24/KKB/SG35/2026"


def main() -> int:
    print(f"=== debug numbers: {NO_DO} ===")
    cfg = SupermanConfig.from_env()
    ensure_session(cfg, auto_login=False)
    payload = build_payload_from_do(NO_DO)
    support = resolve_support_doc_from_do(NO_DO)
    print(f"jenis_form={payload.jenis_form} pph={payload.pph_nominal} expect_sppb={payload.pph_nominal > 0}")

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        fill_sppn_draft(page, cfg, payload, support_doc=support.path, on_progress=lambda p, s: print(f"  [{p}%] {s}"))
        store_body = submit_sppn_draft(page, on_progress=lambda p, s: print(f"  [{p}%] {s}"))
        print("\n--- store_body type:", type(store_body).__name__)
        print(json.dumps(store_body, indent=2, ensure_ascii=False, default=str)[:8000])

        store_sppb, store_sppn = _extract_numbers_from_store(store_body)
        print(f"\nextract_store: sppb={store_sppb!r} sppn={store_sppn!r}")

        resp = page.request.get(f"{cfg.base_url.rstrip('/')}/sppd/getTodo")
        print(f"\ngetTodo ok={resp.ok} status={resp.status}")
        body = resp.json() if resp.ok else {}
        rows = body.get("data") or []
        print(f"todo_rows={len(rows)}")

        scored = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            score = _score_todo_row(
                row,
                no_do=payload.no_do,
                no_kontrak=payload.no_kontrak,
                mitra_pembeli=payload.mitra_pembeli,
                total_sppn=int(payload.dpp_pokok or 0) + int(payload.pajak_ppn or 0),
                expect_sppb=payload.pph_nominal > 0,
            )
            if score > 0:
                scored.append((score, row))

        scored.sort(key=lambda x: -x[0])
        print(f"\n--- top scored rows (max 5) ---")
        for score, row in scored[:5]:
            print(f"score={score} sppn_no={row.get('sppn_no')} sppb_no={row.get('sppb_no')} keys={list(row.keys())[:12]}")
            print(json.dumps(row, ensure_ascii=False, default=str)[:1200])
            print("---")

        match = _find_todo_match(page, cfg.base_url, payload, expect_sppb=payload.pph_nominal > 0)
        print(f"\nfind_todo_match: {match is not None}")
        if match:
            print(json.dumps(match, indent=2, ensure_ascii=False, default=str)[:3000])

        sppb, sppn = _coalesce_spp_numbers(
            store_sppb=store_sppb,
            store_sppn=store_sppn,
            match=match,
            store_body=store_body,
        )
        print(f"\ncoalesce: sppb={sppb!r} sppn={sppn!r}")
    finally:
        context.close()
        browser.close()
        pw.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
