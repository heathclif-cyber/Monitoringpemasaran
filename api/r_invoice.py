from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import math

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

    # Calculate fields
    jumlah_pembayaran = db_kontrak.nilai_transaksi + db_kontrak.nominal_ppn + (db_kontrak.nilai_transaksi * ((invoice.pph_22_persen or 0.0) / 100))
    terbilang_invoice = terbilang_rupiah(math.floor(jumlah_pembayaran))

    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == invoice.no_invoice).first()
    if db_invoice:
        for key, value in invoice.model_dump().items():
            setattr(db_invoice, key, value)
        db_invoice.jumlah_pembayaran = jumlah_pembayaran
        db_invoice.terbilang_invoice = terbilang_invoice
        db.commit()
        db.refresh(db_invoice)
        return db_invoice
    else:
        new_invoice = models.Invoice(
            **invoice.model_dump(),
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
