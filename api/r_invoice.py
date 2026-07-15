from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session
from typing import List
import math, io, mammoth

import models
import schemas
from database import get_db
from services.auth import require_write
from services.cache import api_cache
from services.utils import terbilang_rupiah
from services.ba_utils import is_payung_ba, calculate_ba_invoice_amount, kontrak_nilai_maksimum, ba_effective_harga
from services.money_utils import as_money, money_gt, money_remaining
from services.volume_utils import resolve_volume_scope, compute_proportional_volume

router = APIRouter(prefix="/api/invoice", tags=["Invoice"])


@router.post("", response_model=schemas.InvoiceOut)
def create_invoice(invoice: schemas.InvoiceCreate, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == invoice.no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")

    payung_ba = is_payung_ba(db_kontrak)
    db_ba = None
    if payung_ba:
        if not invoice.no_ba:
            raise HTTPException(status_code=400, detail="Kontrak payung wajib memilih Berita Acara (no_ba)")
        db_ba = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == invoice.no_ba).first()
        if not db_ba:
            raise HTTPException(status_code=404, detail="Berita Acara tidak ditemukan")
        if db_ba.no_kontrak != invoice.no_kontrak:
            raise HTTPException(status_code=400, detail="BA tidak sesuai dengan kontrak yang dipilih")
        existing_ba_invoice = db.query(models.Invoice).filter(
            models.Invoice.no_ba == invoice.no_ba,
            models.Invoice.no_invoice != invoice.no_invoice,
        ).first()
        if existing_ba_invoice:
            raise HTTPException(status_code=400, detail=f"BA sudah digunakan invoice {existing_ba_invoice.no_invoice}")
    elif invoice.no_ba:
        raise HTTPException(status_code=400, detail="no_ba hanya untuk kontrak PAYUNG_BA")

    # Hitung nilai maksimum kontrak (full value) — invoice = pokok + PPN, tanpa PPh
    kontrak_volume = float(db_kontrak.volume or 0.0)
    nilai_maksimum = kontrak_nilai_maksimum(db_kontrak)

    if payung_ba and db_ba:
        harga_ba = ba_effective_harga(db_ba, db_kontrak)
        if harga_ba <= 0:
            raise HTTPException(
                status_code=400,
                detail="BA belum memiliki harga satuan. Isi harga di form Berita Acara terlebih dahulu.",
            )
        nilai_maksimum = calculate_ba_invoice_amount(
            db_kontrak,
            float(db_ba.volume_ba or 0),
            harga_ba,
        )

    # Jika invoice untuk unit tertentu, hitung batas nilai per-unit
    # Hitungan pakai desimal (sen); tampilan UI yang membulatkan ke rupiah.
    nama_unit = invoice.nama_unit
    if nama_unit:
        db_unit = next((u for u in db_kontrak.units if u.nama_unit == nama_unit), None)
        if not db_unit:
            raise HTTPException(status_code=400, detail=f"Unit '{nama_unit}' tidak ditemukan dalam kontrak")
        unit_volume = float(db_unit.volume or 0.0)
        # Nilai proporsional unit = (volume_unit / volume_kontrak) × nilai_maksimum
        # Jika unit tidak punya volume, gunakan nilai_maksimum penuh (satu unit = seluruh kontrak)
        if unit_volume > 0 and kontrak_volume > 0:
            unit_ratio = unit_volume / kontrak_volume
            nilai_batas = as_money(nilai_maksimum * unit_ratio)
        else:
            nilai_batas = as_money(nilai_maksimum)

        if invoice.jumlah_pembayaran is not None and invoice.jumlah_pembayaran > 0:
            jumlah_pembayaran = as_money(float(invoice.jumlah_pembayaran))
        else:
            jumlah_pembayaran = nilai_batas

        if money_gt(jumlah_pembayaran, nilai_batas):
            raise HTTPException(
                status_code=400,
                detail=f"Jumlah pembayaran (Rp {jumlah_pembayaran:,.2f}) melebihi nilai unit {nama_unit} (Rp {nilai_batas:,.2f})"
            )

        existing_unit_invoices = db.query(models.Invoice).filter(
            models.Invoice.no_kontrak == invoice.no_kontrak,
            models.Invoice.nama_unit == nama_unit,
        ).all()
        total_unit_existing = sum(
            float(inv.jumlah_pembayaran or 0)
            for inv in existing_unit_invoices
            if inv.no_invoice != invoice.no_invoice
        )
        if money_gt(total_unit_existing + jumlah_pembayaran, nilai_batas):
            sisa = money_remaining(nilai_batas, total_unit_existing)
            raise HTTPException(
                status_code=400,
                detail=f"Total invoice unit {nama_unit} (Rp {total_unit_existing + jumlah_pembayaran:,.2f}) melebihi nilai unit (Rp {nilai_batas:,.2f}). Sisa: Rp {sisa:,.2f}"
            )
    else:
        nilai_maksimum = as_money(nilai_maksimum)
        if invoice.jumlah_pembayaran is not None and invoice.jumlah_pembayaran > 0:
            jumlah_pembayaran = as_money(float(invoice.jumlah_pembayaran))
        else:
            jumlah_pembayaran = nilai_maksimum

        if money_gt(jumlah_pembayaran, nilai_maksimum):
            raise HTTPException(
                status_code=400,
                detail=f"Jumlah pembayaran (Rp {jumlah_pembayaran:,.2f}) melebihi nilai kontrak (Rp {nilai_maksimum:,.2f})"
            )

        # Kontrak payung: satu invoice per BA, tanpa batas agregat nilai kontrak
        if not (payung_ba and db_ba):
            existing_invoices = db.query(models.Invoice).filter(
                models.Invoice.no_kontrak == invoice.no_kontrak
            ).all()
            total_existing = sum(
                float(inv.jumlah_pembayaran or 0)
                for inv in existing_invoices
                if inv.no_invoice != invoice.no_invoice
            )
            if money_gt(total_existing + jumlah_pembayaran, nilai_maksimum):
                sisa = money_remaining(nilai_maksimum, total_existing)
                raise HTTPException(
                    status_code=400,
                    detail=f"Total invoice (Rp {total_existing + jumlah_pembayaran:,.2f}) melebihi nilai kontrak (Rp {nilai_maksimum:,.2f}). Sisa: Rp {sisa:,.2f}"
                )

    if jumlah_pembayaran <= 0:
        raise HTTPException(status_code=400, detail="Jumlah pembayaran harus > 0")

    # Volume fisik mengacu volume kontrak/unit/BA (isi manual, default = sisa scope).
    vol_scope, nilai_scope = resolve_volume_scope(db_kontrak, invoice, db_ba)
    if payung_ba and db_ba and float(db_ba.volume_ba or 0) > 0:
        vol_scope = float(db_ba.volume_ba or 0)

    user_volume = float(invoice.volume or 0) if invoice.volume is not None else 0.0
    if user_volume > 0:
        volume_invoice = user_volume
    elif vol_scope > 0:
        # Default: sisa volume scope setelah invoice lain di unit/kontrak yang sama
        q_others = db.query(models.Invoice).filter(
            models.Invoice.no_kontrak == invoice.no_kontrak,
            models.Invoice.no_invoice != invoice.no_invoice,
        )
        if nama_unit:
            q_others = q_others.filter(models.Invoice.nama_unit == nama_unit)
        if payung_ba and invoice.no_ba:
            q_others = q_others.filter(models.Invoice.no_ba == invoice.no_ba)
        used_vol = sum(float(i.volume or 0) for i in q_others.all())
        sisa_vol = max(0.0, vol_scope - used_vol)
        volume_invoice = sisa_vol if sisa_vol > 0 else vol_scope
    else:
        volume_invoice = compute_proportional_volume(
            jumlah_pembayaran,
            volume_scope=vol_scope,
            nilai_penuh=nilai_scope,
            round_result=False,
        )

    if volume_invoice <= 0:
        raise HTTPException(
            status_code=400,
            detail="Volume invoice wajib diisi (mengacu volume kontrak/unit/BA).",
        )

    # Jangan melebihi volume scope kontrak/unit/BA
    if vol_scope > 0 and volume_invoice > vol_scope + 0.5:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Volume invoice ({volume_invoice:,.2f}) melebihi volume "
                f"{'BA' if payung_ba else ('unit ' + nama_unit if nama_unit else 'kontrak')} "
                f"({vol_scope:,.2f})."
            ),
        )

    # Total volume multi-invoice di scope yang sama ≤ volume kontrak/unit
    if vol_scope > 0:
        q_vol = db.query(models.Invoice).filter(
            models.Invoice.no_kontrak == invoice.no_kontrak,
            models.Invoice.no_invoice != invoice.no_invoice,
        )
        if nama_unit:
            q_vol = q_vol.filter(models.Invoice.nama_unit == nama_unit)
        if payung_ba and invoice.no_ba:
            q_vol = q_vol.filter(models.Invoice.no_ba == invoice.no_ba)
        total_vol_other = sum(float(i.volume or 0) for i in q_vol.all())
        if total_vol_other + volume_invoice > vol_scope + 0.5:
            sisa = max(0.0, vol_scope - total_vol_other)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Total volume invoice ({total_vol_other + volume_invoice:,.2f}) melebihi "
                    f"volume scope ({vol_scope:,.2f}). Sisa volume: {sisa:,.2f}."
                ),
            )

    # Terbilang dari nilai bulat tampilan; nilai tersimpan tetap desimal.
    terbilang_invoice = terbilang_rupiah(math.floor(jumlah_pembayaran + 1e-9))

    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == invoice.no_invoice).first()
    if db_invoice:
        for key, value in invoice.model_dump().items():
            setattr(db_invoice, key, value)
        db_invoice.jumlah_pembayaran = jumlah_pembayaran
        db_invoice.volume = volume_invoice
        db_invoice.terbilang_invoice = terbilang_invoice
        if payung_ba and db_ba:
            db_ba.status = "Ter-invoice"
        db.commit()
        api_cache.invalidate_reporting()
        db.refresh(db_invoice)
        return db_invoice
    else:
        new_invoice = models.Invoice(
            **invoice.model_dump(exclude={'jumlah_pembayaran', 'terbilang_invoice', 'volume'}),
            jumlah_pembayaran=jumlah_pembayaran,
            volume=volume_invoice,
            terbilang_invoice=terbilang_invoice
        )
        db.add(new_invoice)
        if payung_ba and db_ba:
            db_ba.status = "Ter-invoice"
        db.commit()
        api_cache.invalidate_reporting()
        db.refresh(new_invoice)
        return new_invoice


@router.get("", response_model=List[schemas.InvoiceOut])
def get_invoices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Invoice).offset(skip).limit(limit).all()


@router.get("/export")
def export_invoice_docx(no_invoice: str, db: Session = Depends(get_db)):
    from services.generator_word import generate_invoice_docx
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    buf = generate_invoice_docx(db_invoice)
    safe_name = no_invoice.replace('/', '_').replace(' ', '_')
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Invoice_{safe_name}.docx"'}
    )


@router.get("/export-kuitansi")
def export_kuitansi_docx(no_invoice: str, db: Session = Depends(get_db)):
    from services.generator_word import generate_kuitansi_docx
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    buf = generate_kuitansi_docx(db_invoice)
    safe_name = no_invoice.replace('/', '_').replace(' ', '_')
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Kuitansi_{safe_name}.docx"'}
    )


def _docx_to_html(buf: io.BytesIO) -> str:
    buf.seek(0)
    result = mammoth.convert_to_html(buf)
    return result.value


@router.get("/preview", response_class=HTMLResponse)
def preview_invoice_html(no_invoice: str = Query(...), db: Session = Depends(get_db)):
    from services.generator_word import generate_invoice_docx
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    buf = generate_invoice_docx(db_invoice)
    html = _docx_to_html(buf)
    return html


@router.get("/preview-kuitansi", response_class=HTMLResponse)
def preview_kuitansi_html(no_invoice: str = Query(...), db: Session = Depends(get_db)):
    from services.generator_word import generate_kuitansi_docx
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    buf = generate_kuitansi_docx(db_invoice)
    html = _docx_to_html(buf)
    return html


@router.get("/{no_invoice:path}", response_model=schemas.InvoiceOut)
def get_invoice(no_invoice: str, db: Session = Depends(get_db)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return db_invoice
@router.delete("/{no_invoice:path}")
def delete_invoice(no_invoice: str, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    no_ba = db_invoice.no_ba
    db.delete(db_invoice)
    if no_ba:
        db_ba = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == no_ba).first()
        if db_ba:
            still_linked = db.query(models.Invoice).filter(models.Invoice.no_ba == no_ba).first()
            if not still_linked and db_ba.status == "Ter-invoice":
                db_ba.status = "Selesai"
    db.commit()
    api_cache.invalidate_reporting()
    return {"success": True, "message": "Invoice deleted successfully"}
