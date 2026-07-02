from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import get_db
from services.auth import require_write
from services.superman.documents import (
    superman_doc_requirements_for_invoice,
    superman_doc_requirements_for_pembayaran,
)
from services.superman.auth import SupermanCaptchaError, SupermanCaptchaRequired
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

router = APIRouter(prefix="/api/superman", tags=["Superman"])


@router.get("/status")
def superman_status(_user=Depends(require_write)):
    return get_status()


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


@router.post("/deklarasi/start")
def superman_deklarasi_start(
    no_invoice: str | None = Query(None, min_length=1),
    no_pembayaran: str | None = Query(None, min_length=1),
    no_do: str | None = Query(None, min_length=1),
    _user=Depends(require_write),
):
    """Mulai job deklarasi Superman — lacak progres via /deklarasi/progress."""
    try:
        return start_deklarasi_job(
            no_invoice=no_invoice,
            no_pembayaran=no_pembayaran,
            no_do=no_do,
        )
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


@router.get("/deklarasi/progress")
def superman_deklarasi_progress(job_id: str = Query(..., min_length=1), _user=Depends(require_write)):
    try:
        return get_deklarasi_progress(job_id)
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