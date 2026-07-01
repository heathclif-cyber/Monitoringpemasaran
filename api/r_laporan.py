from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
import locale
import calendar
from typing import List

import models
from database import get_db, SessionLocal
from services.auth import require_write
from services.cache import api_cache
from services.ba_utils import (
    is_payung_ba,
    ba_effective_harga,
    calculate_ba_invoice_amount,
    kontrak_nilai_maksimum,
)
from services.superman.documents import (
    superman_doc_requirements_for_do,
    superman_doc_requirements_for_pembayaran,
)

router = APIRouter(prefix="/api/laporan", tags=["Laporan"])

def format_date(d):
    if not d: return ""
    return d.strftime("%d/%m/%Y")

def get_bulan_buku(d):
    if not d: return ""
    months = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
              "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
    return f"{d.month:02d}-{months[d.month]}"


def _invoice_volume_scope(k, inv, ba_ref):
    k_vol = float(k.volume or 0)
    vol_base = k_vol
    nilai_penuh = kontrak_nilai_maksimum(k)

    if is_payung_ba(k) and ba_ref and (ba_ref.volume_ba or 0) > 0:
        vol_base = float(ba_ref.volume_ba)
        nilai_penuh = float(
            calculate_ba_invoice_amount(k, vol_base, ba_effective_harga(ba_ref, k))
        )
    elif inv and inv.nama_unit and hasattr(k, "units") and k.units:
        matched = next((u for u in k.units if u.nama_unit == inv.nama_unit), None)
        if matched and (matched.volume or 0) > 0:
            vol_base = float(matched.volume)
            if k_vol > 0:
                unit_ratio = vol_base / k_vol
                pokok_full = (k_vol * float(k.harga_satuan or 0)) + float(k.premi or 0)
                ppn_full = 0.0
                if str(getattr(k, "is_ppn", "true")).lower() == "true":
                    ppn_full = pokok_full * (float(k.ppn_persen or 0) / 100)
                nilai_penuh = (pokok_full + ppn_full) * unit_ratio

    return vol_base, nilai_penuh


def _compute_volume_invoice(k, inv, ba_ref):
    vol_base, nilai_penuh = _invoice_volume_scope(k, inv, ba_ref)
    if not inv:
        return vol_base
    inv_gross = float(inv.jumlah_pembayaran or 0)
    if nilai_penuh > 0 and inv_gross > 0:
        return vol_base * (inv_gross / nilai_penuh)
    return vol_base


def _build_laporan_rows(db: Session):
    kontraks = db.query(models.Kontrak).options(
        joinedload(models.Kontrak.units),
        joinedload(models.Kontrak.invoices).joinedload(models.Invoice.pembayaran),
        joinedload(models.Kontrak.invoices).joinedload(models.Invoice.delivery_orders).joinedload(models.DeliveryOrder.pembayaran),
        joinedload(models.Kontrak.invoices).joinedload(models.Invoice.berita_acara),
        joinedload(models.Kontrak.invoices).joinedload(models.Invoice.delivery_orders).joinedload(models.DeliveryOrder.berita_acara),
    ).all()
    ba_by_no = {ba.no_ba: ba for ba in db.query(models.BeritaAcara).all()}

    rows = []
    
    def build_row(k, inv, do, inv_total=0, k_vol=0, total_do_nominal=0, total_do_volume=0):
        do_volume = float(do.volume_do or 0) if do else 0
        do_nominal = float(do.nominal_transfer or 0) if do else 0
        k_vol_local = float(k.volume or 0)
        k_harga_local = float(k.harga_satuan or 0)
        k_premi = float(k.premi or 0)
        # k_pokok = volume × harga + premi, sebelum PPN
        k_pokok = (k_vol_local * k_harga_local) + k_premi
        k_nilai = float(k.nilai_transaksi or 0)
        k_ppn = float(k.nominal_ppn or 0)

        if k_nilai <= 0:
            k_nilai = k_pokok

        if str(getattr(k, 'is_ppn', 'true')).lower() == 'false':
            k_ppn = 0.0
        elif k_ppn <= 0 and k_pokok > 0:
            k_ppn_persen = float(getattr(k, 'ppn_persen', 0) or 0)
            if k_ppn_persen > 0:
                k_ppn = k_pokok * (k_ppn_persen / 100)
            elif inv and float(inv.jumlah_pembayaran or 0) > k_pokok:
                k_ppn = float(inv.jumlah_pembayaran) - k_pokok

        k_pph = 0.0
        if str(getattr(k, 'is_pph', 'false')).lower() == 'true':
            k_pph_p = float(getattr(k, 'pph_persen', 0) or 0)
            k_pph = k_pokok * (k_pph_p / 100)

        # Financial values based on invoice, not full contract
        inv_gross = float(inv.jumlah_pembayaran or 0) if inv else 0
        if inv_gross > 0:
            ppn_rate = float(getattr(k, 'ppn_persen', 0) or 0) / 100
            is_ppn_flag = str(getattr(k, 'is_ppn', 'true')).lower() != 'false'
            is_pph_flag = str(getattr(k, 'is_pph', 'false')).lower() == 'true'
            pph_rate_val = float(getattr(k, 'pph_persen', 0) or 0) / 100
            if is_ppn_flag and ppn_rate > 0:
                pokok_inv = inv_gross / (1 + ppn_rate)
                ppn_inv = inv_gross - pokok_inv
            else:
                pokok_inv = inv_gross
                ppn_inv = 0.0
            pph_inv = pokok_inv * pph_rate_val if is_pph_flag else 0.0
            do_ratio = (float(do.nominal_transfer or 0) / inv_gross) if do else 1.0
            pendapatan_do = pokok_inv * do_ratio
            ppn_do = ppn_inv * do_ratio
            pph_do = pph_inv * do_ratio
        else:
            pendapatan_do = k_pokok
            ppn_do = k_ppn
            pph_do = k_pph

        pendapatan_setelah_ppn = round(pendapatan_do + ppn_do)

        # Sisa pembayaran = Invoice total gross - sum of ALL DOs pelunasan for this invoice
        # inv_total is now already gross (pokok + PPN, no PPh subtraction)
        if not inv_total or inv_total <= 0:
            inv_total_gross = k_nilai + k_ppn
        else:
            inv_total_gross = inv_total

        sisa_pembayaran = round(float(inv_total_gross) - float(total_do_nominal)) if (inv or do) else 0
        
        # Determine pelunasan for THIS specific DO
        if do and str(getattr(do, 'is_pph_disetor', 'false')).lower() == 'true':
            pelunasan_do = do_nominal + pph_do
        else:
            pelunasan_do = do_nominal
        # Sisa volume = Kontrak volume - sum of ALL DOs volume for this invoice
        sisa_volume = round(float(k_vol_local) - float(total_do_volume))

        # DPP (Harga Pokok, excl. PPN/PPh) = harga_satuan * volume_do + premi proporsional
        if k_vol_local > 0 and do:
            ratio_premi = do_volume / k_vol_local
            dpp_pokok = (k_harga_local * do_volume) + (k_premi * ratio_premi)
        elif do:
            dpp_pokok = (k_harga_local * do_volume) + k_premi
        else:
            dpp_pokok = (k_harga_local * k_vol_local) + k_premi

        ba_ref = None
        if do and getattr(do, "berita_acara", None):
            ba_ref = do.berita_acara
        elif inv and getattr(inv, "berita_acara", None):
            ba_ref = inv.berita_acara
        elif k.no_kontrak:
            # Sawit RO: kontrak per-pengiriman sering bernama sama dengan no_ba
            ba_ref = ba_by_no.get(k.no_kontrak)

        ba_date = ba_ref.tanggal_ba if ba_ref else None
        ba_buku_date = ba_ref.bulan_buku if ba_ref else None

        if is_payung_ba(k) and ba_ref:
            k_harga_local = ba_effective_harga(ba_ref, k)
            k_premi = 0.0

        volume_invoice = _compute_volume_invoice(k, inv, ba_ref)

        ppn_persen_val = (
            float(getattr(k, "ppn_persen", 0) or 0)
            if str(getattr(k, "is_ppn", "true")).lower() != "false"
            else 0.0
        )
        pph_persen_val = (
            float(getattr(k, "pph_persen", 0) or 0)
            if str(getattr(k, "is_pph", "false")).lower() == "true"
            else 0.0
        )

        # Unit: prioritas — BA.nama_unit > DO.kepada_unit > Invoice.nama_unit > Kontrak.kebun_produsen
        unit_val = ""
        if ba_ref and getattr(ba_ref, "nama_unit", None):
            unit_val = ba_ref.nama_unit
        if not unit_val and do and getattr(do, 'kepada_unit', None):
            unit_val = do.kepada_unit
        if not unit_val and inv and getattr(inv, 'nama_unit', None):
            unit_val = inv.nama_unit
        if not unit_val:
            unit_val = k.kebun_produsen or ""
        if not unit_val and hasattr(k, 'units') and k.units:
            unit_val = k.units[0].nama_unit or ""

        # Jenis Komoditi/Material: cari dari KontrakUnit yang sesuai unit_val
        jenis_komoditi_val = ""
        if hasattr(k, 'units') and k.units and unit_val:
            matched_unit = next((u for u in k.units if u.nama_unit == unit_val), None)
            if matched_unit:
                jenis_komoditi_val = matched_unit.jenis_komoditi or ""
        if not jenis_komoditi_val:
            jenis_komoditi_val = k.jenis_komoditi or k.deskripsi_produk or k.komoditi or ""

        no_pembayaran_val = ""
        superman_val = ""
        if do:
            no_pembayaran_val = do.no_pembayaran or ""
        if inv and (inv.superman or "").strip():
            superman_val = inv.superman or ""
        elif do:
            if do.pembayaran and do.pembayaran.superman:
                superman_val = do.pembayaran.superman or ""
            if not superman_val:
                superman_val = do.superman or ""

        dokumen_superman: list = []
        dokumen_superman_siap = False
        if inv and inv.no_invoice:
            from services.superman.documents import superman_doc_requirements_for_invoice
            dokumen_superman, dokumen_superman_siap = superman_doc_requirements_for_invoice(
                db, inv.no_invoice
            )
        elif no_pembayaran_val:
            dokumen_superman, dokumen_superman_siap = superman_doc_requirements_for_pembayaran(
                db, no_pembayaran_val
            )
        elif do:
            dokumen_superman, dokumen_superman_siap = superman_doc_requirements_for_do(db, do.no_do)

        tanggal_transfer_val = do.tanggal_pembayaran if do else None
        raw_date_val = (
            do.tanggal_pembayaran.strftime("%Y-%m-%d")
            if do and do.tanggal_pembayaran
            else (
                inv.tanggal_transaksi.strftime("%Y-%m-%d")
                if inv and inv.tanggal_transaksi
                else (k.tanggal_kontrak.strftime("%Y-%m-%d") if k.tanggal_kontrak else "")
            )
        )

        # Invoice-first flow: pembayaran + Superman sebelum DO — tampilkan data pembayaran di Laporan
        if not do and inv and inv.pembayaran:
            sorted_pays = sorted(
                inv.pembayaran,
                key=lambda p: (
                    p.tanggal_pembayaran.isoformat() if p.tanggal_pembayaran else "",
                    p.no_pembayaran or "",
                ),
            )
            pay_nominal_total = sum(float(p.nominal_transfer or 0) for p in sorted_pays)
            if pay_nominal_total > 0:
                do_nominal = pay_nominal_total
                pelunasan_do = float(total_do_nominal) if total_do_nominal > 0 else pay_nominal_total
                no_pembayaran_val = sorted_pays[-1].no_pembayaran or no_pembayaran_val
                tanggal_transfer_val = sorted_pays[-1].tanggal_pembayaran
                if tanggal_transfer_val:
                    raw_date_val = tanggal_transfer_val.strftime("%Y-%m-%d")

                vol_base = k_vol_local
                if is_payung_ba(k) and ba_ref and (ba_ref.volume_ba or 0) > 0:
                    vol_base = float(ba_ref.volume_ba)
                elif inv.nama_unit and hasattr(k, "units") and k.units:
                    matched = next((u for u in k.units if u.nama_unit == inv.nama_unit), None)
                    if matched and (matched.volume or 0) > 0:
                        vol_base = float(matched.volume)
                if k_harga_local > 0:
                    do_volume = pay_nominal_total / k_harga_local
                elif inv_gross > 0 and vol_base > 0:
                    do_volume = vol_base * (pay_nominal_total / inv_gross)
                if inv_gross > 0:
                    pay_ratio = pay_nominal_total / inv_gross
                    pendapatan_do = pokok_inv * pay_ratio
                    ppn_do = ppn_inv * pay_ratio
                    pph_do = pph_inv * pay_ratio
                    pendapatan_setelah_ppn = round(pendapatan_do + ppn_do)
                    if k_vol_local > 0:
                        ratio_premi = do_volume / k_vol_local
                        dpp_pokok = (k_harga_local * do_volume) + (k_premi * ratio_premi)
                    else:
                        dpp_pokok = (k_harga_local * do_volume) + k_premi

        return {
            "No_DO": do.no_do if do else "",
            "No_Pembayaran": no_pembayaran_val,
            "No_Invoice": inv.no_invoice if inv else "",
            "No_Kontrak": k.no_kontrak or "",
            "Unit": unit_val,
            "Komoditi": k.komoditi or "",
            "Billing_Date": format_date(inv.tanggal_transaksi) if inv else format_date(k.tanggal_kontrak),
            "Tanggal_Transfer": format_date(tanggal_transfer_val) if tanggal_transfer_val else "",
            "Raw_Date": raw_date_val,
            "Jumlah_Transfer": do_nominal,
            "Mitra_Pembeli": k.pembeli or "",
            "Deskripsi_Produk": jenis_komoditi_val,
            "Jumlah_Invoice": float(inv.jumlah_pembayaran or 0) if inv else 0,
            "Harga_Satuan": k_harga_local,
            "Volume_Invoice": volume_invoice,
            "Jumlah_DO": do_volume,
            "PPN_Persen": ppn_persen_val,
            "PPh_Persen": pph_persen_val,
            "Pendapatan_Pokok": round(pendapatan_do),
            "Pendapatan_Setelah_PPN": pendapatan_setelah_ppn,
            "DPP_Pokok": round(dpp_pokok),
            "Pajak_PPN": round(ppn_do),
            "PPh_Nominal": round(pph_do),
            "PPh_Setor": do.is_pph_disetor if do else "false",
            "Kewajiban_Pembayaran": round(pendapatan_setelah_ppn - pph_do),
            "Pelunasan": round(pelunasan_do),
            "Sisa_Pembayaran": sisa_pembayaran,
            "Sisa_Volume": sisa_volume,
            "No_BA": ba_ref.no_ba if ba_ref else "",
            "Tanggal_BA": ba_date.strftime("%Y-%m-%d") if ba_date else "",
            "Bulan_Buku": get_bulan_buku(
                (ba_buku_date or ba_date) if (ba_ref and (ba_buku_date or ba_date)) else (
                    do.rencana_pengambilan if do and getattr(do, 'rencana_pengambilan', None) else (do.tanggal_pembayaran if do else None)
                )
            ),
            "Rencana_Pengambilan": (
                ba_date.strftime("%Y-%m-%d") if (ba_ref and ba_date) else (
                    do.rencana_pengambilan.strftime("%Y-%m-%d") if do and getattr(do, 'rencana_pengambilan', None) else ""
                )
            ),
            "Superman": superman_val,
            "Kontrak_SAP": (
                do.kontrak_sap if do else (inv.kontrak_sap if inv else "")
            ) or "",
            "SO_SAP": (do.so_sap if do else (inv.so_sap if inv else "")) or "",
            "DO_SAP": (do.do_sap if do else (inv.do_sap if inv else "")) or "",
            "Billing": (do.billing_sap if do else (inv.billing_sap if inv else "")) or "",
            "Link_Deklarasi_Penerimaan": (
                do.link_deklarasi_penerimaan if do else (inv.link_deklarasi_penerimaan if inv else "")
            ) or "",
            "Link_Berita_Acara_Serah_Terima": do.link_berita_acara_serah_terima if do else "",
            "Dokumen_Superman": dokumen_superman,
            "Dokumen_Superman_Siap": dokumen_superman_siap,
            "Satuan": k.satuan or "Kg"
        }

    for k in kontraks:
        if not k.invoices:
            rows.append(build_row(k, None, None, 0, 0, 0, 0))
        else:
            for inv in k.invoices:
                # Calculate per-invoice totals across ALL DOs
                total_do_volume = sum(float(d.volume_do or 0) for d in inv.delivery_orders)
                
                k_vol = float(k.volume or 0)
                k_nilai = float(k.nilai_transaksi or 0)
                if k_nilai <= 0:
                    k_nilai = (k_vol * float(k.harga_satuan or 0)) + float(k.premi or 0)
                k_pph = 0.0
                if str(getattr(k, 'is_pph', 'false')).lower() == 'true':
                    k_pph = k_nilai * (float(getattr(k, 'pph_persen', 0) or 0) / 100)
                
                inv_total = float(inv.jumlah_pembayaran or 0)

                total_pelunasan = 0
                for pay in inv.pembayaran:
                    nom = float(pay.nominal_transfer or 0)
                    if str(getattr(pay, 'is_pph_disetor', 'false')).lower() == 'true':
                        pay_ratio = nom / inv_total if inv_total > 0 else 0
                        pay_pph = k_pph * pay_ratio
                        total_pelunasan += (nom + pay_pph)
                    else:
                        total_pelunasan += nom
                
                if not inv.delivery_orders:
                    rows.append(build_row(k, inv, None, inv_total, k_vol, total_pelunasan, total_do_volume))
                else:
                    for do in inv.delivery_orders:
                        rows.append(build_row(k, inv, do, inv_total, k_vol, total_pelunasan, total_do_volume))
                        
    # Sort by Kontrak then Invoice then DO
    rows.sort(key=lambda x: (x["Billing_Date"], x["No_Kontrak"], x["No_Invoice"], x["No_DO"]))
    
    # 2. Fetch Bypass Data
    bypass_data = db.query(models.LaporanBypass).all()
    for b in bypass_data:
        rows.append({
            "No_DO": f"BYPASS-{b.id}",
            "Id_Bypass": b.id,
            "No_Invoice": "-",
            "No_Kontrak": "-",
            "Unit": b.unit or "",
            "Komoditi": b.komoditi or "",
            "Billing_Date": format_date(b.tanggal),
            "Tanggal_Transfer": format_date(b.tanggal),
            "Raw_Date": b.tanggal.strftime("%Y-%m-%d") if b.tanggal else "",
            "Jumlah_Transfer": b.nominal or 0,
            "Mitra_Pembeli": b.pembeli or "",
            "Deskripsi_Produk": b.deskripsi or "",
            "Jumlah_Invoice": 0,
            "Harga_Satuan": (b.nominal / b.volume) if (b.volume and b.volume > 0) else 0,
            "Volume_Invoice": b.volume or 0,
            "Jumlah_DO": b.volume or 0,
            "PPN_Persen": 0,
            "PPh_Persen": 0,
            "Satuan": b.satuan or "Kg",
            "Pendapatan_Pokok": b.nominal or 0,
            "Pendapatan_Setelah_PPN": b.nominal or 0,
            "Pajak_PPN": 0,
            "PPh_Nominal": 0,
            "PPh_Setor": "false",
            "Kewajiban_Pembayaran": b.nominal or 0,
            "Sisa_Pembayaran": 0,
            "Rencana_Pengambilan": b.tanggal.strftime("%Y-%m-%d") if b.tanggal else "",
            "Bulan_Buku": get_bulan_buku(b.tanggal),
            "Superman": b.superman or "",
            "Kontrak_SAP": b.kontrak_sap or "",
            "SO_SAP": b.so_sap or "",
            "DO_SAP": b.do_sap or "",
            "Billing": b.billing_sap or "",
            "Link_Deklarasi_Penerimaan": b.link_deklarasi_penerimaan or "",
            "Link_Berita_Acara_Serah_Terima": "",
        })

    return rows


@router.get("")
def get_laporan(fresh: bool = Query(False, description="Lewati cache — dipakai setelah mutasi data")):
    if not fresh:
        cached = api_cache.get("laporan:all")
        if cached is not None:
            return cached

    db = SessionLocal()
    try:
        rows = _build_laporan_rows(db)
        api_cache.set("laporan:all", rows)
        return rows
    finally:
        db.close()

def _apply_sap_fields(entity, data: dict) -> None:
    if "Superman" in data:
        entity.superman = data["Superman"]
    if "Kontrak_SAP" in data:
        entity.kontrak_sap = data["Kontrak_SAP"]
    if "SO_SAP" in data:
        entity.so_sap = data["SO_SAP"]
    if "DO_SAP" in data:
        entity.do_sap = data["DO_SAP"]
    if "Billing" in data:
        entity.billing_sap = data["Billing"]
    if "Link_Deklarasi_Penerimaan" in data:
        entity.link_deklarasi_penerimaan = data["Link_Deklarasi_Penerimaan"]
    if hasattr(entity, "link_berita_acara_serah_terima") and "Link_Berita_Acara_Serah_Terima" in data:
        entity.link_berita_acara_serah_terima = data["Link_Berita_Acara_Serah_Terima"]


@router.put("/update-sap")
def update_sap_fields(data: dict, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    no_do = (data.get("No_DO") or "").strip()
    no_invoice = (data.get("No_Invoice") or "").strip()

    if no_do.startswith("BYPASS-"):
        bypass_id = int(no_do.replace("BYPASS-", ""))
        rec = db.query(models.LaporanBypass).filter(models.LaporanBypass.id == bypass_id).first()
        if not rec:
            return {"success": False, "message": "Data bypass tidak ditemukan"}
        _apply_sap_fields(rec, data)
    elif no_do:
        do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
        if not do:
            return {"success": False, "message": "Data DO tidak ditemukan"}
        _apply_sap_fields(do, data)
    elif no_invoice and no_invoice != "-":
        inv = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
        if not inv:
            return {"success": False, "message": "Invoice tidak ditemukan"}
        _apply_sap_fields(inv, data)
    else:
        return {"success": False, "message": "No. DO atau Invoice diperlukan"}

    db.commit()
    api_cache.invalidate_reporting()
    return {"success": True}

@router.post("/create-bypass")
def create_bypass_entry(data: dict, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    try:
        from datetime import datetime
        tanggal_dt = datetime.strptime(data["Tanggal"], "%Y-%m-%d").date()
        
        new_rec = models.LaporanBypass(
            unit=data.get("Unit"),
            komoditi=data.get("Komoditi"),
            tanggal=tanggal_dt,
            nominal=float(data.get("Nominal") or 0),
            pembeli=data.get("Pembeli"),
            deskripsi=data.get("Deskripsi"),
            volume=float(data.get("Volume") or 0),
            satuan=data.get("Satuan") or "Kg"
        )
        db.add(new_rec)
        db.commit()
        api_cache.invalidate_reporting()
        return {"success": True, "id": new_rec.id}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.put("/update-bypass")
def update_bypass_entry(data: dict, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    try:
        from datetime import datetime
        id_bypass = data.get("id")
        if not id_bypass: return {"success": False, "message": "ID required"}
        
        rec = db.query(models.LaporanBypass).filter(models.LaporanBypass.id == id_bypass).first()
        if not rec: return {"success": False, "message": "Record not found"}
        
        if "Unit" in data: rec.unit = data["Unit"]
        if "Komoditi" in data: rec.komoditi = data["Komoditi"]
        if "Tanggal" in data: rec.tanggal = datetime.strptime(data["Tanggal"], "%Y-%m-%d").date()
        if "Nominal" in data: rec.nominal = float(data["Nominal"] or 0)
        if "Pembeli" in data: rec.pembeli = data["Pembeli"]
        if "Deskripsi" in data: rec.deskripsi = data["Deskripsi"]
        if "Volume" in data: rec.volume = float(data["Volume"] or 0)
        if "Satuan" in data: rec.satuan = data["Satuan"]
        
        db.commit()
        api_cache.invalidate_reporting()
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.delete("/bypass/{bypass_id}")
def delete_bypass_entry(bypass_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    rec = db.query(models.LaporanBypass).filter(models.LaporanBypass.id == bypass_id).first()
    if not rec:
        return {"success": False, "message": "Data tidak ditemukan"}
    
    db.delete(rec)
    db.commit()
    api_cache.invalidate_reporting()
    return {"success": True}

@router.post("/seed-beteleme")
def seed_beteleme(db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    from datetime import date
    data_entries = [
        # Februari 2026
        ("Beteleme", "Sawit", date(2026, 2, 4), 2568163.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 6), 3393645.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 6), 9661186.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 11), 12168204.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 11), 19689254.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 11), 53931433.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 20), 33936446.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 20), 29595027.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 20), 29729190.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 20), 5870088.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 20), 27125616.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 20), 41354454.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 23), 4298926.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 23), 26217393.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 24), 12351843.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 24), 10505121.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 26), 17468170.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 2, 26), 14077468.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        # Maret 2026
        ("Beteleme", "Sawit", date(2026, 3, 3), 27852195.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 3), 31939202.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 5), 21888192.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 5), 29214531.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 5), 37406998.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 6), 35662919.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 6), 21343258.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 6), 47348731.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 10), 12109650.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 10), 20979968.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 11), 43291999.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 12), 15803093.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 16), 12351843.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 16), 18103927.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 16), 52828348.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 18), 7477709.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 23), 15863641.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 23), 24673411.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
        ("Beteleme", "Sawit", date(2026, 3, 23), 4147555.0, "Sinergi Perkebunan Nusantara", "Tandan Buah Segar"),
    ]
    
    count = 0
    for unit, komo, tgl, nom, pemb, desc in data_entries:
        # Check if already exists to prevent duplicates on multiple calls
        exists = db.query(models.LaporanBypass).filter(
            models.LaporanBypass.unit == unit,
            models.LaporanBypass.komoditi == komo,
            models.LaporanBypass.tanggal == tgl,
            models.LaporanBypass.nominal == nom
        ).first()
        
        if not exists:
            db.add(models.LaporanBypass(
                unit=unit, komoditi=komo, tanggal=tgl,
                nominal=nom, pembeli=pemb, deskripsi=desc
            ))
            count += 1
    
    db.commit()
    api_cache.invalidate_reporting()
    return {"success": True, "inserted": count}
