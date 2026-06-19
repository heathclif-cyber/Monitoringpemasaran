from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
from database import get_db
from services.auth import require_write
from services.cache import api_cache
from services.ba_utils import validate_ba_volume_quota

router = APIRouter(prefix="/api/ba", tags=["Berita Acara"])


def _sync_ba_status(db: Session, ba: models.BeritaAcara) -> None:
    linked_invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.no_ba == ba.no_ba)
        .first()
    )
    if linked_invoice:
        ba.status = "Ter-invoice"
    elif ba.status == "Ter-invoice":
        ba.status = "Selesai"


@router.post("", response_model=schemas.BeritaAcaraOut)
def create_ba(ba: schemas.BeritaAcaraCreate, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == ba.no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")

    if str(getattr(db_kontrak, "tipe_alur", "STANDAR")).upper() != "PAYUNG_BA":
        raise HTTPException(
            status_code=400,
            detail="Berita Acara hanya untuk kontrak dengan tipe alur PAYUNG_BA",
        )

    if not ba.bulan_buku:
        raise HTTPException(status_code=400, detail="Bulan buku wajib diisi")

    volume_ba = float(ba.volume_ba or 0)
    if volume_ba <= 0:
        raise HTTPException(status_code=400, detail="Volume BA harus > 0")

    harga_satuan = float(ba.harga_satuan or 0)
    if harga_satuan <= 0:
        raise HTTPException(status_code=400, detail="Harga satuan BA harus > 0")

    try:
        validate_ba_volume_quota(db, db_kontrak, volume_ba)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = ba.model_dump()
    db_ba = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == ba.no_ba).first()
    if db_ba:
        if db_ba.status == "Ter-invoice":
            raise HTTPException(status_code=400, detail="BA sudah ter-invoice, tidak dapat diubah")
        try:
            validate_ba_volume_quota(db, db_kontrak, volume_ba, exclude_no_ba=ba.no_ba)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        for key, value in payload.items():
            setattr(db_ba, key, value)
        _sync_ba_status(db, db_ba)
        db.commit()
        api_cache.invalidate_reporting()
        db.refresh(db_ba)
        return db_ba

    new_ba = models.BeritaAcara(**payload)
    db.add(new_ba)
    db.commit()
    api_cache.invalidate_reporting()
    db.refresh(new_ba)
    return new_ba


@router.get("", response_model=List[schemas.BeritaAcaraOut])
def get_ba_list(
    skip: int = 0,
    limit: int = 500,
    no_kontrak: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(models.BeritaAcara)
    if no_kontrak:
        q = q.filter(models.BeritaAcara.no_kontrak == no_kontrak)
    if status:
        q = q.filter(models.BeritaAcara.status == status)
    return q.order_by(models.BeritaAcara.tanggal_ba.desc()).offset(skip).limit(limit).all()


def _ba_invoice_map(db: Session, no_kontrak: str) -> dict[str, str]:
    rows = (
        db.query(models.Invoice.no_ba, models.Invoice.no_invoice)
        .filter(
            models.Invoice.no_kontrak == no_kontrak,
            models.Invoice.no_ba.isnot(None),
        )
        .all()
    )
    return {no_ba: no_invoice for no_ba, no_invoice in rows if no_ba}


@router.get("/available")
def get_available_ba(no_kontrak: str = Query(...), db: Session = Depends(get_db)):
    """BA yang belum punya invoice — dipilih di form invoice payung."""
    invoiced = _ba_invoice_map(db, no_kontrak)
    rows = (
        db.query(models.BeritaAcara)
        .filter(models.BeritaAcara.no_kontrak == no_kontrak)
        .order_by(models.BeritaAcara.tanggal_ba.desc())
        .all()
    )
    result = []
    for r in rows:
        linked_invoice = invoiced.get(r.no_ba)
        if linked_invoice:
            if r.status != "Ter-invoice":
                r.status = "Ter-invoice"
            continue
        if r.status == "Ter-invoice":
            r.status = "Selesai"
        result.append(
            {
                "no_ba": r.no_ba,
                "tanggal_ba": r.tanggal_ba.isoformat() if r.tanggal_ba else None,
                "bulan_buku": r.bulan_buku.isoformat() if r.bulan_buku else None,
                "volume_ba": float(r.volume_ba or 0),
                "harga_satuan": float(r.harga_satuan or 0),
                "nama_unit": r.nama_unit,
                "komoditi": r.komoditi,
                "status": r.status,
                "siap_invoice": float(r.harga_satuan or 0) > 0 and float(r.volume_ba or 0) > 0,
            }
        )
    db.commit()
    return result


@router.get("/{no_ba:path}", response_model=schemas.BeritaAcaraOut)
def get_ba(no_ba: str, db: Session = Depends(get_db)):
    db_ba = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == no_ba).first()
    if not db_ba:
        raise HTTPException(status_code=404, detail="Berita Acara not found")
    return db_ba


@router.delete("/{no_ba:path}")
def delete_ba(no_ba: str, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_ba = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == no_ba).first()
    if not db_ba:
        raise HTTPException(status_code=404, detail="Berita Acara not found")
    if db_ba.status == "Ter-invoice":
        raise HTTPException(status_code=400, detail="BA sudah ter-invoice, tidak dapat dihapus")

    linked_invoice = db.query(models.Invoice).filter(models.Invoice.no_ba == no_ba).first()
    if linked_invoice:
        raise HTTPException(status_code=400, detail="BA masih terhubung ke invoice")

    db.delete(db_ba)
    db.commit()
    api_cache.invalidate_reporting()
    return {"success": True, "message": "Berita Acara deleted successfully"}