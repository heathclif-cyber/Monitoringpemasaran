"""Stok ledger helpers — saldo, validasi, integrasi DO."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models

FIXED_MATERIALS = [
    "TBS (TANDAN BUAH SEGAR)",
    "Lump",
    "TH BR CR 3X",
    "TH BR CR 3X HITAM",
    "GULA GAPOKTAN",
    "Gula Kemasan 50 KG Milik PG",
    "KELAPA KUPAS",
    "KELAPA BUTIR",
    "Kopra",
    "SAPI PEJANTAN AFKIR",
    "CPO",
]

FIXED_UNITS = [
    "Minahasa-Halmahera",
    "Beteleme",
    "Awaya-Telpaputih",
    "Takalar",
    "Camming",
    "Kabaru",
]


def resolve_unit_from_do(
    do: models.DeliveryOrder,
    invoice: Optional[models.Invoice],
    kontrak: Optional[models.Kontrak],
) -> str:
    if do.kepada_unit and do.kepada_unit.strip():
        return do.kepada_unit.strip()
    if invoice and invoice.nama_unit:
        return invoice.nama_unit.strip()
    if kontrak and kontrak.kebun_produsen:
        return kontrak.kebun_produsen.strip()
    if kontrak and kontrak.units:
        return kontrak.units[0].nama_unit or ""
    return ""


def resolve_material_from_kontrak(
    kontrak: Optional[models.Kontrak],
    unit_name: Optional[str] = None,
) -> str:
    if not kontrak:
        return ""
    if unit_name and kontrak.units:
        matched = next((u for u in kontrak.units if u.nama_unit == unit_name), None)
        if matched and matched.jenis_komoditi:
            return matched.jenis_komoditi
    return kontrak.jenis_komoditi or kontrak.deskripsi_produk or ""


def resolve_satuan_from_kontrak(
    kontrak: Optional[models.Kontrak],
    unit_name: Optional[str] = None,
) -> str:
    if not kontrak:
        return "Kg"
    if unit_name and kontrak.units:
        matched = next((u for u in kontrak.units if u.nama_unit == unit_name), None)
        if matched and matched.satuan:
            return matched.satuan
    return kontrak.satuan or "Kg"


def resolve_do_stock_context(
    do: models.DeliveryOrder,
    invoice: Optional[models.Invoice],
    kontrak: Optional[models.Kontrak],
) -> dict:
    unit = resolve_unit_from_do(do, invoice, kontrak)
    material = resolve_material_from_kontrak(kontrak, unit or None)
    satuan = resolve_satuan_from_kontrak(kontrak, unit or None)
    volume = float(do.volume_do or 0)
    return {
        "unit": unit,
        "jenis_material": material,
        "satuan": satuan,
        "volume": volume,
    }


def get_saldo(
    db: Session,
    unit: str,
    jenis_material: str,
    satuan: str,
    *,
    as_of: Optional[date] = None,
    exclude_referensi_id: Optional[str] = None,
) -> float:
    """Saldo per tanggal: stok masuk s/d as_of dikurangi DO/keluar s/d as_of."""
    cutoff = as_of or date.today()
    masuk_q = db.query(models.StokLedger).filter(
        models.StokLedger.unit == unit,
        models.StokLedger.jenis_material == jenis_material,
        models.StokLedger.satuan == satuan,
        models.StokLedger.arah == "MASUK",
        models.StokLedger.tanggal <= cutoff,
    )
    keluar_q = db.query(models.StokLedger).filter(
        models.StokLedger.unit == unit,
        models.StokLedger.jenis_material == jenis_material,
        models.StokLedger.satuan == satuan,
        models.StokLedger.arah == "KELUAR",
        models.StokLedger.tanggal <= cutoff,
    )
    if exclude_referensi_id:
        keluar_q = keluar_q.filter(
            (models.StokLedger.referensi_id != exclude_referensi_id)
            | (models.StokLedger.referensi_id.is_(None))
        )
    masuk = sum(float(r.volume or 0) for r in masuk_q.all())
    keluar = sum(float(r.volume or 0) for r in keluar_q.all())
    return masuk - keluar


def validate_stok_cukup(
    db: Session,
    ctx: dict,
    *,
    as_of: Optional[date] = None,
    exclude_referensi_id: Optional[str] = None,
) -> None:
    if ctx["volume"] <= 0:
        return
    cutoff = as_of or date.today()
    saldo = get_saldo(
        db,
        ctx["unit"],
        ctx["jenis_material"],
        ctx["satuan"],
        as_of=cutoff,
        exclude_referensi_id=exclude_referensi_id,
    )
    needed = ctx["volume"]
    if saldo < needed:
        tgl = cutoff.strftime("%d/%m/%Y")
        raise HTTPException(
            status_code=400,
            detail=(
                f"Stok tidak cukup per tanggal {tgl}: {ctx['unit']} / {ctx['jenis_material']} "
                f"tersedia {saldo:,.0f} {ctx['satuan']}, dibutuhkan {needed:,.0f} {ctx['satuan']}"
            ),
        )


def reverse_stok_do(db: Session, no_do: str) -> None:
    db.query(models.StokLedger).filter(
        models.StokLedger.sumber == "do",
        models.StokLedger.referensi_id == no_do,
    ).delete(synchronize_session=False)


def record_stok_keluar_do(
    db: Session,
    do: models.DeliveryOrder,
    ctx: dict,
) -> None:
    reverse_stok_do(db, do.no_do)
    if ctx["volume"] <= 0:
        return
    db.add(
        models.StokLedger(
            tanggal=do.tanggal_do,
            unit=ctx["unit"],
            jenis_material=ctx["jenis_material"],
            volume=ctx["volume"],
            satuan=ctx["satuan"],
            arah="KELUAR",
            sumber="do",
            referensi_id=do.no_do,
            catatan=f"DO {do.no_do}",
        )
    )


def backfill_stok_from_dos(db: Session) -> dict:
    """Buat entri KELUAR untuk DO yang sudah ada sebelum fitur stok diaktifkan."""
    from sqlalchemy.orm import joinedload

    existing_refs = {
        r[0]
        for r in db.query(models.StokLedger.referensi_id)
        .filter(
            models.StokLedger.sumber == "do",
            models.StokLedger.referensi_id.isnot(None),
        )
        .all()
        if r[0]
    }

    dos = (
        db.query(models.DeliveryOrder)
        .options(
            joinedload(models.DeliveryOrder.invoice)
            .joinedload(models.Invoice.kontrak)
            .joinedload(models.Kontrak.units),
        )
        .all()
    )

    created = 0
    skipped = 0
    for do in dos:
        if do.no_do in existing_refs:
            skipped += 1
            continue
        invoice = do.invoice
        kontrak = invoice.kontrak if invoice else None
        if not kontrak:
            skipped += 1
            continue
        ctx = resolve_do_stock_context(do, invoice, kontrak)
        if not ctx["unit"] or not ctx["jenis_material"] or ctx["volume"] <= 0:
            skipped += 1
            continue
        record_stok_keluar_do(db, do, ctx)
        created += 1

    if created:
        db.commit()

    return {"created": created, "skipped": skipped, "total_dos": len(dos)}


def list_distinct_materials(db: Session) -> list[str]:
    values: set[str] = set(FIXED_MATERIALS)
    for (val,) in db.query(models.StokLedger.jenis_material).distinct().all():
        if val and val.strip():
            values.add(val.strip())
    for (val,) in db.query(models.KontrakUnit.jenis_komoditi).distinct().all():
        if val and val.strip():
            values.add(val.strip())
    for (val,) in db.query(models.Kontrak.jenis_komoditi).distinct().all():
        if val and val.strip():
            values.add(val.strip())
    return sorted(values)