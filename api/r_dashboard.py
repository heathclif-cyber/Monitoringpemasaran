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
        # Base queries for filtering
        base_kontrak = db.query(models.Kontrak).filter(func.extract('year', models.Kontrak.tanggal_kontrak) == year)
        base_invoice = db.query(models.Invoice).filter(func.extract('year', models.Invoice.tanggal_transaksi) == year)
        base_do = db.query(models.DeliveryOrder).filter(func.extract('year', models.DeliveryOrder.tanggal_do) == year)
        base_bypass = db.query(models.LaporanBypass).filter(func.extract('year', models.LaporanBypass.tanggal) == year)

        if unit != "ALL":
            base_kontrak = base_kontrak.filter(models.Kontrak.kebun_produsen == unit)
            base_invoice = base_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit))
            base_do = base_do.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit)))
            base_bypass = base_bypass.filter(models.LaporanBypass.unit == unit)

        if komoditi != "ALL":
            base_kontrak = base_kontrak.filter(models.Kontrak.komoditi == komoditi)
            base_invoice = base_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi))
            base_do = base_do.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi)))
            base_bypass = base_bypass.filter(models.LaporanBypass.komoditi == komoditi)

        # 1. Summary Metrics
        total_kontrak = int(base_kontrak.count())
        total_invoice = int(base_invoice.count())
        total_do_count = int(base_do.count() + base_bypass.count())

        # Subqueries for sums
        k_ids = base_kontrak.with_entities(models.Kontrak.no_kontrak)
        i_ids = base_invoice.with_entities(models.Invoice.no_invoice)
        d_ids = base_do.with_entities(models.DeliveryOrder.no_do)
        b_ids = base_bypass.with_entities(models.LaporanBypass.id)

        sum_k = db.query(func.sum(models.Kontrak.nilai_transaksi)).filter(models.Kontrak.no_kontrak.in_(k_ids)).scalar() or 0
        sum_b = db.query(func.sum(models.LaporanBypass.nominal)).filter(models.LaporanBypass.id.in_(b_ids)).scalar() or 0
        total_nilai_transaksi = float(sum_k) + float(sum_b)

        sum_i = db.query(func.sum(models.Invoice.jumlah_pembayaran)).filter(models.Invoice.no_invoice.in_(i_ids)).scalar() or 0
        total_nilai_invoice = float(sum_i) + float(sum_b)

        sum_d = db.query(func.sum(models.DeliveryOrder.nominal_transfer)).filter(models.DeliveryOrder.no_do.in_(d_ids)).scalar() or 0
        total_cash_in = float(sum_d) + float(sum_b)

        # 2. Charts: Komoditas (Based on REALIZATION / DO)
        # We sum DeliveryOrder.nominal_transfer + LaporanBypass.nominal
        kom_res = db.query(
            models.Kontrak.komoditi, 
            func.sum(models.DeliveryOrder.nominal_transfer)
        ).select_from(models.DeliveryOrder)\
         .join(models.Invoice)\
         .join(models.Kontrak)\
         .filter(models.DeliveryOrder.no_do.in_(d_ids))\
         .group_by(models.Kontrak.komoditi).all()
         
        kom_b_res = db.query(models.LaporanBypass.komoditi, func.sum(models.LaporanBypass.nominal)).filter(models.LaporanBypass.id.in_(b_ids)).group_by(models.LaporanBypass.komoditi).all()
        
        kom_map = {}
        for k, v in kom_res: kom_map[str(k or "Lainnya")] = float(v or 0)
        for k, v in kom_b_res: 
            key = str(k or "Lainnya")
            kom_map[key] = kom_map.get(key, 0) + float(v or 0)

        # 3. Charts: Unit (Based on REALIZATION / DO)
        unit_res = db.query(
            models.Kontrak.kebun_produsen, 
            func.sum(models.DeliveryOrder.nominal_transfer)
        ).select_from(models.DeliveryOrder)\
         .join(models.Invoice)\
         .join(models.Kontrak)\
         .filter(models.DeliveryOrder.no_do.in_(d_ids))\
         .group_by(models.Kontrak.kebun_produsen).all()
         
        unit_b_res = db.query(models.LaporanBypass.unit, func.sum(models.LaporanBypass.nominal)).filter(models.LaporanBypass.id.in_(b_ids)).group_by(models.LaporanBypass.unit).all()
        
        unit_map = {}
        for k, v in unit_res: unit_map[str(k or "Lainnya")] = float(v or 0)
        for k, v in unit_b_res:
            key = str(k or "Lainnya")
            unit_map[key] = unit_map.get(key, 0) + float(v or 0)

        # 4. Charts: Monthly
        pend_m = {f"{i:02d}": 0.0 for i in range(1, 13)}
        inv_m  = {f"{i:02d}": 0.0 for i in range(1, 13)}
        cash_m = {f"{i:02d}": 0.0 for i in range(1, 13)}
        vol_m  = {f"{i:02d}": 0.0 for i in range(1, 13)}

        # Contract results (Pendapatan/Target)
        mk_res = db.query(func.extract('month', models.Kontrak.tanggal_kontrak), func.sum(models.Kontrak.nilai_transaksi)).filter(models.Kontrak.no_kontrak.in_(k_ids)).group_by(func.extract('month', models.Kontrak.tanggal_kontrak)).all()
        for m, s in mk_res:
            if m: pend_m[f"{int(m):02d}"] += float(s or 0)

        # DO results (Cash In & VOLUME REALIZATION)
        # Note: volume is taken from Kontrak but only for those that have been DO'd
        md_res = db.query(
            func.extract('month', models.DeliveryOrder.tanggal_do), 
            func.sum(models.DeliveryOrder.nominal_transfer),
            func.sum(models.Kontrak.volume)
        ).select_from(models.DeliveryOrder)\
         .join(models.Invoice)\
         .join(models.Kontrak)\
         .filter(models.DeliveryOrder.no_do.in_(d_ids))\
         .group_by(func.extract('month', models.DeliveryOrder.tanggal_do)).all()
         
        for m, s, v in md_res:
            if m:
                key = f"{int(m):02d}"
                cash_m[key] += float(s or 0)
                vol_m[key] += float(v or 0)

        # Bypass results
        mb_res = db.query(func.extract('month', models.LaporanBypass.tanggal), func.sum(models.LaporanBypass.nominal), func.sum(models.LaporanBypass.volume)).filter(models.LaporanBypass.id.in_(b_ids)).group_by(func.extract('month', models.LaporanBypass.tanggal)).all()
        for m, s, v in mb_res:
            if m:
                key = f"{int(m):02d}"
                f_val = float(s or 0)
                f_vol = float(v or 0)
                # For bypass, everything happens at once
                inv_m[key] += f_val; cash_m[key] += f_val
                vol_m[key] += f_vol

        # Invoice results
        mi_res = db.query(func.extract('month', models.Invoice.tanggal_transaksi), func.sum(models.Invoice.jumlah_pembayaran)).filter(models.Invoice.no_invoice.in_(i_ids)).group_by(func.extract('month', models.Invoice.tanggal_transaksi)).all()
        for m, s in mi_res:
            if m: inv_m[f"{int(m):02d}"] += float(s or 0)

        # 5. Filter lists
        y_q = db.query(func.extract('year', models.Kontrak.tanggal_kontrak)).distinct().all()
        avail_y = sorted([int(y[0]) for y in y_q if y[0]], reverse=True)
        if year not in avail_y: avail_y.insert(0, year)
        avail_y = sorted(list(set(avail_y)), reverse=True)

        u_k = set(str(r[0]) for r in db.query(models.Kontrak.kebun_produsen).distinct().all() if r[0] and r[0] != "-")
        u_b = set(str(r[0]) for r in db.query(models.LaporanBypass.unit).distinct().all() if r[0] and r[0] != "-")
        avail_u = sorted(list(u_k | u_b))

        k_k = set(str(r[0]) for r in db.query(models.Kontrak.komoditi).distinct().all() if r[0] and r[0] != "-")
        k_b = set(str(r[0]) for r in db.query(models.LaporanBypass.komoditi).distinct().all() if r[0] and r[0] != "-")
        avail_k = sorted(list(k_k | k_b))

        return {
            "summary": {
                "total_kontrak": total_kontrak,
                "total_invoice": total_invoice,
                "total_do": total_do_count,
                "total_nilai_transaksi": total_nilai_transaksi,
                "total_nilai_invoice": total_nilai_invoice,
                "total_cash_in": total_cash_in,
                "total_volume_realisasi": float(sum(vol_m.values())),
            },
            "charts": {
                "komoditas": {"labels": list(kom_map.keys()), "values": list(kom_map.values())},
                "unit": {"labels": list(unit_map.keys()), "values": list(unit_map.values())},
                "bulanan": {
                    "labels": ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"],
                    "pendapatan": [pend_m[f"{i:02d}"] for i in range(1, 13)],
                    "invoice": [inv_m[f"{i:02d}"] for i in range(1, 13)],
                    "cashin": [cash_m[f"{i:02d}"] for i in range(1, 13)],
                    "volume": [vol_m[f"{i:02d}"] for i in range(1, 13)],
                }
            },
            "available_years": avail_y,
            "selected_year": int(year),
            "available_units": avail_u,
            "selected_unit": str(unit),
            "available_komoditas": avail_k,
            "selected_komoditi": str(komoditi),
        }

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"error": str(e)}
