from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import get_db
from services.auth import require_write
from services.superman import agent_registry
from services.superman.documents import (
    support_doc_download_manifest,
    superman_doc_requirements_for_invoice,
    superman_doc_requirements_for_pembayaran,
)
from services.superman.auth import SupermanCaptchaError, SupermanCaptchaRequired
from services.superman.netdiag import (
    check_waf_signature,
    probe_real_store_endpoint,
    run_network_probe,
)
from services.superman.persist import format_superman_ref, save_superman_to_invoice
from services.superman.progress import (
    claim_agent_job,
    complete_job,
    fail_job,
    get_job,
    list_waiting_agent_jobs,
    update_job,
)
from services.superman.runner import (
    SupermanNotConfiguredError,
    get_deklarasi_progress,
    get_status,
    inspect_superman_todo,
    recover_superman_from_todo,
    preview_deklarasi,
    refresh_captcha,
    request_captcha,
    start_deklarasi_job,
    submit_deklarasi,
    submit_deklarasi_invoice,
    verify_captcha,
)


class SupermanCaptchaVerifyBody(BaseModel):
    challenge_id: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1)


class AgentHeartbeatBody(BaseModel):
    agent_id: str | None = None
    name: str = ""
    hostname: str = ""
    version: str = "1"


class AgentClaimBody(BaseModel):
    agent_id: str = Field(..., min_length=1)
    job_id: str | None = None


class AgentProgressBody(BaseModel):
    agent_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    percent: int = Field(0, ge=0, le=100)
    stage: str = "..."


class AgentCompleteBody(BaseModel):
    agent_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    result: dict[str, Any] = Field(default_factory=dict)


class AgentFailBody(BaseModel):
    agent_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    error: str = Field(..., min_length=1)


router = APIRouter(prefix="/api/superman", tags=["Superman"])


@router.get("/status")
def superman_status(_user=Depends(require_write)):
    return get_status()


@router.get("/debug/netprobe")
def superman_netprobe(
    authenticated: bool = Query(False),
    _user=Depends(require_write),
):
    """Diagnostik: kirim POST data sampah (bukan data asli) ke Superman dengan
    berbagai ukuran, dari proses Python murni (bukan Playwright), untuk cari
    ambang ukuran yang memicu gagal koneksi. Endpoint sementara utk debug."""
    return run_network_probe(authenticated=authenticated)


@router.get("/debug/waf-check")
def superman_waf_check(_user=Depends(require_write)):
    """Diagnostik: GET halaman dashboard Superman (aman) dan cek header/body
    respons untuk tanda WAF/anti-bot/DDoS-protection (Cloudflare, Sucuri,
    ModSecurity, dll). Endpoint sementara utk debug."""
    return check_waf_signature()


@router.get("/debug/store-probe")
def superman_store_probe(_user=Depends(require_write)):
    """Diagnostik: SATU kali POST nyata (sesi asli + CSRF asli) ke /spp/store
    lewat httpx murni (bukan Playwright) — data form sengaja tidak lengkap
    (bukan data invoice asli) supaya kemungkinan besar ditolak validasi
    Superman. Endpoint sementara utk debug, isolasi apakah koneksi ke
    endpoint store yang sesungguhnya bisa selesai dari Python biasa."""
    return probe_real_store_endpoint()


@router.get("/captcha")
def superman_captcha(_user=Depends(require_write)):
    """Ambil gambar captcha login Superman untuk diisi user."""
    try:
        return request_captcha()
    except SupermanNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/captcha/refresh")
def superman_captcha_refresh(
    challenge_id: str = Query(..., min_length=1),
    _user=Depends(require_write),
):
    try:
        return refresh_captcha(challenge_id)
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/captcha/verify")
def superman_captcha_verify(body: SupermanCaptchaVerifyBody, _user=Depends(require_write)):
    try:
        return verify_captcha(body.challenge_id, body.answer)
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/recover")
def superman_recover(
    no_invoice: str | None = Query(None, min_length=1),
    no_pembayaran: str | None = Query(None, min_length=1),
    no_do: str | None = Query(None, min_length=1),
    force: bool = Query(False),
    _user=Depends(require_write),
):
    """Pulihkan nomor SPPn/SPPb dari To Do List ke kolom Superman invoice."""
    try:
        return recover_superman_from_todo(
            no_invoice=no_invoice,
            no_pembayaran=no_pembayaran,
            no_do=no_do,
            force=force,
        )
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


@router.get("/todo-inspect")
def superman_todo_inspect(
    no_invoice: str | None = Query(None, min_length=1),
    no_pembayaran: str | None = Query(None, min_length=1),
    no_do: str | None = Query(None, min_length=1),
    _user=Depends(require_write),
):
    """Debug: baca To Do List Superman untuk invoice tertentu."""
    try:
        return inspect_superman_todo(
            no_invoice=no_invoice,
            no_pembayaran=no_pembayaran,
            no_do=no_do,
        )
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


@router.get("/doc-requirements")
def superman_doc_requirements(
    no_invoice: str | None = Query(None, min_length=1),
    no_pembayaran: str | None = Query(None, min_length=1),
    db=Depends(get_db),
    _user=Depends(require_write),
):
    if no_invoice:
        reqs, ready = superman_doc_requirements_for_invoice(db, no_invoice.strip())
        return {"requirements": reqs, "ready": ready}
    if no_pembayaran:
        reqs, ready = superman_doc_requirements_for_pembayaran(db, no_pembayaran.strip())
        return {"requirements": reqs, "ready": ready}
    raise HTTPException(status_code=400, detail="no_invoice wajib diisi")


@router.get("/preview")
def superman_preview(
    no_invoice: str | None = Query(None, min_length=1),
    no_pembayaran: str | None = Query(None, min_length=1),
    no_do: str | None = Query(None, min_length=1),
    _user=Depends(require_write),
):
    try:
        return preview_deklarasi(
            no_invoice=no_invoice,
            no_pembayaran=no_pembayaran,
            no_do=no_do,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupermanNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _map_deklarasi_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        message = str(exc)
        if "sudah pernah dibuatkan SPPn/SPPb" in message:
            return HTTPException(status_code=409, detail=message)
        if "masih berjalan" in message:
            return HTTPException(status_code=409, detail=message)
        if "belum lunas" in message or "Dokumen pendukung" in message:
            return HTTPException(status_code=400, detail=message)
        return HTTPException(status_code=404, detail=message)
    if isinstance(exc, FileNotFoundError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, SupermanNotConfiguredError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, SupermanCaptchaRequired):
        return HTTPException(
            status_code=428,
            detail={"code": "SUPERMAN_SESSION_REQUIRED", "message": str(exc)},
        )
    if isinstance(exc, SupermanCaptchaError):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, RuntimeError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=502, detail=f"Gagal mengisi Superman: {exc}")


def _assert_job_owner(job, user) -> None:
    """Job agent hanya boleh diutak-atik user pemilik (atau admin)."""
    job_uid = int(getattr(job, "user_id", 0) or 0)
    user_uid = int(getattr(user, "id", 0) or 0)
    role = (getattr(user, "role", "") or "").strip().lower()
    if job_uid and user_uid and job_uid != user_uid and role != "admin":
        raise HTTPException(status_code=403, detail="Job milik user lain")


@router.get("/agent/status")
def superman_agent_status(user=Depends(require_write)):
    """Status agent desktop lokal milik user yang login."""
    return agent_registry.get_status(
        user_id=int(getattr(user, "id", 0) or 0),
        username=getattr(user, "username", "") or "",
    )


@router.post("/agent/heartbeat")
def superman_agent_heartbeat(body: AgentHeartbeatBody, user=Depends(require_write)):
    """Agent PC memanggil ini berkala (~15s) agar dianggap online untuk user ini."""
    return agent_registry.heartbeat(
        agent_id=body.agent_id,
        name=body.name,
        username=getattr(user, "username", "") or "",
        user_id=int(getattr(user, "id", 0) or 0),
        hostname=body.hostname,
        version=body.version,
    )


@router.get("/agent/waiting")
def superman_agent_waiting(user=Depends(require_write)):
    return {
        "jobs": list_waiting_agent_jobs(user_id=int(getattr(user, "id", 0) or 0)),
    }


@router.post("/agent/claim")
def superman_agent_claim(body: AgentClaimBody, user=Depends(require_write)):
    """Agent user mengambil 1 job executor=agent milik user yang sama."""
    uid = int(getattr(user, "id", 0) or 0)
    job = claim_agent_job(body.agent_id, job_id=body.job_id, user_id=uid)
    if not job:
        return {"claimed": False, "job": None}
    try:
        docs = support_doc_download_manifest(job.no_invoice)
    except Exception as exc:
        fail_job(
            job.job_id,
            f"Gagal menyiapkan dokumen untuk agent: {exc}",
            debug={"agent_id": body.agent_id, "user_id": uid},
        )
        raise _map_deklarasi_error(exc) from exc
    return {
        "claimed": True,
        "job": {
            "job_id": job.job_id,
            "no_invoice": job.no_invoice,
            "no_pembayaran": job.no_pembayaran,
            "executor": job.executor,
            "agent_id": job.agent_id,
            "user_id": int(job.user_id or 0),
            "percent": job.percent,
            "stage": job.stage,
            "documents": docs,
        },
    }


@router.post("/agent/progress")
def superman_agent_progress(body: AgentProgressBody, user=Depends(require_write)):
    job = get_job(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    if (job.executor or "") != "agent":
        raise HTTPException(status_code=400, detail="Job ini bukan executor agent")
    _assert_job_owner(job, user)
    if (job.agent_id or "").strip() and (job.agent_id or "").strip() != body.agent_id.strip():
        raise HTTPException(status_code=403, detail="Job diklaim agent lain")
    if job.status in ("completed", "failed"):
        return get_deklarasi_progress(body.job_id)
    update_job(body.job_id, body.percent, body.stage or "...")
    return get_deklarasi_progress(body.job_id)


@router.post("/agent/complete")
def superman_agent_complete(body: AgentCompleteBody, user=Depends(require_write)):
    job = get_job(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    if (job.executor or "") != "agent":
        raise HTTPException(status_code=400, detail="Job ini bukan executor agent")
    _assert_job_owner(job, user)
    if (job.agent_id or "").strip() and (job.agent_id or "").strip() != body.agent_id.strip():
        raise HTTPException(status_code=403, detail="Job diklaim agent lain")

    result = dict(body.result or {})
    result.setdefault("no_invoice", job.no_invoice)
    result.setdefault("executor", "agent")
    result.setdefault("agent_id", body.agent_id)

    # Pastikan nomor SPP tersimpan di DB dari sisi server (sumber kebenaran).
    sppb = result.get("sppb_no")
    sppn = result.get("sppn_no")
    if (sppb or sppn) and not (result.get("superman_saved") or "").strip():
        try:
            saved = save_superman_to_invoice(job.no_invoice, sppb, sppn)
            if saved:
                result["superman_saved"] = saved
                result["ok"] = True
                result.setdefault(
                    "message",
                    f"Nomor Superman disimpan via agent: {saved}",
                )
        except ValueError as exc:
            result["ok"] = False
            result["partial"] = True
            result["message"] = str(exc)
            result.setdefault(
                "superman_ref",
                format_superman_ref(sppb, sppn),
            )

    complete_job(job.job_id, result)
    return {"ok": True, "job_id": job.job_id, "result": result}


@router.post("/agent/fail")
def superman_agent_fail(body: AgentFailBody, user=Depends(require_write)):
    job = get_job(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    if (job.executor or "") != "agent":
        raise HTTPException(status_code=400, detail="Job ini bukan executor agent")
    _assert_job_owner(job, user)
    if (job.agent_id or "").strip() and (job.agent_id or "").strip() != body.agent_id.strip():
        raise HTTPException(status_code=403, detail="Job diklaim agent lain")
    fail_job(
        job.job_id,
        body.error,
        debug={"agent_id": body.agent_id, "executor": "agent", "user_id": getattr(user, "id", None)},
    )
    return {"ok": True, "job_id": job.job_id, "status": "failed"}


@router.post("/deklarasi/start")
def superman_deklarasi_start(
    no_invoice: str | None = Query(None, min_length=1),
    no_pembayaran: str | None = Query(None, min_length=1),
    no_do: str | None = Query(None, min_length=1),
    executor: str | None = Query(
        None,
        description="auto | agent | server — default auto (agent user online → agent)",
    ),
    user=Depends(require_write),
):
    """Mulai job deklarasi Superman — lacak progres via /deklarasi/progress."""
    try:
        return start_deklarasi_job(
            no_invoice=no_invoice,
            no_pembayaran=no_pembayaran,
            no_do=no_do,
            executor=executor,
            user_id=int(getattr(user, "id", 0) or 0),
            username=getattr(user, "username", "") or "",
        )
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


@router.get("/deklarasi/progress")
def superman_deklarasi_progress(
    job_id: str | None = Query(None, min_length=1),
    no_invoice: str | None = Query(None, min_length=1),
    _user=Depends(require_write),
):
    try:
        if not job_id and not no_invoice:
            raise ValueError("Parameter job_id atau no_invoice wajib diisi.")
        return get_deklarasi_progress(job_id, no_invoice=no_invoice)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/deklarasi")
def superman_deklarasi(
    no_invoice: str | None = Query(None, min_length=1),
    no_pembayaran: str | None = Query(None, min_length=1),
    no_do: str | None = Query(None, min_length=1),
    _user=Depends(require_write),
):
    """Isi dan simpan draft SPPn/SPPb di Superman (To Do List)."""
    try:
        if no_invoice:
            return submit_deklarasi_invoice(no_invoice.strip())
        if no_pembayaran:
            from services.superman.runner import submit_deklarasi_pembayaran
            return submit_deklarasi_pembayaran(no_pembayaran.strip())
        if no_do:
            return submit_deklarasi(no_do.strip())
        raise HTTPException(status_code=400, detail="no_invoice wajib diisi")
    except HTTPException:
        raise
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc