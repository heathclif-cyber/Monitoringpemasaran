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
from services.volume_utils import compute_volume_for_transfer, resolve_volume_scope
from services.stok_utils import (
    record_stok_keluar_do,
    resolve_do_stock_context,
    reverse_stok_do,
)

router = APIRouter(prefix="/api/do", tags=["Delivery Order"])


@router.post("", response_model=schemas.DeliveryOrderOut)
def create_do(do: schemas.DeliveryOrderCreate, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    if not do.no_pembayaran:
        raise HTTPException(status_code=400, detail="no_pembayaran wajib diisi")

    db_pay = (
        db.query(models.Pembayaran)
        .options(
            joinedload(models.Pembayaran.delivery_order),
            joinedload(models.Pembayaran.invoice),
        )
        .filter(models.Pembayaran.no_pembayaran == do.no_pembayaran)
        .first()
    )
    if not db_pay:
        raise HTTPException(status_code=404, detail="Pembayaran not found")

    no_invoice = do.no_invoice or db_pay.no_invoice
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if not (db_invoice.superman or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Invoice belum punya nomor Superman. Lunasi pembayaran dan buat deklarasi Superman terlebih dahulu.",
        )

    if db_pay.no_invoice != no_invoice:
        raise HTTPException(status_code=400, detail="Pembayaran tidak sesuai dengan invoice")

    existing_do_for_pay = db.query(models.DeliveryOrder).filter(
        models.DeliveryOrder.no_pembayaran == do.no_pembayaran,
        models.DeliveryOrder.no_do != do.no_do,
    ).first()
    if existing_do_for_pay:
        raise HTTPException(
            status_code=400,
            detail=f"Pembayaran sudah digunakan DO {existing_do_for_pay.no_do}",
        )

    db_kontrak = (
        db.query(models.Kontrak)
        .options(joinedload(models.Kontrak.units))
        .filter(models.Kontrak.no_kontrak == db_invoice.no_kontrak)
        .first()
    )
    invoice_total = float(db_invoice.jumlah_pembayaran or 0)
    nominal = float(db_pay.nominal_transfer or 0)
    payung_ba = is_payung_ba(db_kontrak)

    no_ba = do.no_ba or db_invoice.no_ba
    db_ba = get_ba_for_entity(db, no_ba) if payung_ba else None

    if payung_ba:
        if not db_ba:
            raise HTTPException(status_code=400, detail="Kontrak payung wajib memilih Berita Acara (no_ba)")
        if db_ba.no_kontrak != db_invoice.no_kontrak:
            raise HTTPException(status_code=400, detail="BA tidak sesuai dengan kontrak invoice")
        rencana_pengambilan = db_ba.tanggal_ba
    else:
        if do.no_ba:
            raise HTTPException(status_code=400, detail="no_ba hanya untuk kontrak PAYUNG_BA")
        rencana_pengambilan = do.rencana_pengambilan

    volume_for_calc, _nilai_scope = resolve_volume_scope(db_kontrak, db_invoice, db_ba)

    user_volume = float(do.volume_do or 0) if do.volume_do is not None else 0.0
    if user_volume > 0:
        volume_do = user_volume
    else:
        # Rumus tunggal — sama dengan estimasi Laporan sebelum DO terbit
        volume_do = compute_volume_for_transfer(
            db_kontrak, db_invoice, db_ba, nominal, round_result=False
        )

    max_volume = volume_for_calc
    if max_volume > 0 and volume_do > max_volume + 0.5:
        raise HTTPException(
            status_code=400,
            detail=f"Volume barang ({volume_do:,.0f}) melebihi volume maksimum ({max_volume:,.0f})",
        )

    selisih = invoice_total - nominal

    do_payload = {
        "no_do": do.no_do,
        "no_invoice": no_invoice,
        "no_pembayaran": do.no_pembayaran,
        "tanggal_do": do.tanggal_do,
        "kepada_unit": do.kepada_unit,
        "alamat_unit": do.alamat_unit,
        "tanggal_pembayaran": db_pay.tanggal_pembayaran,
        "nominal_transfer": nominal,
        "is_pph_disetor": db_pay.is_pph_disetor,
        "rencana_pengambilan": rencana_pengambilan,
        "superman": db_invoice.superman or db_pay.superman,
    }
    if payung_ba and db_ba:
        do_payload["no_ba"] = db_ba.no_ba
        do_payload["rencana_pengambilan"] = db_ba.tanggal_ba

    for sap_field in (
        "kontrak_sap",
        "so_sap",
        "do_sap",
        "billing_sap",
        "link_deklarasi_penerimaan",
    ):
        inv_val = getattr(db_invoice, sap_field, None) if db_invoice else None
        if inv_val and str(inv_val).strip():
            do_payload[sap_field] = inv_val

    rounded_volume = round(volume_do)
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == do.no_do).first()
    if db_do:
        for key, value in do_payload.items():
            setattr(db_do, key, value)
        db_do.selisih = selisih
        db_do.volume_do = rounded_volume
        saved_do = db_do
    else:
        saved_do = models.DeliveryOrder(
            **do_payload,
            selisih=selisih,
            volume_do=rounded_volume,
        )
        db.add(saved_do)

    ctx = resolve_do_stock_context(saved_do, db_invoice, db_kontrak)
    if not ctx["jenis_material"]:
        raise HTTPException(
            status_code=400,
            detail="Material tidak ditemukan di kontrak — tidak bisa mengurangi persediaan",
        )
    if not ctx["unit"]:
        raise HTTPException(
            status_code=400,
            detail="Unit tidak ditemukan — isi Kepada Unit atau nama unit di invoice",
        )

    reverse_stok_do(db, do.no_do)
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