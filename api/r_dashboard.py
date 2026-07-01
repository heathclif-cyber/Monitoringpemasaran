from fastapi import APIRouter, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
from database import SessionLocal
from services.cache import api_cache

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _sap_val(value) -> str:
    return (value or "").strip()


def _effective_sap(primary, fallback) -> str:
    """Nilai SAP efektif: DO (atau entitas utama) → fallback invoice."""
    return _sap_val(primary) or _sap_val(fallback)


def _sap_month_for_do(do, k, ba_buku_date) -> int:
    """Bulan SAP selaras dengan Laporan mode TRANSFER (default): tgl transfer → rencana → tgl DO."""
    if str(getattr(k, "tipe_alur", "STANDAR")).upper() == "PAYUNG_BA" and ba_buku_date:
        return ba_buku_date.month
    if do.tanggal_pembayaran:
        return do.tanggal_pembayaran.month
    if do.rencana_pengambilan:
        return do.rencana_pengambilan.month
    if do.tanggal_do:
        return do.tanggal_do.month
    return 1


def _sap_month_for_invoice(inv) -> int:
    """Invoice tanpa DO: tanggal pembayaran terakhir → tanggal transaksi."""
    pays = getattr(inv, "pembayaran", None) or []
    if pays:
        dated = [p for p in pays if p.tanggal_pembayaran]
        if dated:
            latest = max(dated, key=lambda p: p.tanggal_pembayaran)
            return latest.tanggal_pembayaran.month
    if inv.tanggal_transaksi:
        return inv.tanggal_transaksi.month
    return 1


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
        base_pembayaran_cash = db.query(models.Pembayaran).filter(
            func.extract('year', models.Pembayaran.tanggal_pembayaran) == year
        )
        
        do_rencana_col = func.coalesce(models.DeliveryOrder.rencana_pengambilan, models.DeliveryOrder.tanggal_do)
        base_do_pend = db.query(models.DeliveryOrder).filter(func.extract('year', do_rencana_col) == year)
        
        base_invoice = db.query(models.Invoice).filter(func.extract('year', models.Invoice.tanggal_transaksi) == year)
        base_bypass = db.query(models.LaporanBypass).filter(func.extract('year', models.LaporanBypass.tanggal) == year)
        base_kontrak = db.query(models.Kontrak).filter(func.extract('year', models.Kontrak.tanggal_kontrak) == year)

        # Filters (Unit & Komoditi)
        if unit != "ALL":
            base_pembayaran_cash = base_pembayaran_cash.filter(
                models.Pembayaran.invoice.has(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit))
            )
            base_do_pend = base_do_pend.filter(models.DeliveryOrder.invoice.has(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit)))
            base_invoice = base_invoice.filter(models.Invoice.kontrak.has(models.Kontrak.kebun_produsen == unit))
            base_bypass = base_bypass.filter(models.LaporanBypass.unit == unit)
            base_kontrak = base_kontrak.filter(models.Kontrak.kebun_produsen == unit)

        if komoditi != "ALL":
            base_pembayaran_cash = base_pembayaran_cash.filter(
                models.Pembayaran.invoice.has(models.Invoice.kontrak.has(models.Kontrak.komoditi == komoditi))
            )
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
            .joinedload(models.Kontrak.units),
            joinedload(models.DeliveryOrder.berita_acara),
            joinedload(models.DeliveryOrder.invoice).joinedload(models.Invoice.berita_acara),
        ).all()
        invoices = base_invoice.options(
            joinedload(models.Invoice.delivery_orders),
            joinedload(models.Invoice.pembayaran),
        ).all()
        for do in dos_pend:
            k = do.invoice.kontrak
            do_vol = float(do.volume_do or 0)
            k_vol = float(k.volume or 0)
            k_nilai = float(k.nilai_transaksi or 0)
            if k_nilai <= 0: k_nilai = (k_vol * float(k.harga_satuan or 0)) + float(k.premi or 0)
            
            if str(getattr(k, "tipe_alur", "STANDAR")).upper() == "PAYUNG_BA" and k_vol <= 0:
                from services.ba_utils import calculate_ba_pokok
                pokok = calculate_ba_pokok(k, do_vol)
                ppn = 0.0
                if str(getattr(k, "is_ppn", "true")).lower() == "true":
                    ppn = pokok * (float(k.ppn_persen or 0) / 100)
                pendapatan_do = pokok + ppn
            else:
                pendapatan_do = k_nilai * (do_vol / k_vol) if k_vol > 0 else k_nilai
            
            satuan = (k.satuan or "Kg").lower()
            if satuan == "butir":
                total_volume_butir += do_vol
            else:
                total_volume_kg += do_vol
            
            total_pendapatan += pendapatan_do
            
            ba_buku_date = None
            if str(getattr(k, "tipe_alur", "STANDAR")).upper() == "PAYUNG_BA":
                ba_ref = do.berita_acara or do.invoice.berita_acara
                if ba_ref:
                    ba_buku_date = ba_ref.bulan_buku or ba_ref.tanggal_ba
            if ba_buku_date:
                m = ba_buku_date.month
            else:
                m = do.rencana_pengambilan.month if do.rencana_pengambilan else do.tanggal_do.month if do.tanggal_do else 1
            pend_m[f"{m:02d}"] += pendapatan_do

            sk = f"{_sap_month_for_do(do, k, ba_buku_date):02d}"
            inv = do.invoice
            if not _effective_sap(do.kontrak_sap, getattr(inv, "kontrak_sap", None)):
                sap_m[sk]["missing_kontrak"] += 1
            if not _effective_sap(do.so_sap, getattr(inv, "so_sap", None)):
                sap_m[sk]["missing_so"] += 1
            if not _effective_sap(do.do_sap, getattr(inv, "do_sap", None)):
                sap_m[sk]["missing_do"] += 1
            if not _effective_sap(do.billing_sap, getattr(inv, "billing_sap", None)):
                sap_m[sk]["missing_billing"] += 1
            
            if satuan == "butir":
                vol_m_butir[f"{m:02d}"] += do_vol
            else:
                vol_m_kg[f"{m:02d}"] += do_vol
            
            kom = k.komoditi or "Lainnya"
            # Unit priority: DO.kepada_unit > Invoice.nama_unit > Kontrak.kebun_produsen > Kontrak.units[0]
            unt = ""
            if getattr(do, 'kepada_unit', None):
                unt = do.kepada_unit
            if not unt and do.invoice and do.invoice.nama_unit:
                unt = do.invoice.nama_unit
            if not unt:
                unt = k.kebun_produsen or ""
            if not unt and hasattr(k, 'units') and k.units:
                unt = k.units[0].nama_unit or ""
            if not unt:
                unt = "Lainnya"
            kom_map[kom] = kom_map.get(kom, 0) + pendapatan_do
            unit_map[unt] = unit_map.get(unt, 0) + pendapatan_do

        # 2. CASH IN (dari Pembayaran)
        pays_cash = base_pembayaran_cash.all()
        for pay in pays_cash:
            nom = float(pay.nominal_transfer or 0)
            total_cash_in += nom
            m = pay.tanggal_pembayaran.month if pay.tanggal_pembayaran else 1
            cash_m[f"{m:02d}"] += nom

        # 3. INVOICES (termasuk invoice-first: SAP di invoice sebelum DO dibuat)
        for inv in invoices:
            nom = float(inv.jumlah_pembayaran or 0)
            total_nilai_invoice += nom
            m = inv.tanggal_transaksi.month if inv.tanggal_transaksi else 1
            inv_m[f"{m:02d}"] += nom

            if inv.delivery_orders:
                continue
            sk = f"{_sap_month_for_invoice(inv):02d}"
            if not _sap_val(inv.kontrak_sap):
                sap_m[sk]["missing_kontrak"] += 1
            if not _sap_val(inv.so_sap):
                sap_m[sk]["missing_so"] += 1
            if not _sap_val(inv.do_sap):
                sap_m[sk]["missing_do"] += 1
            if not _sap_val(inv.billing_sap):
                sap_m[sk]["missing_billing"] += 1

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
            if not _sap_val(b.kontrak_sap):
                sap_m[bk]["missing_kontrak"] += 1
            if not _sap_val(b.so_sap):
                sap_m[bk]["missing_so"] += 1
            if not _sap_val(b.do_sap):
                sap_m[bk]["missing_do"] += 1
            if not _sap_val(b.billing_sap):
                sap_m[bk]["missing_billing"] += 1
            
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
                    "missing_kontrak": sum(sap_m[m]["missing_kontrak"] for m in sap_m),
                    "missing_so": sum(sap_m[m]["missing_so"] for m in sap_m),
                    "missing_do": sum(sap_m[m]["missing_do"] for m in sap_m),
                    "missing_billing": sum(sap_m[m]["missing_billing"] for m in sap_m),
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
