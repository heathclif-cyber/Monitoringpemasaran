"""Snapshot data kontrak per invoice + log revisi kontrak.

Prinsip (mengikuti SAP): data kontrak disalin ke invoice saat invoice dibuat, sehingga
dokumen turunan (Invoice, Kuitansi, DO) yang sudah terbit tidak berubah ketika kontrak
diedit. Perubahan kontrak hanya berlaku untuk dokumen yang dibuat sesudahnya.
"""
from datetime import date, datetime
from typing import Any, Optional

import models


def _column_names() -> list[str]:
    return [c.name for c in models.Kontrak.__table__.columns]


def _to_json(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def take_snapshot(kontrak: models.Kontrak) -> dict:
    return {name: _to_json(getattr(kontrak, name)) for name in _column_names()}


def units_snapshot(kontrak: models.Kontrak) -> list[dict]:
    return [
        {
            "nama_unit": u.nama_unit,
            "volume": float(u.volume or 0.0),
            "komoditi": u.komoditi,
            "jenis_komoditi": u.jenis_komoditi,
            "satuan": u.satuan,
            "tahun_panen": u.tahun_panen,
            "deskripsi_produk": u.deskripsi_produk,
        }
        for u in kontrak.units
    ]


def diff_snapshots(before: dict, after: dict) -> dict:
    changes = {}
    for key in after:
        if key in ("nilai_transaksi", "nominal_ppn", "terbilang", "jatuh_tempo_pembayaran"):
            # turunan hitung: ikut dicatat bila berubah
            pass
        old, new = before.get(key), after.get(key)
        if isinstance(old, (int, float)) and isinstance(new, (int, float)):
            if abs(float(old) - float(new)) < 1e-6:
                continue
        elif (old or "") == (new or ""):
            continue
        changes[key] = [old, new]
    return changes


class KontrakView:
    """Proxy kontrak: nilai dari snapshot menimpa kolom kontrak live."""

    def __init__(self, live: models.Kontrak, snapshot: dict):
        object.__setattr__(self, "_live", live)
        object.__setattr__(self, "_snap", snapshot)

    def __getattr__(self, name: str):
        snap = object.__getattribute__(self, "_snap")
        if name in snap:
            value = snap[name]
            col = models.Kontrak.__table__.columns.get(name)
            if isinstance(value, str) and col is not None and isinstance(col.type, __import__("sqlalchemy").Date):
                return date.fromisoformat(value[:10])
            return value
        return getattr(object.__getattribute__(self, "_live"), name)


def kontrak_for_invoice(invoice: models.Invoice):
    """Kontrak sebagaimana adanya saat invoice dibuat (fallback: kontrak live)."""
    snap: Optional[dict] = getattr(invoice, "kontrak_snapshot", None)
    if snap and invoice.kontrak is not None:
        return KontrakView(invoice.kontrak, snap)
    return invoice.kontrak


def backfill_invoice_snapshots(db) -> int:
    n = 0
    for inv in db.query(models.Invoice).filter(models.Invoice.kontrak_snapshot.is_(None)).all():
        if inv.kontrak is not None:
            inv.kontrak_snapshot = take_snapshot(inv.kontrak)
            n += 1
    db.commit()
    return n
