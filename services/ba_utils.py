"""Shared helpers for Kontrak Payung / Berita Acara flow."""
from __future__ import annotations

from sqlalchemy.orm import Session

import models


def is_payung_ba(kontrak: models.Kontrak | None) -> bool:
    if not kontrak:
        return False
    return str(getattr(kontrak, "tipe_alur", "STANDAR") or "STANDAR").upper() == "PAYUNG_BA"


def ba_effective_harga(ba: models.BeritaAcara | None, kontrak: models.Kontrak) -> float:
    """Harga per BA; fallback ke kontrak hanya untuk data lama sebelum migrasi."""
    if ba is not None:
        harga_ba = float(getattr(ba, "harga_satuan", 0) or 0)
        if harga_ba > 0:
            return harga_ba
    return float(kontrak.harga_satuan or 0.0)


def kontrak_nilai_maksimum(kontrak: models.Kontrak) -> float:
    kontrak_volume = float(kontrak.volume or 0.0)
    pokok = (kontrak_volume * float(kontrak.harga_satuan or 0.0)) + float(kontrak.premi or 0.0)
    ppn_val = 0.0
    if str(getattr(kontrak, "is_ppn", "true")).lower() == "true":
        ppn_val = pokok * (float(kontrak.ppn_persen or 0.0) / 100)
    return pokok + ppn_val


def calculate_ba_pokok(
    kontrak: models.Kontrak,
    volume_ba: float,
    harga_satuan_ba: float | None = None,
) -> float:
    """Nilai pokok per BA. Harga diambil dari BA (dinamis per transaksi)."""
    kontrak_volume = float(kontrak.volume or 0.0)
    harga = float(harga_satuan_ba if harga_satuan_ba is not None else (kontrak.harga_satuan or 0.0))
    premi = float(kontrak.premi or 0.0)
    pokok_ba = float(volume_ba) * harga
    if kontrak_volume > 0 and premi > 0:
        pokok_ba += premi * (float(volume_ba) / kontrak_volume)
    elif kontrak_volume <= 0 and premi > 0:
        pokok_ba += premi
    return pokok_ba


def calculate_ba_invoice_amount(
    kontrak: models.Kontrak,
    volume_ba: float,
    harga_satuan_ba: float | None = None,
) -> int:
    pokok_ba = calculate_ba_pokok(kontrak, volume_ba, harga_satuan_ba)
    ppn_val = 0.0
    if str(getattr(kontrak, "is_ppn", "true")).lower() == "true":
        ppn_val = pokok_ba * (float(kontrak.ppn_persen or 0.0) / 100)
    return round(pokok_ba + ppn_val)


def get_total_ba_volume(db: Session, no_kontrak: str, exclude_no_ba: str | None = None) -> float:
    q = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_kontrak == no_kontrak)
    if exclude_no_ba:
        q = q.filter(models.BeritaAcara.no_ba != exclude_no_ba)
    return sum(float(ba.volume_ba or 0) for ba in q.all())


def validate_ba_volume_quota(
    db: Session,
    kontrak: models.Kontrak,
    volume_ba: float,
    exclude_no_ba: str | None = None,
) -> None:
    kontrak_volume = float(kontrak.volume or 0.0)
    if kontrak_volume <= 0:
        return
    total_existing = get_total_ba_volume(db, kontrak.no_kontrak, exclude_no_ba)
    if total_existing + float(volume_ba) > kontrak_volume:
        sisa = kontrak_volume - total_existing
        raise ValueError(
            f"Total volume BA ({total_existing + volume_ba:,.0f}) melebihi volume kontrak "
            f"({kontrak_volume:,.0f}). Sisa kuota: {sisa:,.0f}"
        )


def get_ba_for_entity(db: Session, no_ba: str | None) -> models.BeritaAcara | None:
    if not no_ba:
        return None
    return db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == no_ba).first()