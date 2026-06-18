from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from services.auth import require_write
from services.stok_utils import FIXED_UNITS, get_saldo, list_distinct_materials

router = APIRouter(prefix="/api/stok", tags=["Stok"])


@router.get("/materials", response_model=List[str])
def get_materials(db: Session = Depends(get_db)):
    return list_distinct_materials(db)


@router.get("/units", response_model=List[str])
def get_units():
    return FIXED_UNITS


@router.get("", response_model=List[schemas.StokLedgerOut])
def list_stok(
    unit: Optional[str] = Query(default=None),
    jenis_material: Optional[str] = Query(default=None),
    arah: Optional[str] = Query(default=None),
    tanggal_dari: Optional[date] = Query(default=None),
    tanggal_sampai: Optional[date] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(models.StokLedger).order_by(
        models.StokLedger.tanggal.desc(),
        models.StokLedger.id.desc(),
    )
    if unit:
        q = q.filter(models.StokLedger.unit == unit)
    if jenis_material:
        q = q.filter(models.StokLedger.jenis_material == jenis_material)
    if arah:
        q = q.filter(models.StokLedger.arah == arah.upper())
    if tanggal_dari:
        q = q.filter(models.StokLedger.tanggal >= tanggal_dari)
    if tanggal_sampai:
        q = q.filter(models.StokLedger.tanggal <= tanggal_sampai)
    return q.limit(limit).all()


@router.get("/saldo", response_model=List[schemas.StokSaldoOut])
def list_saldo(
    unit: Optional[str] = Query(default=None),
    jenis_material: Optional[str] = Query(default=None),
    tanggal: Optional[date] = Query(default=None, description="Saldo per tanggal (default: hari ini)"),
    db: Session = Depends(get_db),
):
    as_of = tanggal or date.today()
    q = (
        db.query(
            models.StokLedger.unit,
            models.StokLedger.jenis_material,
            models.StokLedger.satuan,
            models.StokLedger.arah,
            func.sum(models.StokLedger.volume).label("total"),
        )
        .filter(models.StokLedger.tanggal <= as_of)
        .group_by(
            models.StokLedger.unit,
            models.StokLedger.jenis_material,
            models.StokLedger.satuan,
            models.StokLedger.arah,
        )
    )
    if unit:
        q = q.filter(models.StokLedger.unit == unit)
    if jenis_material:
        q = q.filter(models.StokLedger.jenis_material == jenis_material)

    balances: dict[tuple[str, str, str], float] = {}
    for row in q.all():
        key = (row.unit, row.jenis_material, row.satuan)
        sign = 1.0 if row.arah == "MASUK" else -1.0
        balances[key] = balances.get(key, 0.0) + sign * float(row.total or 0)

    return [
        schemas.StokSaldoOut(
            unit=u,
            jenis_material=m,
            satuan=s,
            saldo=round(saldo, 2),
        )
        for (u, m, s), saldo in sorted(balances.items())
        if saldo != 0
    ]


@router.get("/saldo/detail", response_model=schemas.StokSaldoOut)
def saldo_detail(
    unit: str = Query(...),
    jenis_material: str = Query(...),
    satuan: str = Query(default="Kg"),
    tanggal: Optional[date] = Query(default=None, description="Saldo per tanggal DO (default: hari ini)"),
    exclude_referensi_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    saldo = get_saldo(
        db,
        unit.strip(),
        jenis_material.strip(),
        satuan.strip(),
        as_of=tanggal or date.today(),
        exclude_referensi_id=exclude_referensi_id,
    )
    return schemas.StokSaldoOut(
        unit=unit.strip(),
        jenis_material=jenis_material.strip(),
        satuan=satuan.strip(),
        saldo=round(saldo, 2),
    )


@router.post("", response_model=schemas.StokLedgerOut)
def create_stok_masuk(
    payload: schemas.StokLedgerCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_write),
):
    if payload.volume <= 0:
        raise HTTPException(status_code=400, detail="Volume harus lebih dari 0")
    record = models.StokLedger(
        tanggal=payload.tanggal,
        unit=payload.unit.strip(),
        jenis_material=payload.jenis_material.strip(),
        volume=float(payload.volume),
        satuan=payload.satuan.strip() or "Kg",
        arah="MASUK",
        sumber="manual",
        catatan=payload.catatan,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{entry_id}", response_model=schemas.StokLedgerOut)
def update_stok(
    entry_id: int,
    payload: schemas.StokLedgerUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_write),
):
    record = db.query(models.StokLedger).filter(models.StokLedger.id == entry_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Entri stok tidak ditemukan")
    if record.sumber != "manual":
        raise HTTPException(status_code=400, detail="Hanya entri manual yang bisa diedit")

    data = payload.model_dump(exclude_unset=True)
    if "volume" in data and data["volume"] is not None and data["volume"] <= 0:
        raise HTTPException(status_code=400, detail="Volume harus lebih dari 0")
    for key, value in data.items():
        if value is not None and isinstance(value, str):
            value = value.strip()
        setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{entry_id}")
def delete_stok(
    entry_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_write),
):
    record = db.query(models.StokLedger).filter(models.StokLedger.id == entry_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Entri stok tidak ditemukan")
    if record.sumber != "manual":
        raise HTTPException(status_code=400, detail="Hanya entri manual yang bisa dihapus")
    db.delete(record)
    db.commit()
    return {"success": True, "message": "Entri stok dihapus"}