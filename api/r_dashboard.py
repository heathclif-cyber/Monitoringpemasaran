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
    try:
        # --- Base filters ---
        # PostgreSQL extract returns a float/numeric, comparing with int is usually fine
        # but let's be explicit and cast or handle types carefully.
        
        # Base queries
        q_kontrak = db.query(models.Kontrak).filter(func.extract('year', models.Kontrak.tanggal_kontrak) == year)
        q_invoice = db.query(models.Invoice).filter(func.extract('year', models.Invoice.tanggal_transaksi) == year)
        q_do = db.query(models.DeliveryOrder).filter(func.extract('year', models.DeliveryOrder.tanggal_do) == year)
        q_b = db.query(models.LaporanBypass).filter(func.extract('year', models.LaporanBypass.tanggal) == year)

        # Apply Unit filter
        if unit != "ALL":
            q_kontrak = q_kontrak.filter(models.Kontrak.kebun_produsen == unit)
            q_invoice = q_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit))
            q_do = q_do.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit)))
            q_b = q_b.filter(models.LaporanBypass.unit == unit)

        # Apply Komoditi filter
        if komoditi != "ALL":
            q_kontrak = q_kontrak.filter(models.Kontrak.komoditi == komoditi)
            q_invoice = q_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi))
            q_do = q_do.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi)))
            q_b = q_b.filter(models.LaporanBypass.komoditi == komoditi)

        # --- Aggregations ---
        total_kontrak = q_kontrak.count()
        total_invoice = q_invoice.count()
        total_do = q_do.count() + q_b.count()

        # Sum values
        kontrak_ids = q_kontrak.with_entities(models.Kontrak.no_kontrak)
        invoice_ids = q_invoice.with_entities(models.Invoice.no_invoice)
        do_ids = q_do.with_entities(models.DeliveryOrder.no_do)
        bypass_ids = q_b.with_entities(models.LaporanBypass.id)

        sum_kontrak = db.query(func.sum(models.Kontrak.nilai_transaksi)).filter(models.Kontrak.no_kontrak.in_(kontrak_ids)).scalar() or 0.0
        sum_bypass = db.query(func.sum(models.LaporanBypass.nominal)).filter(models.LaporanBypass.id.in_(bypass_ids)).scalar() or 0.0
        total_nilai_transaksi = sum_kontrak + sum_bypass

        sum_invoice = db.query(func.sum(models.Invoice.jumlah_pembayaran)).filter(models.Invoice.no_invoice.in_(invoice_ids)).scalar() or 0.0
        total_nilai_invoice = sum_invoice + sum_bypass

        sum_do = db.query(func.sum(models.DeliveryOrder.nominal_transfer)).filter(models.DeliveryOrder.no_do.in_(do_ids)).scalar() or 0.0
        total_cash_in = sum_do + sum_bypass

        # --- Charts: Komoditas ---
        kom_q = db.query(models.Kontrak.komoditi, func.sum(models.Kontrak.volume)).filter(models.Kontrak.no_kontrak.in_(kontrak_ids)).group_by(models.Kontrak.komoditi).all()
        kom_b_q = db.query(models.LaporanBypass.komoditi, func.count()).filter(models.LaporanBypass.id.in_(bypass_ids)).group_by(models.LaporanBypass.komoditi).all()
        
        komod_map = {}
        for k, v in kom_q: komod_map[k] = float(v or 0)
        for k, v in kom_b_q: komod_map[k] = komod_map.get(k, 0) + float(v or 0)

        # --- Charts: Unit ---
        unit_q = db.query(models.Kontrak.kebun_produsen, func.sum(models.Kontrak.nilai_transaksi)).filter(models.Kontrak.no_kontrak.in_(kontrak_ids)).group_by(models.Kontrak.kebun_produsen).all()
        unit_b_q = db.query(models.LaporanBypass.unit, func.sum(models.LaporanBypass.nominal)).filter(models.LaporanBypass.id.in_(bypass_ids)).group_by(models.LaporanBypass.unit).all()
        
        unit_map = {}
        for k, v in unit_q: unit_map[k] = float(v or 0)
        for k, v in unit_b_q: unit_map[k] = unit_map.get(k, 0) + float(v or 0)

        # --- Charts: Monthly (Extract Month) ---
        # We need to make sure we treat bulan as int or string correctly
        pendapatan_map = {f"{i:02d}": 0.0 for i in range(1, 13)}
        invoice_map   = {f"{i:02d}": 0.0 for i in range(1, 13)}
        cashin_map    = {f"{i:02d}": 0.0 for i in range(1, 13)}

        # Contract results
        mk_q = db.query(func.extract('month', models.Kontrak.tanggal_kontrak), func.sum(models.Kontrak.nilai_transaksi)).filter(models.Kontrak.no_kontrak.in_(kontrak_ids)).group_by(func.extract('month', models.Kontrak.tanggal_kontrak)).all()
        for month_num, total in mk_q:
            if month_num is not None:
                pendapatan_map[f"{int(month_num):02d}"] += float(total or 0)

        # Bypass results
        mb_q = db.query(func.extract('month', models.LaporanBypass.tanggal), func.sum(models.LaporanBypass.nominal)).filter(models.LaporanBypass.id.in_(bypass_ids)).group_by(func.extract('month', models.LaporanBypass.tanggal)).all()
        for month_num, total in mb_q:
            if month_num is not None:
                m_key = f"{int(month_num):02d}"
                pendapatan_map[m_key] += float(total or 0)
                invoice_map[m_key] += float(total or 0)
                cashin_map[m_key] += float(total or 0)

        # Invoice results
        mi_q = db.query(func.extract('month', models.Invoice.tanggal_transaksi), func.sum(models.Invoice.jumlah_pembayaran)).filter(models.Invoice.no_invoice.in_(invoice_ids)).group_by(func.extract('month', models.Invoice.tanggal_transaksi)).all()
        for month_num, total in mi_q:
            if month_num is not None:
                invoice_map[f"{int(month_num):02d}"] += float(total or 0)

        # DO results
        md_q = db.query(func.extract('month', models.DeliveryOrder.tanggal_do), func.sum(models.DeliveryOrder.nominal_transfer)).filter(models.DeliveryOrder.no_do.in_(do_ids)).group_by(func.extract('month', models.DeliveryOrder.tanggal_do)).all()
        for month_num, total in md_q:
            if month_num is not None:
                cashin_map[f"{int(month_num):02d}"] += float(total or 0)

        # --- Filters Data ---
        available_years = db.query(func.extract('year', models.Kontrak.tanggal_kontrak)).distinct().all()
        available_years = sorted([int(y[0]) for y in available_years if y[0]], reverse=True)
        if year not in available_years: available_years.append(year)
        available_years = sorted(list(set(available_years)), reverse=True)

        available_units = db.query(models.Kontrak.kebun_produsen).distinct().all()
        available_units = sorted([u[0] for u in available_units if u[0] and u[0] != "-"])

        available_komoditas = db.query(models.Kontrak.komoditi).distinct().all()
        available_komoditas = sorted([k[0] for k in available_komoditas if k[0] and k[0] != "-"])

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
                "komoditas": {"labels": list(komod_map.keys()), "values": list(komod_map.values())},
                "unit": {"labels": list(unit_map.keys()), "values": list(unit_map.values())},
                "bulanan": {
                    "labels": ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"],
                    "pendapatan": [pendapatan_map[f"{i:02d}"] for i in range(1, 13)],
                    "invoice": [invoice_map[f"{i:02d}"] for i in range(1, 13)],
                    "cashin": [cashin_map[f"{i:02d}"] for i in range(1, 13)],
                }
            },
            "available_years": available_years,
            "selected_year": year,
            "available_units": available_units,
            "selected_unit": unit,
            "available_komoditas": available_komoditas,
            "selected_komoditi": komoditi,
        }

    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(f"DASHBOARD ERROR: {error_msg}")
        # Return the error in the response so we can see it in the browser console
        return {"error": str(e), "traceback": error_msg}
