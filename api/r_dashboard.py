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
        from sqlalchemy.orm import joinedload
        
        # Base queries (Pisahkan DO berdasarkan tanggal yang sesuai)
        do_transfer_col = func.coalesce(models.DeliveryOrder.tanggal_pembayaran, models.DeliveryOrder.tanggal_do)
        base_do_cash = db.query(models.DeliveryOrder).filter(func.extract('year', do_transfer_col) == year)
        
        do_rencana_col = func.coalesce(models.DeliveryOrder.rencana_pengambilan, models.DeliveryOrder.tanggal_do)
        base_do_pend = db.query(models.DeliveryOrder).filter(func.extract('year', do_rencana_col) == year)
        
        base_invoice = db.query(models.Invoice).filter(func.extract('year', models.Invoice.tanggal_transaksi) == year)
        base_bypass = db.query(models.LaporanBypass).filter(func.extract('year', models.LaporanBypass.tanggal) == year)
        base_kontrak = db.query(models.Kontrak).filter(func.extract('year', models.Kontrak.tanggal_kontrak) == year)

        # Filters (Unit & Komoditi)
        if unit != "ALL":
            base_do_cash = base_do_cash.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit)))
            base_do_pend = base_do_pend.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit)))
            base_invoice = base_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit))
            base_bypass = base_bypass.filter(models.LaporanBypass.unit == unit)
            base_kontrak = base_kontrak.filter(models.Kontrak.kebun_produsen == unit)

        if komoditi != "ALL":
            base_do_cash = base_do_cash.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi)))
            base_do_pend = base_do_pend.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi)))
            base_invoice = base_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi))
            base_bypass = base_bypass.filter(models.LaporanBypass.komoditi == komoditi)
            base_kontrak = base_kontrak.filter(models.Kontrak.komoditi == komoditi)

        # Inisialisasi Map
        pend_m = {f"{i:02d}": 0.0 for i in range(1, 13)}
        inv_m  = {f"{i:02d}": 0.0 for i in range(1, 13)}
        cash_m = {f"{i:02d}": 0.0 for i in range(1, 13)}
        kom_map = {}
        unit_map = {}
        
        # Pisahkan volume chart per bulan
        vol_m_kg = {f"{i:02d}": 0.0 for i in range(1, 13)}
        vol_m_butir = {f"{i:02d}": 0.0 for i in range(1, 13)}
        
        total_pendapatan = 0.0
        total_cash_in = 0.0
        total_volume_kg = 0.0
        total_volume_butir = 0.0
        total_nilai_invoice = 0.0
        
        # 1. ACCRUAL (Pendapatan & Volume)
        dos_pend = base_do_pend.options(joinedload(models.DeliveryOrder.invoice).joinedload(models.Invoice.kontrak)).all()
        for do in dos_pend:
            k = do.invoice.kontrak
            do_vol = float(do.volume_do or 0)
            k_vol = float(k.volume or 0)
            k_nilai = float(k.nilai_transaksi or 0)
            if k_nilai <= 0: k_nilai = (k_vol * float(k.harga_satuan or 0)) + float(k.premi or 0)
            
            pendapatan_do = k_nilai * (do_vol / k_vol) if k_vol > 0 else k_nilai
            
            satuan = (k.satuan or "Kg").lower()
            if satuan == "butir":
                total_volume_butir += do_vol
            else:
                total_volume_kg += do_vol
            
            total_pendapatan += pendapatan_do
            
            m = do.rencana_pengambilan.month if do.rencana_pengambilan else do.tanggal_do.month if do.tanggal_do else 1
            pend_m[f"{m:02d}"] += pendapatan_do
            
            if satuan == "butir":
                vol_m_butir[f"{m:02d}"] += do_vol
            else:
                vol_m_kg[f"{m:02d}"] += do_vol
            
            kom = k.komoditi or "Lainnya"
            unt = k.kebun_produsen or "Lainnya"
            kom_map[kom] = kom_map.get(kom, 0) + pendapatan_do
            unit_map[unt] = unit_map.get(unt, 0) + pendapatan_do

        # 2. CASH IN
        dos_cash = base_do_cash.all()
        for do in dos_cash:
            nom = float(do.nominal_transfer or 0)
            total_cash_in += nom
            m = do.tanggal_pembayaran.month if do.tanggal_pembayaran else do.tanggal_do.month if do.tanggal_do else 1
            cash_m[f"{m:02d}"] += nom

        # 3. INVOICES
        invoices = base_invoice.all()
        for inv in invoices:
            nom = float(inv.jumlah_pembayaran or 0)
            total_nilai_invoice += nom
            m = inv.tanggal_transaksi.month if inv.tanggal_transaksi else 1
            inv_m[f"{m:02d}"] += nom

        # 4. BYPASS (Berlaku untuk semua)
        bypasses = base_bypass.all()
        for b in bypasses:
            nom = float(b.nominal or 0)
            vol = float(b.volume or 0)
            m = b.tanggal.month if b.tanggal else 1
            
            total_pendapatan += nom
            total_cash_in += nom
            total_nilai_invoice += nom
            
            satuan = (b.satuan or "Kg").lower()
            if satuan == "butir":
                total_volume_butir += vol
            else:
                total_volume_kg += vol
            
            pend_m[f"{m:02d}"] += nom
            cash_m[f"{m:02d}"] += nom
            inv_m[f"{m:02d}"] += nom
            
            if satuan == "butir":
                vol_m_butir[f"{m:02d}"] += vol
            else:
                vol_m_kg[f"{m:02d}"] += vol
            
            kom = b.komoditi or "Lainnya"
            unt = b.unit or "Lainnya"
            kom_map[kom] = kom_map.get(kom, 0) + nom
            unit_map[unt] = unit_map.get(unt, 0) + nom
            
        # Get count for summary
        total_do_count = len(dos_pend) + len(bypasses)
        total_invoice_count = len(invoices)
        total_kontrak = int(base_kontrak.count())

        d_ids = base_do_cash.with_entities(models.DeliveryOrder.no_do)
        b_ids = base_bypass.with_entities(models.LaporanBypass.id)

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
                "total_invoice": total_invoice_count,
                "total_do": total_do_count,
                "total_pendapatan": total_pendapatan,
                "total_nilai_invoice": total_nilai_invoice,
                "total_cash_in": total_cash_in,
                "total_volume_kg": total_volume_kg,
                "total_volume_butir": total_volume_butir,
                "sap_stats": {
                    "missing_kontrak": int(
                        (db.query(func.count(models.DeliveryOrder.no_do)).filter(models.DeliveryOrder.no_do.in_(d_ids), (models.DeliveryOrder.kontrak_sap == None) | (models.DeliveryOrder.kontrak_sap == '')).scalar() or 0)
                        + (db.query(func.count(models.LaporanBypass.id)).filter(models.LaporanBypass.id.in_(b_ids), (models.LaporanBypass.kontrak_sap == None) | (models.LaporanBypass.kontrak_sap == '')).scalar() or 0)
                    ),
                    "missing_so": int(
                        (db.query(func.count(models.DeliveryOrder.no_do)).filter(models.DeliveryOrder.no_do.in_(d_ids), (models.DeliveryOrder.so_sap == None) | (models.DeliveryOrder.so_sap == '')).scalar() or 0)
                        + (db.query(func.count(models.LaporanBypass.id)).filter(models.LaporanBypass.id.in_(b_ids), (models.LaporanBypass.so_sap == None) | (models.LaporanBypass.so_sap == '')).scalar() or 0)
                    ),
                    "missing_do": int(
                        (db.query(func.count(models.DeliveryOrder.no_do)).filter(models.DeliveryOrder.no_do.in_(d_ids), (models.DeliveryOrder.do_sap == None) | (models.DeliveryOrder.do_sap == '')).scalar() or 0)
                        + (db.query(func.count(models.LaporanBypass.id)).filter(models.LaporanBypass.id.in_(b_ids), (models.LaporanBypass.do_sap == None) | (models.LaporanBypass.do_sap == '')).scalar() or 0)
                    ),
                    "missing_billing": int(
                        (db.query(func.count(models.DeliveryOrder.no_do)).filter(models.DeliveryOrder.no_do.in_(d_ids), (models.DeliveryOrder.billing_sap == None) | (models.DeliveryOrder.billing_sap == '')).scalar() or 0)
                        + (db.query(func.count(models.LaporanBypass.id)).filter(models.LaporanBypass.id.in_(b_ids), (models.LaporanBypass.billing_sap == None) | (models.LaporanBypass.billing_sap == '')).scalar() or 0)
                    ),
                }
            },
            "charts": {
                "komoditas": {"labels": list(kom_map.keys()), "values": list(kom_map.values())},
                "unit": {"labels": list(unit_map.keys()), "values": list(unit_map.values())},
                "bulanan": {
                    "labels": ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"],
                    "pendapatan": [pend_m[f"{i:02d}"] for i in range(1, 13)],
                    "invoice": [inv_m[f"{i:02d}"] for i in range(1, 13)],
                    "cashin": [cash_m[f"{i:02d}"] for i in range(1, 13)],
                    "volume_kg": [vol_m_kg[f"{i:02d}"] for i in range(1, 13)],
                    "volume_butir": [vol_m_butir[f"{i:02d}"] for i in range(1, 13)],
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
