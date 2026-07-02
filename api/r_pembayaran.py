import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

import models
import schemas
from database import get_db
from services.auth import require_write
from services.pembayaran_utils import (
    effective_pelunasan,
    max_nominal_transfer,
    pembayaran_paid_total,
    pembayaran_selisih,
    payment_balance,
)
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


def _pembayaran_out(p: models.Pembayaran, warning: Optional[str] = None) -> dict:
    data = schemas.PembayaranOut.model_validate(p).model_dump()
    if p.invoice and (p.invoice.superman or "").strip():
        data["superman"] = p.invoice.superman
    if p.delivery_order:
        data["no_do"] = p.delivery_order.no_do
    if warning:
        data["warning"] = warning
    return data


def _kontrak_for_invoice(db: Session, db_invoice: models.Invoice) -> models.Kontrak | None:
    if not db_invoice.no_kontrak:
        return None
    return db.query(models.Kontrak).filter(
        models.Kontrak.no_kontrak == db_invoice.no_kontrak
    ).first()


def _existing_paid_total(
    db: Session,
    no_invoice: str,
    kontrak: models.Kontrak | None,
    exclude_no: Optional[str] = None,
) -> float:
    q = db.query(models.Pembayaran).filter(models.Pembayaran.no_invoice == no_invoice)
    if exclude_no:
        q = q.filter(models.Pembayaran.no_pembayaran != exclude_no)
    return pembayaran_paid_total(q.all(), kontrak)


def _validate_pembayaran_nominal(nominal: float) -> None:
    if nominal <= 0:
        raise HTTPException(status_code=400, detail="Nominal transfer harus lebih dari 0")


def _compute_pembayaran_selisih(
    db: Session,
    db_invoice: models.Invoice,
    nominal: float,
    is_pph_disetor: Optional[str] = "false",
    exclude_no: Optional[str] = None,
) -> tuple[float, float, float]:
    """Return (selisih, existing_paid, incoming_pelunasan). Selisih negatif = kelebihan."""
    kontrak = _kontrak_for_invoice(db, db_invoice)
    existing_total = _existing_paid_total(db, db_invoice.no_invoice, kontrak, exclude_no)
    incoming = effective_pelunasan(nominal, is_pph_disetor, kontrak)
    invoice_total = float(db_invoice.jumlah_pembayaran or 0)
    selisih = pembayaran_selisih(invoice_total, existing_total, incoming)
    return selisih, existing_total, incoming


def _pembayaran_warning_from_totals(
    invoice_total: float,
    existing_total: float,
    incoming: float,
    kontrak: models.Kontrak | None,
) -> Optional[str]:
    _, surplus = payment_balance(existing_total + incoming, invoice_total)
    if surplus <= 0:
        return None
    sisa_pelunasan = max(0.0, invoice_total - existing_total)
    exact_transfer = max_nominal_transfer(sisa_pelunasan, kontrak)
    return (
        f"Kelebihan pelunasan Rp {surplus:,.0f}. "
        f"Transfer pas-pasan lunas: Rp {exact_transfer:,.0f}"
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

    if no_key:
        db_pay = db.query(models.Pembayaran).filter(
            models.Pembayaran.no_pembayaran == no_key
        ).first()
        if not db_pay:
            raise HTTPException(status_code=404, detail="Pembayaran not found")
        _validate_pembayaran_nominal(nominal)
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
        selisih, existing_total, incoming = _compute_pembayaran_selisih(
            db, db_invoice, nominal, pembayaran.is_pph_disetor, exclude_no=no_key
        )
        db_pay.selisih = selisih
        saved = db_pay
    else:
        _validate_pembayaran_nominal(nominal)
        pay_no = _generate_pembayaran_no(db, pembayaran.no_invoice)
        selisih, existing_total, incoming = _compute_pembayaran_selisih(
            db, db_invoice, nominal, pembayaran.is_pph_disetor
        )
        saved = models.Pembayaran(
            no_pembayaran=pay_no,
            no_invoice=pembayaran.no_invoice,
            tanggal_pembayaran=pembayaran.tanggal_pembayaran,
            nominal_transfer=nominal,
            is_pph_disetor=pembayaran.is_pph_disetor,
            selisih=selisih,
        )
        db.add(saved)

    warning = _pembayaran_warning_from_totals(
        float(db_invoice.jumlah_pembayaran or 0),
        existing_total,
        incoming,
        _kontrak_for_invoice(db, db_invoice),
    )

    db.commit()
    db.refresh(saved)
    return _pembayaran_out(
        db.query(models.Pembayaran)
        .options(
            joinedload(models.Pembayaran.delivery_order),
            joinedload(models.Pembayaran.invoice),
        )
        .filter(models.Pembayaran.no_pembayaran == saved.no_pembayaran)
        .first(),
        warning=warning,
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