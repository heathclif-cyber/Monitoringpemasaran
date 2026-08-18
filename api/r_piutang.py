from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from services.pembayaran_utils import pembayaran_paid_total, payment_balance, pph_on_net_transfer

router = APIRouter(prefix="/api/piutang", tags=["Piutang"])


def _build_piutang_rows(db: Session) -> list[dict]:
    invoices = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.pembayaran),
            joinedload(models.Invoice.kontrak),
        )
        .all()
    )

    rows: list[dict] = []
    for inv in invoices:
        kontrak = inv.kontrak
        payments = inv.pembayaran or []
        invoice_total = float(inv.jumlah_pembayaran or 0)

        paid_total = pembayaran_paid_total(payments, kontrak)
        shortfall, _surplus = payment_balance(paid_total, invoice_total)
        piutang_pokok = round(shortfall)

        piutang_pph = 0.0
        n_termin_pph = 0
        is_pph_kontrak = str(getattr(kontrak, "is_pph", "false") if kontrak else "false").lower()
        if kontrak and is_pph_kontrak == "true":
            for p in payments:
                if str(p.is_pph_disetor or "false").lower() != "true":
                    amt = pph_on_net_transfer(float(p.nominal_transfer or 0), kontrak)
                    if amt > 0:
                        piutang_pph += amt
                        n_termin_pph += 1
        piutang_pph = round(piutang_pph)

        if piutang_pokok <= 0 and piutang_pph <= 0:
            continue

        kategori = [
            key for key, val in (("pokok", piutang_pokok), ("pph_belum_setor", piutang_pph)) if val > 0
        ]
        mitra = (
            (kontrak.pembeli or "-").split("\n")[0].strip()
            if kontrak and kontrak.pembeli
            else "-"
        )

        rows.append(
            {
                "row_key": inv.no_invoice,
                "no_kontrak": inv.no_kontrak or "-",
                "no_invoice": inv.no_invoice,
                "mitra": mitra,
                "komoditi": kontrak.komoditi if kontrak else None,
                "unit": inv.nama_unit,
                "tanggal_invoice": inv.tanggal_transaksi,
                "jumlah_pembayaran": invoice_total,
                "total_dibayar_efektif": round(paid_total),
                "piutang_pokok": piutang_pokok,
                "piutang_pph_belum_setor": piutang_pph,
                "kategori": kategori,
                "is_pph_kontrak": is_pph_kontrak if is_pph_kontrak == "true" else "false",
                "jumlah_termin_pph_belum_setor": n_termin_pph,
                "superman": inv.superman,
            }
        )

    rows.sort(key=lambda r: (r["mitra"], r["no_invoice"]))
    return rows


def _build_summary(rows: list[dict]) -> dict:
    by_mitra: dict[str, dict] = {}
    for r in rows:
        agg = by_mitra.setdefault(
            r["mitra"],
            {"mitra": r["mitra"], "jumlah_invoice": 0, "total_piutang_pokok": 0.0, "total_piutang_pph_belum_setor": 0.0},
        )
        agg["jumlah_invoice"] += 1
        agg["total_piutang_pokok"] += r["piutang_pokok"]
        agg["total_piutang_pph_belum_setor"] += r["piutang_pph_belum_setor"]

    return {
        "total_invoice_outstanding": len(rows),
        "total_piutang_pokok": sum(r["piutang_pokok"] for r in rows),
        "total_piutang_pph_belum_setor": sum(r["piutang_pph_belum_setor"] for r in rows),
        "jumlah_invoice_pokok": sum(1 for r in rows if "pokok" in r["kategori"]),
        "jumlah_invoice_pph_belum_setor": sum(1 for r in rows if "pph_belum_setor" in r["kategori"]),
        "jumlah_mitra_terdampak": len(by_mitra),
        "by_mitra": sorted(by_mitra.values(), key=lambda a: a["mitra"]),
    }


@router.get("", response_model=schemas.PiutangResponse)
def get_piutang(db: Session = Depends(get_db)):
    rows = _build_piutang_rows(db)
    summary = _build_summary(rows)
    mitra = sorted({r["mitra"] for r in rows})
    return {"summary": summary, "rows": rows, "mitra": mitra}
