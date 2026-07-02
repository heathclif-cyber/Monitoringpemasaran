import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

import models
import schemas
from database import get_db
from services.auth import require_write
from services.pembayaran_utils import effective_pelunasan, max_nominal_transfer, pembayaran_paid_total
from services.superman.documents import superman_doc_requirements_for_invoice

router = APIRouter(prefix="/api/pembayaran", tags=["Pembayaran"])


def _invoice_has_superman(invoice: models.Invoice | None) -> bool:
    return bool(invoice and (invoice.superman or "").strip())


def is_ready_for_do(p: models.Pembayaran) -> bool:
    return _invoice_has_superman(p.invoice)


def _sanitize_invoice_key(no_invoice: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", no_invoice.strip())


def _generate_pembayaran_no(db: Session, no_invoice: str) -> str:
    safe = _sanitize_invoice_key(no_invoice)
    existing = db.query(models.Pembayaran.no_pembayaran).filter(
        models.Pembayaran.no_invoice == no_invoice
    ).all()
    max_seq = 0
    prefix = f"PAY-{safe}-"
    for (no_pay,) in existing:
        if no_pay and no_pay.startswith(prefix):
            tail = no_pay[len(prefix):]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1}"


def _pembayaran_out(p: models.Pembayaran) -> dict:
    data = schemas.PembayaranOut.model_validate(p).model_dump()
    if p.invoice and (p.invoice.superman or "").strip():
        data["superman"] = p.invoice.superman
    if p.delivery_order:
        data["no_do"] = p.delivery_order.no_do
    return data


def _validate_pembayaran_aggregate(
    db: Session,
    db_invoice: models.Invoice,
    nominal: float,
    is_pph_disetor: Optional[str] = "false",
    exclude_no: Optional[str] = None,
) -> None:
    if nominal <= 0:
        raise HTTPException(status_code=400, detail="Nominal transfer harus lebih dari 0")

    invoice_total = float(db_invoice.jumlah_pembayaran or 0)
    kontrak = db.query(models.Kontrak).filter(
        models.Kontrak.no_kontrak == db_invoice.no_kontrak
    ).first()
    q = db.query(models.Pembayaran).filter(models.Pembayaran.no_invoice == db_invoice.no_invoice)
    if exclude_no:
        q = q.filter(models.Pembayaran.no_pembayaran != exclude_no)
    existing_total = pembayaran_paid_total(q.all(), kontrak)
    incoming = effective_pelunasan(nominal, is_pph_disetor, kontrak)

    if existing_total + incoming > invoice_total + 0.5:
        sisa_pelunasan = max(0.0, invoice_total - existing_total)
        max_transfer = max_nominal_transfer(sisa_pelunasan, kontrak)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Nominal melebihi batas transfer. Maksimal transfer: Rp {max_transfer:,.0f}"
                + (
                    f" (PPh dipotong pembeli dihitung terpisah → pelunasan Rp {round(sisa_pelunasan):,.0f})"
                    if kontrak and str(getattr(kontrak, "is_pph", "false")).lower() == "true"
                    else f" (sisa pelunasan Rp {round(sisa_pelunasan):,.0f})"
                )
            ),
        )


def _invoice_paid_total(db: Session, no_invoice: str, exclude_no: Optional[str] = None) -> float:
    invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    kontrak = None
    if invoice and invoice.no_kontrak:
        kontrak = db.query(models.Kontrak).filter(
            models.Kontrak.no_kontrak == invoice.no_kontrak
        ).first()
    q = db.query(models.Pembayaran).filter(models.Pembayaran.no_invoice == no_invoice)
    if exclude_no:
        q = q.filter(models.Pembayaran.no_pembayaran != exclude_no)
    return pembayaran_paid_total(q.all(), kontrak)


@router.post("", response_model=schemas.PembayaranOut)
def create_pembayaran(
    pembayaran: schemas.PembayaranCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_write),
):
    db_invoice = db.query(models.Invoice).filter(
        models.Invoice.no_invoice == pembayaran.no_invoice
    ).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if _invoice_has_superman(db_invoice):
        raise HTTPException(
            status_code=400,
            detail="Invoice sudah punya nomor Superman — pembayaran tidak bisa diubah",
        )

    nominal = float(pembayaran.nominal_transfer or 0)
    no_key = (pembayaran.no_pembayaran or "").strip() or None
    invoice_total = float(db_invoice.jumlah_pembayaran or 0)

    if no_key:
        db_pay = db.query(models.Pembayaran).filter(
            models.Pembayaran.no_pembayaran == no_key
        ).first()
        if not db_pay:
            raise HTTPException(status_code=404, detail="Pembayaran not found")
        _validate_pembayaran_aggregate(
            db, db_invoice, nominal, pembayaran.is_pph_disetor, exclude_no=no_key
        )
        existing_do = db.query(models.DeliveryOrder).filter(
            models.DeliveryOrder.no_pembayaran == no_key
        ).first()
        if existing_do and db_pay.no_invoice != pembayaran.no_invoice:
            raise HTTPException(
                status_code=400,
                detail="Pembayaran sudah terhubung DO — invoice tidak bisa diubah",
            )
        db_pay.no_invoice = pembayaran.no_invoice
        db_pay.tanggal_pembayaran = pembayaran.tanggal_pembayaran
        db_pay.nominal_transfer = nominal
        db_pay.is_pph_disetor = pembayaran.is_pph_disetor
        db_pay.selisih = invoice_total - nominal
        saved = db_pay
    else:
        _validate_pembayaran_aggregate(db, db_invoice, nominal, pembayaran.is_pph_disetor)
        pay_no = _generate_pembayaran_no(db, pembayaran.no_invoice)
        saved = models.Pembayaran(
            no_pembayaran=pay_no,
            no_invoice=pembayaran.no_invoice,
            tanggal_pembayaran=pembayaran.tanggal_pembayaran,
            nominal_transfer=nominal,
            is_pph_disetor=pembayaran.is_pph_disetor,
            selisih=invoice_total - nominal,
        )
        db.add(saved)

    db.commit()
    db.refresh(saved)
    return _pembayaran_out(
        db.query(models.Pembayaran)
        .options(
            joinedload(models.Pembayaran.delivery_order),
            joinedload(models.Pembayaran.invoice),
        )
        .filter(models.Pembayaran.no_pembayaran == saved.no_pembayaran)
        .first()
    )


@router.get("")
def get_pembayaran_list(
    skip: int = 0,
    limit: int = 100,
    no_invoice: Optional[str] = None,
    belum_do: bool = False,
    sudah_superman: bool = False,
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Pembayaran)
        .options(
            joinedload(models.Pembayaran.delivery_order),
            joinedload(models.Pembayaran.invoice),
        )
    )
    if no_invoice:
        q = q.filter(models.Pembayaran.no_invoice == no_invoice)
    if belum_do:
        linked = db.query(models.DeliveryOrder.no_pembayaran).filter(
            models.DeliveryOrder.no_pembayaran.isnot(None)
        )
        q = q.filter(~models.Pembayaran.no_pembayaran.in_(linked))
    rows = q.offset(skip).limit(limit).all()
    if sudah_superman:
        rows = [p for p in rows if is_ready_for_do(p)]
    return [_pembayaran_out(p) for p in rows]


@router.get("/doc-requirements")
def pembayaran_doc_requirements(
    no_invoice: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_write),
):
    """Status dokumen wajib Superman (kontrak + invoice + rekening koran) untuk invoice."""
    reqs, ready = superman_doc_requirements_for_invoice(db, no_invoice.strip())
    return {"requirements": reqs, "ready": ready}


@router.get("/{no_pembayaran:path}", response_model=schemas.PembayaranOut)
def get_pembayaran(no_pembayaran: str, db: Session = Depends(get_db)):
    db_pay = (
        db.query(models.Pembayaran)
        .options(
            joinedload(models.Pembayaran.delivery_order),
            joinedload(models.Pembayaran.invoice),
        )
        .filter(models.Pembayaran.no_pembayaran == no_pembayaran)
        .first()
    )
    if not db_pay:
        raise HTTPException(status_code=404, detail="Pembayaran not found")
    return _pembayaran_out(db_pay)


@router.delete("/{no_pembayaran:path}")
def delete_pembayaran(
    no_pembayaran: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_write),
):
    db_pay = (
        db.query(models.Pembayaran)
        .options(joinedload(models.Pembayaran.invoice))
        .filter(models.Pembayaran.no_pembayaran == no_pembayaran)
        .first()
    )
    if not db_pay:
        raise HTTPException(status_code=404, detail="Pembayaran not found")

    if _invoice_has_superman(db_pay.invoice):
        raise HTTPException(
            status_code=400,
            detail="Invoice sudah punya nomor Superman — pembayaran tidak bisa dihapus",
        )

    linked_do = db.query(models.DeliveryOrder).filter(
        models.DeliveryOrder.no_pembayaran == no_pembayaran
    ).first()
    if linked_do:
        raise HTTPException(
            status_code=400,
            detail=f"Pembayaran sudah terhubung DO {linked_do.no_do}",
        )

    db.delete(db_pay)
    db.commit()
    return {"success": True, "message": "Pembayaran deleted successfully"}