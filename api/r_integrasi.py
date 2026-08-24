from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from services.auth import require_integration_read


router = APIRouter(prefix="/api/integrasi/v1", tags=["Integrasi Internal"])


@router.get("/cash-in")
def get_cash_in(
    tanggal_mulai: Optional[date] = Query(None, description="Tanggal pembayaran minimum (YYYY-MM-DD)"),
    tanggal_sampai: Optional[date] = Query(None, description="Tanggal pembayaran maksimum (YYYY-MM-DD)"),
    unit: Optional[str] = Query(None, min_length=1, description="Filter unit/kebun produsen"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_integration_read),
):
    """Arus kas masuk Pemasaran untuk aplikasi internal, misalnya Keuangan."""
    query = (
        db.query(models.Pembayaran)
        .options(
            joinedload(models.Pembayaran.invoice).joinedload(models.Invoice.kontrak),
            joinedload(models.Pembayaran.delivery_order),
        )
        .order_by(models.Pembayaran.tanggal_pembayaran.desc(), models.Pembayaran.no_pembayaran.desc())
    )
    if tanggal_mulai:
        query = query.filter(models.Pembayaran.tanggal_pembayaran >= tanggal_mulai)
    if tanggal_sampai:
        query = query.filter(models.Pembayaran.tanggal_pembayaran <= tanggal_sampai)
    if unit:
        query = query.filter(
            models.Pembayaran.invoice.has(
                models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit.strip())
            )
        )

    rows = query.limit(limit).all()
    data = []
    for pembayaran in rows:
        invoice = pembayaran.invoice
        kontrak = invoice.kontrak if invoice else None
        delivery_order = pembayaran.delivery_order
        data.append(
            {
                "id": pembayaran.no_pembayaran,
                "sumber": "pemasaran",
                "tanggal_kas_masuk": pembayaran.tanggal_pembayaran,
                "nominal": float(pembayaran.nominal_transfer or 0),
                "mata_uang": "IDR",
                "status_pph_disetor": pembayaran.is_pph_disetor == "true",
                "referensi": {
                    "no_pembayaran": pembayaran.no_pembayaran,
                    "no_invoice": invoice.no_invoice if invoice else None,
                    "no_kontrak": kontrak.no_kontrak if kontrak else None,
                    "no_ba": invoice.no_ba if invoice else None,
                    "no_do": delivery_order.no_do if delivery_order else None,
                },
                "asal_transaksi": {
                    "pembeli": kontrak.pembeli if kontrak else None,
                    "unit": kontrak.kebun_produsen if kontrak else None,
                    "komoditi": kontrak.komoditi if kontrak else None,
                    "tipe_kontrak": kontrak.tipe_alur if kontrak else None,
                },
            }
        )

    return {
        "meta": {
            "schema_version": "1.0",
            "source": "pemasaran",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "count": len(data),
        },
        "data": data,
    }
