import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from services.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/kontak-pajak", tags=["Kontak Pajak"])


def normalize_wa(raw: str) -> str:
    """08xx / +62 8xx / 62-8xx → 628xx (format wa.me)."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    elif digits.startswith("8"):
        digits = "62" + digits
    if not (10 <= len(digits) <= 15):
        raise HTTPException(status_code=400, detail="Nomor WhatsApp tidak valid")
    return digits


def _apply(kontak: models.KontakPajak, body: schemas.KontakPajakIn) -> None:
    nama = body.nama.strip()
    if not nama:
        raise HTTPException(status_code=400, detail="Nama wajib diisi")
    kontak.nama = nama
    kontak.no_wa = normalize_wa(body.no_wa)
    kontak.keterangan = (body.keterangan or "").strip() or None


@router.get("", response_model=List[schemas.KontakPajakOut])
def list_kontak(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return db.query(models.KontakPajak).order_by(models.KontakPajak.id).all()


@router.post("", response_model=schemas.KontakPajakOut, status_code=status.HTTP_201_CREATED)
def create_kontak(
    body: schemas.KontakPajakIn,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    kontak = models.KontakPajak()
    _apply(kontak, body)
    db.add(kontak)
    db.commit()
    db.refresh(kontak)
    return kontak


@router.delete("/{kontak_id}")
def delete_kontak(
    kontak_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    kontak = db.query(models.KontakPajak).filter(models.KontakPajak.id == kontak_id).first()
    if not kontak:
        raise HTTPException(status_code=404, detail="Kontak tidak ditemukan")
    db.delete(kontak)
    db.commit()
    return {"ok": True}
