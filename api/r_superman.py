from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from services.auth import require_write
from services.superman.auth import SupermanCaptchaError, SupermanCaptchaRequired
from services.superman.runner import (
    SupermanNotConfiguredError,
    get_deklarasi_progress,
    get_status,
    preview_deklarasi,
    refresh_captcha,
    request_captcha,
    start_deklarasi_job,
    submit_deklarasi,
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


@router.get("/preview")
def superman_preview(no_do: str = Query(..., min_length=1), _user=Depends(require_write)):
    no_do = no_do.strip()
    try:
        return preview_deklarasi(no_do)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupermanNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _map_deklarasi_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, FileNotFoundError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, SupermanNotConfiguredError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, SupermanCaptchaRequired):
        return HTTPException(status_code=401, detail=str(exc))
    if isinstance(exc, SupermanCaptchaError):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, RuntimeError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=502, detail=f"Gagal mengisi Superman: {exc}")


@router.post("/deklarasi/start")
def superman_deklarasi_start(no_do: str = Query(..., min_length=1), _user=Depends(require_write)):
    """Mulai job deklarasi Superman — lacak progres via /deklarasi/progress."""
    try:
        return start_deklarasi_job(no_do.strip())
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


@router.get("/deklarasi/progress")
def superman_deklarasi_progress(job_id: str = Query(..., min_length=1), _user=Depends(require_write)):
    try:
        return get_deklarasi_progress(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/deklarasi")
def superman_deklarasi(no_do: str = Query(..., min_length=1), _user=Depends(require_write)):
    """Isi dan simpan draft SPPn/SPPb di Superman (To Do List)."""
    no_do = no_do.strip()
    try:
        return submit_deklarasi(no_do)
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc