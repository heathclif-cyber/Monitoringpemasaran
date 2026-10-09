from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
from database import get_db
from services.auth import require_write
from services.cache import api_cache
from services.ba_utils import validate_ba_volume_quota
from services.ba_linkage import resolve_pickup_do

router = APIRouter(prefix="/api/ba", tags=["Berita Acara"])


def _contract_snapshot(kontrak: models.Kontrak, requested_unit: str | None) -> dict:
    """Metadata BA berasal dari kontrak; hanya unit multi-unit yang boleh dipilih."""
    units = list(getattr(kontrak, "units", None) or [])
    requested_unit = (requested_unit or "").strip()
    matched_unit = None
    if requested_unit and units:
        matched_unit = next((unit for unit in units if unit.nama_unit == requested_unit), None)
        if not matched_unit:
            raise ValueError(f"Unit '{requested_unit}' tidak ditemukan dalam kontrak")

    if not requested_unit:
        requested_unit = (kontrak.kebun_produsen or "").strip()
    if not requested_unit and len(units) == 1:
        requested_unit = units[0].nama_unit or ""
        matched_unit = units[0]
    if matched_unit is None and requested_unit and units:
        matched_unit = next((unit for unit in units if unit.nama_unit == requested_unit), None)

    komoditi = (
        getattr(matched_unit, "komoditi", None)
        or kontrak.komoditi
        or None
    )
    deskripsi = (
        getattr(matched_unit, "jenis_komoditi", None)
        or getattr(matched_unit, "deskripsi_produk", None)
        or kontrak.jenis_komoditi
        or kontrak.deskripsi_produk
        or komoditi
    )
    return {
        "nama_unit": requested_unit or None,
        "komoditi": komoditi,
        "deskripsi": deskripsi,
    }


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
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == ba.no_kontrak).with_for_update().first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")

    is_payung_ba = str(getattr(db_kontrak, "tipe_alur", "STANDAR") or "STANDAR").upper() == "PAYUNG_BA"
    if ba.status not in ("Draft", "Selesai", "Ter-invoice"):
        raise HTTPException(status_code=400, detail="Status BA tidak valid")
    existing_ba = db.query(models.BeritaAcara).filter_by(no_ba=ba.no_ba).first()
    if ba.status == "Ter-invoice" and not (existing_ba and existing_ba.status == "Ter-invoice"):
        raise HTTPException(status_code=400, detail="Status Ter-invoice ditetapkan oleh sistem")

    volume_ba = float(ba.volume_ba or 0)
    if volume_ba <= 0:
        raise HTTPException(status_code=400, detail="Volume BA harus > 0")

    harga_satuan = float(ba.harga_satuan or 0)
    if is_payung_ba and harga_satuan <= 0:
        raise HTTPException(status_code=400, detail="Harga satuan BA harus > 0")

    try:
        validate_ba_volume_quota(db, db_kontrak, volume_ba, exclude_no_ba=ba.no_ba)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = ba.model_dump()
    payload["bulan_buku"] = ba.tanggal_ba
    if is_payung_ba:
        if ba.no_do:
            raise HTTPException(status_code=400, detail="BA payung dibuat sebelum invoice/DO; DO mewarisi BA dari invoice")
        payload["no_do"] = None
    else:
        try:
            picked_do = resolve_pickup_do(db, db_kontrak, ba.no_do, volume_ba, ba.no_ba,
                                         required=ba.status != "Draft")
            payload["no_do"] = picked_do.no_do if picked_do else None
            do_unit = picked_do.invoice.nama_unit if picked_do and picked_do.invoice else None
            if do_unit:
                if ba.nama_unit and ba.nama_unit != do_unit:
                    raise ValueError("Unit BA tidak sesuai dengan unit invoice DO")
                payload["nama_unit"] = do_unit
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if is_payung_ba and len(list(db_kontrak.units or [])) > 1 and not (payload.get("nama_unit") or "").strip():
        raise HTTPException(status_code=400, detail="Unit wajib dipilih untuk kontrak payung multi-unit")
    try:
        payload.update(_contract_snapshot(db_kontrak, payload.get("nama_unit")))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Kontrak normal dibukukan otomatis pada tanggal BA. Jangan simpan periode
    # manual agar laporan selalu mengikuti tanggal realisasi BA. Harga normal
    # mengikuti kontrak; harga payung tetap harga transaksi yang diisi di BA.
    if not is_payung_ba:
        payload["bulan_buku"] = None
        payload["harga_satuan"] = float(db_kontrak.harga_satuan or 0)
    db_ba = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == ba.no_ba).first()
    if db_ba:
        if db.query(models.Invoice).filter(
            (models.Invoice.no_ba == db_ba.no_ba) | (models.Invoice.no_kontrak == db_ba.no_ba)
        ).first():
            raise HTTPException(status_code=400, detail="BA sudah memiliki invoice; dasar realisasi tidak dapat diubah")
        if db_ba.status in ("Selesai", "Ter-invoice") and ba.status == "Draft":
            raise HTTPException(status_code=400, detail="BA realisasi tidak dapat dikembalikan menjadi Draft")
        if db_ba.no_do and db_ba.status != "Draft" and payload.get("no_do") != db_ba.no_do:
            raise HTTPException(status_code=400, detail="BA realisasi sudah terhubung; DO tidak boleh diganti")
        if db_ba.no_kontrak != ba.no_kontrak:
            raise HTTPException(status_code=400, detail="Kontrak BA yang sudah tersimpan tidak dapat diganti")
        if db_ba.status == "Ter-invoice":
            raise HTTPException(status_code=400, detail="BA sudah ter-invoice, tidak dapat diubah")
        legacy_dos = db.query(models.DeliveryOrder).filter_by(no_ba=ba.no_ba).all()
        if legacy_dos and payload.get("no_do") and any(d.no_do != payload["no_do"] for d in legacy_dos):
            raise HTTPException(status_code=400, detail="BA sudah ditautkan pada DO lain; referensi tidak boleh diganti")
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
            continue
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
                "siap_invoice": r.status == "Selesai" and float(r.harga_satuan or 0) > 0 and float(r.volume_ba or 0) > 0,
            }
        )
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
    if (db_ba.no_do and db_ba.status != "Draft") or db.query(models.DeliveryOrder).filter_by(no_ba=no_ba).first():
        raise HTTPException(status_code=400, detail="BA terhubung ke DO; lepaskan tautan saat masih Draft sebelum menghapus")

    db.delete(db_ba)
    db.commit()
    api_cache.invalidate_reporting()
    return {"success": True, "message": "Berita Acara deleted successfully"}
