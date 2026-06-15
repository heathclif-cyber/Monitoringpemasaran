from fastapi import APIRouter, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

import models
from database import SessionLocal
from services.cache import api_cache
from services.unit_utils import normalize_unit_name, unit_filter_variants


def _sorted_chart(map_dict: dict) -> dict:
    items = sorted(map_dict.items(), key=lambda x: x[1], reverse=True)
    return {"labels": [k for k, _ in items], "values": [v for _, v in items]}


def _resolve_do_unit(do, k) -> str:
    unt = ""
    if getattr(do, "kepada_unit", None):
        unt = do.kepada_unit
    if not unt and do.invoice and do.invoice.nama_unit:
        unt = do.invoice.nama_unit
    if not unt:
        unt = k.kebun_produsen or ""
    if not unt and hasattr(k, "units") and k.units:
        unt = k.units[0].nama_unit or ""
    normalized = normalize_unit_name(unt)
    return normalized or "Lainnya"


def _collect_available_units(db) -> list[str]:
    units: set[str] = set()
    for col in (
        models.Kontrak.kebun_produsen,
        models.LaporanBypass.unit,
        models.Invoice.nama_unit,
        models.DeliveryOrder.kepada_unit,
    ):
        for r in db.query(col).distinct().all():
            n = normalize_unit_name(r[0])
            if n:
                units.add(n)
    return sorted(units)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("")
def get_dashboard_data(
    year: int = Query(default=2026, description="Tahun filter"),
    unit: str = Query(default="ALL", description="Filter by unit (kebun_produsen)"),
    komoditi: str = Query(default="ALL", description="Filter by komoditi"),
):
    cache_key = f"dashboard:{year}:{unit}:{komoditi}"
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    db = SessionLocal()
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

        # Filters (Unit & Komoditi) — unit selaras dengan agregasi chart (DO/invoice/kontrak)
        if unit != "ALL":
            variants = unit_filter_variants(unit)
            unit_do_filter = or_(
                models.DeliveryOrder.kepada_unit.in_(variants),
                models.DeliveryOrder.invoice.has(
                    or_(
                        models.Invoice.nama_unit.in_(variants),
                        models.Invoice.kontrak.has(models.Kontrak.kebun_produsen.in_(variants)),
                    )
                ),
            )
            unit_inv_filter = or_(
                models.Invoice.nama_unit.in_(variants),
                models.Invoice.kontrak.has(models.Kontrak.kebun_produsen.in_(variants)),
            )
            base_do_cash = base_do_cash.filter(unit_do_filter)
            base_do_pend = base_do_pend.filter(unit_do_filter)
            base_invoice = base_invoice.filter(unit_inv_filter)
            base_bypass = base_bypass.filter(models.LaporanBypass.unit.in_(variants))
            base_kontrak = base_kontrak.filter(models.Kontrak.kebun_produsen.in_(variants))

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
        sap_m  = {f"{i:02d}": {"missing_kontrak": 0, "missing_so": 0, "missing_do": 0, "missing_billing": 0} for i in range(1, 13)}
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
        dos_pend = base_do_pend.options(
            joinedload(models.DeliveryOrder.invoice)
            .joinedload(models.Invoice.kontrak)
            .joinedload(models.Kontrak.units)
        ).all()
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

            sk = f"{m:02d}"
            if not (do.kontrak_sap or '').strip(): sap_m[sk]["missing_kontrak"] += 1
            if not (do.so_sap or '').strip():      sap_m[sk]["missing_so"] += 1
            if not (do.do_sap or '').strip():      sap_m[sk]["missing_do"] += 1
            if not (do.billing_sap or '').strip(): sap_m[sk]["missing_billing"] += 1
            
            if satuan == "butir":
                vol_m_butir[f"{m:02d}"] += do_vol
            else:
                vol_m_kg[f"{m:02d}"] += do_vol
            
            kom = k.komoditi or "Lainnya"
            unt = _resolve_do_unit(do, k)
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

            bk = f"{m:02d}"
            if not (b.kontrak_sap or '').strip(): sap_m[bk]["missing_kontrak"] += 1
            if not (b.so_sap or '').strip():      sap_m[bk]["missing_so"] += 1
            if not (b.do_sap or '').strip():      sap_m[bk]["missing_do"] += 1
            if not (b.billing_sap or '').strip(): sap_m[bk]["missing_billing"] += 1
            
            if satuan == "butir":
                vol_m_butir[f"{m:02d}"] += vol
            else:
                vol_m_kg[f"{m:02d}"] += vol
            
            kom = b.komoditi or "Lainnya"
            unt = normalize_unit_name(b.unit) or "Lainnya"
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

        avail_u = _collect_available_units(db)

        k_k = set(str(r[0]) for r in db.query(models.Kontrak.komoditi).distinct().all() if r[0] and r[0] != "-")
        k_b = set(str(r[0]) for r in db.query(models.LaporanBypass.komoditi).distinct().all() if r[0] and r[0] != "-")
        avail_k = sorted(list(k_k | k_b))

        result = {
            "summary": {
                "total_kontrak": total_kontrak,
                "total_invoice": total_invoice_count,
                "total_do": total_do_count,
                "total_pendapatan": total_pendapatan,
                "total_nilai_invoice": total_nilai_invoice,
                "total_cash_in": total_cash_in,
                "total_volume_all": total_volume_kg + total_volume_butir,
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
                "komoditas": _sorted_chart(kom_map),
                "unit": _sorted_chart(unit_map),
                "bulanan": {
                    "labels": ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"],
                    "pendapatan": [pend_m[f"{i:02d}"] for i in range(1, 13)],
                    "invoice": [inv_m[f"{i:02d}"] for i in range(1, 13)],
                    "cashin": [cash_m[f"{i:02d}"] for i in range(1, 13)],
                    "volume_kg": [vol_m_kg[f"{i:02d}"] for i in range(1, 13)],
                    "volume_butir": [vol_m_butir[f"{i:02d}"] for i in range(1, 13)],
                },
                "sap_bulanan": {
                    "labels": ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"],
                    "missing_kontrak": [sap_m[f"{i:02d}"]["missing_kontrak"] for i in range(1, 13)],
                    "missing_so":      [sap_m[f"{i:02d}"]["missing_so"]      for i in range(1, 13)],
                    "missing_do":      [sap_m[f"{i:02d}"]["missing_do"]      for i in range(1, 13)],
                    "missing_billing": [sap_m[f"{i:02d}"]["missing_billing"] for i in range(1, 13)],
                }
            },
            "available_years": avail_y,
            "selected_year": int(year),
            "available_units": avail_u,
            "selected_unit": str(unit),
            "available_komoditas": avail_k,
            "selected_komoditi": str(komoditi),
        }
        api_cache.set(cache_key, result)
        return result

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"error": str(e)}
    finally:
        db.close()
