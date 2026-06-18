from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session, joinedload
from typing import List
import mammoth

import models
import schemas
from database import get_db
from services.auth import require_write
from services.cache import api_cache
from services.ba_utils import is_payung_ba, get_ba_for_entity
from services.stok_utils import (
    record_stok_keluar_do,
    resolve_do_stock_context,
    reverse_stok_do,
    validate_stok_cukup,
)

router = APIRouter(prefix="/api/do", tags=["Delivery Order"])


@router.post("", response_model=schemas.DeliveryOrderOut)
def create_do(do: schemas.DeliveryOrderCreate, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == do.no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Get kontrak for volume calculation (eager-load units for stok material)
    db_kontrak = (
        db.query(models.Kontrak)
        .options(joinedload(models.Kontrak.units))
        .filter(models.Kontrak.no_kontrak == db_invoice.no_kontrak)
        .first()
    )
    kontrak_volume = float(db_kontrak.volume or 0) if db_kontrak else 0
    invoice_total = float(db_invoice.jumlah_pembayaran or 0)
    nominal = float(do.nominal_transfer or 0)
    payung_ba = is_payung_ba(db_kontrak)

    no_ba = do.no_ba or db_invoice.no_ba
    db_ba = get_ba_for_entity(db, no_ba) if payung_ba else None

    if payung_ba:
        if not db_ba:
            raise HTTPException(status_code=400, detail="Kontrak payung wajib memilih Berita Acara (no_ba)")
        if db_ba.no_kontrak != db_invoice.no_kontrak:
            raise HTTPException(status_code=400, detail="BA tidak sesuai dengan kontrak invoice")
        volume_do = float(db_ba.volume_ba or 0)
        rencana_pengambilan = db_ba.tanggal_ba
    else:
        if do.no_ba:
            raise HTTPException(status_code=400, detail="no_ba hanya untuk kontrak PAYUNG_BA")

        # Jika invoice terkait unit, pakai volume unit untuk perhitungan proporsional
        volume_for_calc = kontrak_volume
        if db_invoice.nama_unit and db_kontrak:
            unit = next((u for u in db_kontrak.units if u.nama_unit == db_invoice.nama_unit), None)
            if unit and (unit.volume or 0) > 0:
                volume_for_calc = float(unit.volume)

        harga_satuan = float(db_kontrak.harga_satuan or 0) if db_kontrak else 0
        premi = float(db_kontrak.premi or 0) if db_kontrak else 0
        is_ppn = str(getattr(db_kontrak, 'is_ppn', 'true')).lower() == 'true' if db_kontrak else False
        ppn_persen = float(db_kontrak.ppn_persen or 0) / 100 if db_kontrak else 0

        unit_ratio = (volume_for_calc / kontrak_volume) if kontrak_volume > 0 else 1.0
        pokok_full = (kontrak_volume * harga_satuan) + premi
        ppn_full = pokok_full * ppn_persen if is_ppn else 0.0
        nilai_unit_penuh = (pokok_full + ppn_full) * unit_ratio

        if nilai_unit_penuh > 0 and volume_for_calc > 0:
            volume_do = (nominal / nilai_unit_penuh) * volume_for_calc
        else:
            volume_do = volume_for_calc
        rencana_pengambilan = do.rencana_pengambilan

    # Calculate selisih — sisa dari invoice yang belum ditransfer
    selisih = invoice_total - nominal

    do_payload = do.model_dump()
    if payung_ba and db_ba:
        do_payload["no_ba"] = db_ba.no_ba
        do_payload["rencana_pengambilan"] = db_ba.tanggal_ba

    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == do.no_do).first()
    if db_do:
        for key, value in do_payload.items():
            setattr(db_do, key, value)
        db_do.selisih = selisih
        db_do.volume_do = round(volume_do)
        saved_do = db_do
    else:
        saved_do = models.DeliveryOrder(
            **do_payload,
            selisih=selisih,
            volume_do=round(volume_do),
        )
        db.add(saved_do)

    ctx = resolve_do_stock_context(saved_do, db_invoice, db_kontrak)
    if not ctx["jenis_material"]:
        raise HTTPException(
            status_code=400,
            detail="Material tidak ditemukan di kontrak — tidak bisa mengurangi stok",
        )
    if not ctx["unit"]:
        raise HTTPException(
            status_code=400,
            detail="Unit tidak ditemukan — isi Kepada Unit atau nama unit di invoice",
        )

    reverse_stok_do(db, do.no_do)
    validate_stok_cukup(db, ctx)
    record_stok_keluar_do(db, saved_do, ctx)

    db.commit()
    api_cache.invalidate_reporting()
    db.refresh(saved_do)
    return saved_do


@router.get("", response_model=List[schemas.DeliveryOrderOut])
def get_dos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.DeliveryOrder).offset(skip).limit(limit).all()


@router.get("/export")
def export_do_docx(no_do: str, db: Session = Depends(get_db)):
    from services.generator_word import generate_do_docx
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
    if not db_do:
        raise HTTPException(status_code=404, detail="DO not found")
    buf = generate_do_docx(db_do)
    safe_name = no_do.replace('/', '_').replace(' ', '_')
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="DO_{safe_name}.docx"'}
    )


@router.get("/preview", response_class=HTMLResponse)
def preview_do_html(no_do: str = Query(...), db: Session = Depends(get_db)):
    from services.generator_word import generate_do_docx
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
    if not db_do:
        raise HTTPException(status_code=404, detail="DO not found")
    buf = generate_do_docx(db_do)
    buf.seek(0)
    result = mammoth.convert_to_html(buf)
    return result.value


@router.get("/{no_do:path}", response_model=schemas.DeliveryOrderOut)
def get_do(no_do: str, db: Session = Depends(get_db)):
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
    if not db_do:
        raise HTTPException(status_code=404, detail="DO not found")
    return db_do
@router.delete("/{no_do:path}")
def delete_do(no_do: str, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
    if not db_do:
        raise HTTPException(status_code=404, detail="DO not found")
    
    reverse_stok_do(db, no_do)
    db.delete(db_do)
    db.commit()
    api_cache.invalidate_reporting()
    return {"success": True, "message": "DO deleted successfully"}
