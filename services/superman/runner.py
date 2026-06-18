"""Jalankan otomasi Superman — dipanggil dari API atau CLI."""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from services.superman.auth import ensure_session, open_authenticated_context
from services.superman.config import SupermanConfig
from services.superman.documents import resolve_support_doc_from_do
from services.superman.filler import fill_sppn_draft, submit_sppn_draft
from services.superman.payload import build_payload_from_do


class SupermanNotConfiguredError(RuntimeError):
    pass


class SupermanSessionError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(os.getenv("SUPERMAN_USER", "").strip() and os.getenv("SUPERMAN_PASSWORD", "").strip())


def _api_config() -> SupermanConfig:
    if not is_configured():
        raise SupermanNotConfiguredError(
            "Superman belum dikonfigurasi. Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment."
        )
    data = asdict(SupermanConfig.from_env())
    data["headless"] = True
    data["slow_mo_ms"] = 0
    return SupermanConfig(**data)


def get_status() -> dict[str, Any]:
    cfg = SupermanConfig.from_env()
    state = Path(cfg.state_path)
    return {
        "configured": is_configured(),
        "session_exists": state.is_file(),
        "session_path": str(state),
        "base_url": cfg.base_url.rstrip("/"),
        "headless": cfg.headless,
    }


def preview_deklarasi(no_do: str) -> dict[str, Any]:
    payload = build_payload_from_do(no_do)
    support = resolve_support_doc_from_do(no_do)
    data = payload.to_dict()
    data["support_doc"] = {
        "path": str(support.path),
        "source": support.describe(),
    }
    return data


def _find_todo_match(
    page,
    base_url: str,
    *,
    no_kontrak: str,
    expect_sppb: bool,
) -> dict[str, Any] | None:
    resp = page.request.get(f"{base_url.rstrip('/')}/sppd/getTodo")
    if not resp.ok:
        return None
    body = resp.json()
    rows = body.get("data") or []
    candidates = [r for r in rows if no_kontrak and no_kontrak in json.dumps(r, ensure_ascii=False)]
    if expect_sppb:
        with_sppb = [r for r in candidates if r.get("sppb_no")]
        if with_sppb:
            return with_sppb[0]
    return candidates[0] if candidates else None


def submit_deklarasi(no_do: str) -> dict[str, Any]:
    cfg = _api_config()
    ensure_session(cfg)

    payload = build_payload_from_do(no_do)
    support = resolve_support_doc_from_do(no_do)

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        fill_sppn_draft(page, cfg, payload, support_doc=support.path)
        submit_sppn_draft(page)
        match = _find_todo_match(
            page,
            cfg.base_url,
            no_kontrak=payload.no_kontrak,
            expect_sppb=payload.pph_nominal > 0,
        )
    finally:
        context.close()
        browser.close()
        pw.stop()

    result: dict[str, Any] = {
        "ok": True,
        "no_do": no_do,
        "no_kontrak": payload.no_kontrak,
        "jenis_form": payload.jenis_form,
        "pph_nominal": payload.pph_nominal,
        "total_sppn": payload.dpp_pokok + payload.pajak_ppn,
        "support_doc": support.describe(),
        "superman_url": f"{cfg.base_url.rstrip('/')}/sppd#tab-to-do-list-petugas",
        "message": "Draft SPPn/SPPb berhasil masuk To Do List Superman.",
    }
    if match:
        result.update(
            {
                "sppb_no": match.get("sppb_no"),
                "sppn_no": match.get("sppn_no"),
                "sppb_total": match.get("sppb_total"),
                "sppn_jumlah": match.get("sppn_jumlah"),
                "tanggal": match.get("tanggal"),
                "spp_id": match.get("spp_id"),
            }
        )
    return result