from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
from database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("")
def get_dashboard_data(
    year: int = Query(default=2026, description="Tahun filter"),
    unit: str = Query(default="ALL", description="Filter by unit (kebun_produsen)"),
    komoditi: str = Query(default="ALL", description="Filter by komoditi"),
    db: Session = Depends(get_db)
):
    year_str = str(year)

    # Base queries
    q_kontrak = db.query(models.Kontrak).filter(func.strftime("%Y", models.Kontrak.tanggal_kontrak) == year_str)
    q_invoice = db.query(models.Invoice).filter(func.strftime("%Y", models.Invoice.tanggal_transaksi) == year_str)
    q_do = db.query(models.DeliveryOrder).filter(func.strftime("%Y", models.DeliveryOrder.tanggal_do) == year_str)

    # Apply Unit filter if not ALL
    if unit != "ALL":
        q_kontrak = q_kontrak.filter(models.Kontrak.kebun_produsen == unit)
        q_invoice = q_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit))
        q_do = q_do.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit)))

    # Apply Komoditi filter if not ALL
    if komoditi != "ALL":
        q_kontrak = q_kontrak.filter(models.Kontrak.komoditi == komoditi)
        q_invoice = q_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi))
        q_do = q_do.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi)))

    # --- 1.2 Bypass Data (e.g. Sawit) ---
    q_b = db.query(models.LaporanBypass).filter(func.strftime("%Y", models.LaporanBypass.tanggal) == year_str)
    
    if unit != "ALL":
        q_b = q_b.filter(models.LaporanBypass.unit == unit)
    if komoditi != "ALL":
        q_b = q_b.filter(models.LaporanBypass.komoditi == komoditi)

    # --- Summary Cards Merging ---
    total_kontrak = q_kontrak.count()
    total_invoice = q_invoice.count()
    total_do = q_do.count() + q_b.count() # Count bypass as DOs for simplicity in summary

    # Calculate Sums
    total_nilai_transaksi = (db.query(func.sum(models.Kontrak.nilai_transaksi)).filter(
        models.Kontrak.no_kontrak.in_(q_kontrak.with_entities(models.Kontrak.no_kontrak))
    ).scalar() or 0.0) + (db.query(func.sum(models.LaporanBypass.nominal)).filter(
        models.LaporanBypass.id.in_(q_b.with_entities(models.LaporanBypass.id))
    ).scalar() or 0.0)

    total_nilai_invoice = (db.query(func.sum(models.Invoice.jumlah_pembayaran)).filter(
        models.Invoice.no_invoice.in_(q_invoice.with_entities(models.Invoice.no_invoice))
    ).scalar() or 0.0) + (db.query(func.sum(models.LaporanBypass.nominal)).filter(
        models.LaporanBypass.id.in_(q_b.with_entities(models.LaporanBypass.id))
    ).scalar() or 0.0)

    total_cash_in = (db.query(func.sum(models.DeliveryOrder.nominal_transfer)).filter(
        models.DeliveryOrder.no_do.in_(q_do.with_entities(models.DeliveryOrder.no_do))
    ).scalar() or 0.0) + (db.query(func.sum(models.LaporanBypass.nominal)).filter(
        models.LaporanBypass.id.in_(q_b.with_entities(models.LaporanBypass.id))
    ).scalar() or 0.0)

    # --- Portofolio Komoditas ---
    kom_q = db.query(
        models.Kontrak.komoditi,
        func.sum(models.Kontrak.volume).label("total_volume")
    ).filter(
        models.Kontrak.no_kontrak.in_(q_kontrak.with_entities(models.Kontrak.no_kontrak))
    ).group_by(models.Kontrak.komoditi).all()

    # Add bypass commodities (they have no volume field, count them as 1 volume per entry or 0?)
    # User might want bypass in charts. Let's add them.
    kom_b_q = db.query(
        models.LaporanBypass.komoditi,
        func.count(models.LaporanBypass.id).label("total_volume") # Use count since it's direct entries
    ).filter(
        models.LaporanBypass.id.in_(q_b.with_entities(models.LaporanBypass.id))
    ).group_by(models.LaporanBypass.komoditi).all()

    komod_map = {}
    for r in kom_q: komod_map[r.komoditi] = float(r.total_volume or 0)
    for r in kom_b_q: komod_map[r.komoditi] = komod_map.get(r.komoditi, 0) + float(r.total_volume or 0)

    komoditas_labels = list(komod_map.keys())
    komoditas_values = list(komod_map.values())

    # --- Pendapatan per Unit ---
    unit_q = db.query(
        models.Kontrak.kebun_produsen,
        func.sum(models.Kontrak.nilai_transaksi).label("total_revenue")
    ).filter(
        models.Kontrak.no_kontrak.in_(q_kontrak.with_entities(models.Kontrak.no_kontrak))
    ).group_by(models.Kontrak.kebun_produsen).all()

    unit_b_q = db.query(
        models.LaporanBypass.unit,
        func.sum(models.LaporanBypass.nominal).label("total_revenue")
    ).filter(
        models.LaporanBypass.id.in_(q_b.with_entities(models.LaporanBypass.id))
    ).group_by(models.LaporanBypass.unit).all()

    unit_map = {}
    for r in unit_q: unit_map[r.kebun_produsen] = float(r.total_revenue or 0)
    for r in unit_b_q: unit_map[r.unit] = unit_map.get(r.unit, 0) + float(r.total_revenue or 0)

    unit_labels = list(unit_map.keys())
    unit_values = list(unit_map.values())

    # --- Bulanan ---
    mk_q = db.query(
        func.strftime("%m", models.Kontrak.tanggal_kontrak).label("bulan"),
        func.sum(models.Kontrak.nilai_transaksi).label("total")
    ).filter(
        models.Kontrak.no_kontrak.in_(q_kontrak.with_entities(models.Kontrak.no_kontrak))
    ).group_by("bulan").all()

    mb_q = db.query(
        func.strftime("%m", models.LaporanBypass.tanggal).label("bulan"),
        func.sum(models.LaporanBypass.nominal).label("total")
    ).filter(
        models.LaporanBypass.id.in_(q_b.with_entities(models.LaporanBypass.id))
    ).group_by("bulan").all()

    mi_q = db.query(
        func.strftime("%m", models.Invoice.tanggal_transaksi).label("bulan"),
        func.sum(models.Invoice.jumlah_pembayaran).label("total")
    ).filter(
        models.Invoice.no_invoice.in_(q_invoice.with_entities(models.Invoice.no_invoice))
    ).group_by("bulan").all()

    md_q = db.query(
        func.strftime("%m", models.DeliveryOrder.tanggal_do).label("bulan"),
        func.sum(models.DeliveryOrder.nominal_transfer).label("total")
    ).filter(
        models.DeliveryOrder.no_do.in_(q_do.with_entities(models.DeliveryOrder.no_do))
    ).group_by("bulan").all()

    pendapatan_map = {f"{i:02d}": 0.0 for i in range(1, 13)}
    invoice_map   = {f"{i:02d}": 0.0 for i in range(1, 13)}
    cashin_map    = {f"{i:02d}": 0.0 for i in range(1, 13)}

    for r in mk_q: pendapatan_map[r.bulan] += float(r.total or 0)
    for r in mb_q: 
        pendapatan_map[r.bulan] += float(r.total or 0)
        invoice_map[r.bulan] += float(r.total or 0)
        cashin_map[r.bulan] += float(r.total or 0) # Bypass is instant cash-in

    for r in mi_q: invoice_map[r.bulan] += float(r.total or 0)
    for r in md_q: cashin_map[r.bulan] += float(r.total or 0)

    bulan_labels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"]
    bulan_pendapatan = [pendapatan_map[f"{i:02d}"] for i in range(1, 13)]
    bulan_invoice    = [invoice_map[f"{i:02d}"] for i in range(1, 13)]
    bulan_cashin     = [cashin_map[f"{i:02d}"] for i in range(1, 13)]

    # Available Filters Extension
    years_q = db.query(func.strftime("%Y", models.Kontrak.tanggal_kontrak).label("thn")).distinct().all()
    years_b = db.query(func.strftime("%Y", models.LaporanBypass.tanggal).label("thn")).distinct().all()
    available_years = sorted(set([int(r.thn) for r in (years_q + years_b) if r.thn]))

    units_q = db.query(models.Kontrak.kebun_produsen).distinct().all()
    units_b = db.query(models.LaporanBypass.unit).distinct().all()
    available_units = sorted(set([r[0] for r in (units_q + units_b) if r[0] and r[0] != "-"]))

    komod_q = db.query(models.Kontrak.komoditi).distinct().all()
    komod_b = db.query(models.LaporanBypass.komoditi).distinct().all()
    available_komoditas = sorted(set([r[0] for r in (komod_q + komod_b) if r[0] and r[0] != "-"]))

    return {
        "summary": {
            "total_kontrak": total_kontrak,
            "total_invoice": total_invoice,
            "total_do": total_do,
            "total_nilai_transaksi": total_nilai_transaksi,
            "total_nilai_invoice": total_nilai_invoice,
            "total_cash_in": total_cash_in,
        },
        "charts": {
            "komoditas": {
                "labels": komoditas_labels,
                "values": komoditas_values
            },
            "unit": {
                "labels": unit_labels,
                "values": unit_values
            },
            "bulanan": {
                "labels": bulan_labels,
                "pendapatan": bulan_pendapatan,
                "invoice": bulan_invoice,
                "cashin": bulan_cashin,
            }
        },
        "available_years": available_years,
        "selected_year": year,
        "available_units": list(available_units),
        "selected_unit": unit,
        "available_komoditas": list(available_komoditas),
        "selected_komoditi": komoditi,
    }
