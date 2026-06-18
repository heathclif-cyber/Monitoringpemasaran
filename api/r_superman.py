from fastapi import APIRouter, Depends, HTTPException, Query

from services.auth import require_write
from services.superman.auth import SupermanCaptchaError
from services.superman.runner import (
    SupermanNotConfiguredError,
    get_status,
    preview_deklarasi,
    submit_deklarasi,
)

router = APIRouter(prefix="/api/superman", tags=["Superman"])


@router.get("/status")
def superman_status(_user=Depends(require_write)):
    return get_status()


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


@router.post("/deklarasi")
def superman_deklarasi(no_do: str = Query(..., min_length=1), _user=Depends(require_write)):
    """Isi dan simpan draft SPPn/SPPb di Superman (To Do List)."""
    no_do = no_do.strip()
    try:
        return submit_deklarasi(no_do)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupermanNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SupermanCaptchaError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gagal mengisi Superman: {exc}",
        ) from exc