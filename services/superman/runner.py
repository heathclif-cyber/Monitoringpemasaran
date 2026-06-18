"""Jalankan otomasi Superman — dipanggil dari API atau CLI."""

from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Any

from services.superman.auth import (
    SupermanCaptchaError,
    SupermanCaptchaRequired,
    ensure_session,
    is_session_valid,
    open_authenticated_context,
)
from services.superman.captcha_challenge import (
    refresh_captcha_challenge,
    start_captcha_challenge,
    verify_captcha_challenge,
)
from services.superman.config import SupermanConfig
from services.superman.documents import resolve_support_doc_from_do
from services.superman.filler import fill_sppn_draft, submit_sppn_draft
from services.superman.payload import build_payload_from_do
from services.superman.persist import assert_do_not_submitted, save_superman_to_do
from services.superman.progress import (
    ProgressCallback,
    complete_job,
    create_job,
    fail_job,
    get_job,
    make_progress_callback,
    update_job,
)


class SupermanNotConfiguredError(RuntimeError):
    pass


class SupermanSessionError(RuntimeError):
    pass


def is_configured() -> bool:
    has_user = bool(os.getenv("SUPERMAN_USER", "").strip())
    has_password = bool(
        os.getenv("SUPERMAN_PASSWORD", "").strip() or os.getenv("SUPERMAN_PASSWORD_B64", "").strip()
    )
    return has_user and has_password


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
    session_valid = is_session_valid(cfg, state) if state.is_file() else False
    using_b64 = bool(os.getenv("SUPERMAN_PASSWORD_B64", "").strip())
    return {
        "configured": is_configured(),
        "session_exists": state.is_file(),
        "session_valid": session_valid,
        "session_path": str(state),
        "base_url": cfg.base_url.rstrip("/"),
        "headless": cfg.headless,
        "credential_hint": {
            "username": cfg.username,
            "password_length": len(cfg.password),
            "password_from_b64": using_b64,
        },
        "captcha_hint": (
            None
            if session_valid
            else "Jika OCR gagal: jalankan `python scripts/superman_login.py --manual` lokal, "
            "lalu salin file session ke Railway (SUPERMAN_STATE_PATH + volume)."
        ),
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


def request_captcha() -> dict[str, Any]:
    return start_captcha_challenge(_api_config())


def refresh_captcha(challenge_id: str) -> dict[str, Any]:
    return refresh_captcha_challenge(challenge_id.strip())


def verify_captcha(challenge_id: str, answer: str) -> dict[str, Any]:
    return verify_captcha_challenge(challenge_id.strip(), answer.strip())


def submit_deklarasi(no_do: str, on_progress: ProgressCallback | None = None) -> dict[str, Any]:
    no_do = no_do.strip()
    assert_do_not_submitted(no_do)

    report = on_progress or (lambda _percent, _stage: None)

    report(5, "Memuat data DO dan dokumen")
    cfg = _api_config()

    report(10, "Memvalidasi session Superman")
    ensure_session(cfg, auto_login=False)

    payload = build_payload_from_do(no_do)
    support = resolve_support_doc_from_do(no_do)

    report(20, "Membuka browser Superman")
    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        fill_sppn_draft(
            page,
            cfg,
            payload,
            support_doc=support.path,
            on_progress=on_progress,
        )
        submit_sppn_draft(page, on_progress=on_progress)
        report(95, "Memverifikasi To Do List")
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
    sppb_no = None
    sppn_no = None
    if match:
        sppb_no = match.get("sppb_no")
        sppn_no = match.get("sppn_no")
        result.update(
            {
                "sppb_no": sppb_no,
                "sppn_no": sppn_no,
                "sppb_total": match.get("sppb_total"),
                "sppn_jumlah": match.get("sppn_jumlah"),
                "tanggal": match.get("tanggal"),
                "spp_id": match.get("spp_id"),
            }
        )

    saved = save_superman_to_do(no_do, sppb_no, sppn_no)
    if saved:
        result["superman_saved"] = saved

    report(100, "Selesai")
    return result


def _run_deklarasi_job(job_id: str, no_do: str) -> None:
    try:
        result = submit_deklarasi(no_do, on_progress=make_progress_callback(job_id))
        complete_job(job_id, result)
    except Exception as exc:
        fail_job(job_id, str(exc))


def start_deklarasi_job(no_do: str) -> dict[str, Any]:
    no_do = no_do.strip()
    assert_do_not_submitted(no_do)
    cfg = _api_config()
    ensure_session(cfg, auto_login=False)
    job_id = create_job(no_do)
    update_job(job_id, 0, "Memulai proses...")
    thread = threading.Thread(target=_run_deklarasi_job, args=(job_id, no_do), daemon=True)
    thread.start()
    return {"job_id": job_id, "no_do": no_do}


def get_deklarasi_progress(job_id: str) -> dict[str, Any]:
    job = get_job(job_id.strip())
    if not job:
        raise ValueError("Job deklarasi tidak ditemukan atau sudah kedaluwarsa.")
    payload: dict[str, Any] = {
        "job_id": job.job_id,
        "no_do": job.no_do,
        "status": job.status,
        "percent": job.percent,
        "stage": job.stage,
    }
    if job.status == "completed" and job.result:
        payload["result"] = job.result
    if job.status == "failed" and job.error:
        payload["error"] = job.error
    return payload