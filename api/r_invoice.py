from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import math
from decimal import Decimal

import models
import schemas
from database import get_db
from services.utils import terbilang_rupiah

router = APIRouter(prefix="/api/invoice", tags=["Invoice"])


@router.post("", response_model=schemas.InvoiceOut)
def create_invoice(invoice: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == invoice.no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")

    # Explicitly calculate: Pokok + PPN - PPh using Decimal
    vol = db_kontrak.volume or Decimal('0.00')
    hrg = db_kontrak.harga_satuan or Decimal('0.00')
    prm = db_kontrak.premi or Decimal('0.00')
    
    pokok = (vol * hrg) + prm
    ppn_val = Decimal('0.00')
    
    if db_kontrak.is_ppn:
        ppn_p = db_kontrak.ppn_persen or Decimal('0.00')
        ppn_val = pokok * (ppn_p / Decimal('100.00'))
    
    pph_val = Decimal('0.00')
    pph_rate = Decimal('0.00')
    if db_kontrak.is_pph:
        pph_rate = db_kontrak.pph_persen or Decimal('0.00')
        pph_val = pokok * (pph_rate / Decimal('100.00'))
    
    jumlah_pembayaran = pokok + ppn_val - pph_val
    terbilang_invoice = terbilang_rupiah(int(jumlah_pembayaran))

    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == invoice.no_invoice).first()
    
    invoice_data = invoice.model_dump()
    invoice_data['pph_22_persen'] = pph_rate # Override with contract pph

    if db_invoice:
        for key, value in invoice_data.items():
            setattr(db_invoice, key, value)
        db_invoice.jumlah_pembayaran = jumlah_pembayaran
        db_invoice.terbilang_invoice = terbilang_invoice
        db.commit()
        db.refresh(db_invoice)
        return db_invoice
    else:
        new_invoice = models.Invoice(
            **invoice_data,
            jumlah_pembayaran=jumlah_pembayaran,
            terbilang_invoice=terbilang_invoice
        )
        db.add(new_invoice)
        db.commit()
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


@router.get("/{no_invoice:path}", response_model=schemas.InvoiceOut)
def get_invoice(no_invoice: str, db: Session = Depends(get_db)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return db_invoice
@router.delete("/{no_invoice:path}")
def delete_invoice(no_invoice: str, db: Session = Depends(get_db)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    db.delete(db_invoice)
    db.commit()
    return {"success": True, "message": "Invoice deleted successfully"}
