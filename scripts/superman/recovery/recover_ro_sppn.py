"""Recover SPPn for R08D-RO/INV/2026.07.15-1 after local agent crashed post-store.

Picks newest To Do row that matches uraian+amount+mitra for this invoice
(identity fields empty in list API — BUG match). Does NOT re-submit form.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from services.superman.auth import ensure_session, open_authenticated_context
from services.superman.config import SupermanConfig
from services.superman.persist import save_superman_to_invoice
from services.superman.runner import (
    _fetch_todo_rows,
    _normalize_match_text,
    _todo_row_blob,
    build_payload_from_invoice,
)

NO = "R08D-RO/INV/2026.07.15-1"


def main() -> int:
    cfg = SupermanConfig.from_env()
    ensure_session(cfg)
    payload = build_payload_from_invoice(NO)
    total = int(payload.dpp_pokok + payload.pajak_ppn)
    mitra_n = _normalize_match_text(payload.mitra_pembeli)
    kontrak_n = _normalize_match_text(payload.no_kontrak)
    inv_n = _normalize_match_text(payload.referensi or NO)
    uraian_key = _normalize_match_text("Kopra")

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        rows = _fetch_todo_rows(page, cfg.base_url)
    finally:
        context.close()
        browser.close()
        pw.stop()

    candidates = []
    for row in rows:
        sppn = (row.get("sppn_no") or "").strip()
        if not sppn:
            continue
        try:
            amt = int(round(float(row.get("sppn_jumlah") or 0)))
        except (TypeError, ValueError):
            amt = 0
        if abs(amt - total) > 1:
            continue
        blob = _todo_row_blob(row)
        if mitra_n and mitra_n not in blob:
            continue
        if uraian_key and uraian_key not in blob:
            continue
        # Prefer identity if present
        identity = inv_n in blob
        # Prefer kontrak mention in uraian
        kontrak_hit = bool(kontrak_n and kontrak_n in blob)
        sppn_id = int(row.get("sppn_id") or row.get("spp_id") or 0)
        candidates.append(
            {
                "sppn_no": sppn,
                "sppn_id": sppn_id,
                "spp_id": row.get("spp_id"),
                "amt": amt,
                "identity": identity,
                "kontrak_hit": kontrak_hit,
                "tanggal": row.get("tanggal") or row.get("sppn_tanggal"),
                "uraian": (row.get("sppn_uraian2") or "")[:160],
            }
        )

    candidates.sort(key=lambda c: (c["identity"], c["kontrak_hit"], c["sppn_id"]), reverse=True)
    print("candidates:", json.dumps(candidates, ensure_ascii=False, indent=2))
    if not candidates:
        print("NO_CANDIDATE")
        return 1

    best = candidates[0]
    print("SELECTED", best["sppn_no"], "id", best["sppn_id"])
    # Only auto-save if unique top sppn_id among same-score soft matches, or identity
    top_ids = [c for c in candidates if c["sppn_id"] == best["sppn_id"] or c["sppn_no"] == best["sppn_no"]]
    if len(candidates) > 1 and not best["identity"]:
        print(
            "WARNING: multiple soft-matching SPPn (likely prior duplicates). "
            "Saving newest only:",
            best["sppn_no"],
        )

    saved = save_superman_to_invoice(NO, None, best["sppn_no"])
    print("SAVED", saved)
    return 0 if saved else 1


if __name__ == "__main__":
    raise SystemExit(main())
