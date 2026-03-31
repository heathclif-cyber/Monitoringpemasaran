from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
import locale
import calendar
from typing import List

import models
from database import get_db

router = APIRouter(prefix="/api/laporan", tags=["Laporan"])

def format_date(d):
    if not d: return ""
    return d.strftime("%d/%m/%Y")

def get_bulan_buku(d):
    if not d: return ""
    months = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
              "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
    return f"{d.month:02d}-{months[d.month]}"

@router.get("")
def get_laporan(db: Session = Depends(get_db)):
    kontraks = db.query(models.Kontrak).options(
        joinedload(models.Kontrak.invoices).joinedload(models.Invoice.delivery_orders)
    ).all()

    rows = []
    
    def build_row(k, inv, do):
        do_volume = float(do.volume_do or 0) if do else 0
        do_nominal = float(do.nominal_transfer or 0) if do else 0
        # Pendapatan Pokok for this DO = proportional: (volume_do / kontrak_vol) * nilai_transaksi
        k_vol = float(k.volume or 0)
        k_nilai = float(k.nilai_transaksi or 0)
        k_ppn = float(k.nominal_ppn or 0)
        if k_vol > 0 and do:
            ratio = do_volume / k_vol
            pendapatan_do = k_nilai * ratio
            ppn_do = k_ppn * ratio
        else:
            pendapatan_do = k_nilai
            ppn_do = k_ppn

        return {
            "No_DO": do.no_do if do else "",
            "No_Invoice": inv.no_invoice if inv else "",
            "No_Kontrak": k.no_kontrak or "",
            "Unit": k.kebun_produsen or "",
            "Komoditi": k.komoditi or "",
            "Billing_Date": format_date(inv.tanggal_transaksi) if inv else format_date(k.tanggal_kontrak),
            "Tanggal_Transfer": format_date(do.tanggal_pembayaran) if do else "",
            "Raw_Date": (do.tanggal_pembayaran or (inv.tanggal_transaksi if inv else k.tanggal_kontrak)).strftime("%Y-%m-%d") if (do and do.tanggal_pembayaran) or inv or k.tanggal_kontrak else "",
            "Jumlah_Transfer": do_nominal,
            "Mitra_Pembeli": k.pembeli or "",
            "Deskripsi_Produk": (k.deskripsi_produk or k.komoditi) or "",
            "Jumlah_Kontrak_Kg": k.volume or 0,
            "Harga_Per_Kg": k.harga_satuan or 0,
            "Jumlah_DO": do_volume,
            "Pendapatan_Pokok": round(pendapatan_do, 2),
            "Pajak_PPN": round(ppn_do, 2),
            "Kewajiban_Pembayaran": inv.jumlah_pembayaran if inv else 0,
            "Selisih": do.selisih if do else (inv.jumlah_pembayaran if inv else 0),
            "Bulan_Buku": get_bulan_buku(do.tanggal_pembayaran) if do and do.tanggal_pembayaran else "",
            "Superman": do.superman if do else "",
            "Kontrak_SAP": do.kontrak_sap if do else "",
            "SO_SAP": do.so_sap if do else "",
            "DO_SAP": do.do_sap if do else "",
            "Billing": do.billing_sap if do else ""
        }

    for k in kontraks:
        if not k.invoices:
            rows.append(build_row(k, None, None))
        else:
            for inv in k.invoices:
                if not inv.delivery_orders:
                    rows.append(build_row(k, inv, None))
                else:
                    for do in inv.delivery_orders:
                        rows.append(build_row(k, inv, do))
                        
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
            "Jumlah_Kontrak_Kg": b.volume or 0,
            "Harga_Per_Kg": (b.nominal / b.volume) if (b.volume and b.volume > 0) else 0,
            "Jumlah_DO": b.volume or 0,
            "Satuan": b.satuan or "Kg",
            "Pendapatan_Pokok": b.nominal or 0,
            "Pajak_PPN": 0,
            "Kewajiban_Pembayaran": b.nominal or 0,
            "Selisih": 0,
            "Bulan_Buku": get_bulan_buku(b.tanggal),
            "Superman": b.superman or "",
            "Kontrak_SAP": b.kontrak_sap or "",
            "SO_SAP": b.so_sap or "",
            "DO_SAP": b.do_sap or "",
            "Billing": b.billing_sap or ""
        })

    return rows

@router.put("/update-sap")
def update_sap_fields(data: dict, db: Session = Depends(get_db)):
    no_do = data.get("No_DO")
    if not no_do:
        return {"success": False, "message": "No. DO diperlukan"}
    
    if no_do.startswith("BYPASS-"):
        bypass_id = int(no_do.replace("BYPASS-", ""))
        rec = db.query(models.LaporanBypass).filter(models.LaporanBypass.id == bypass_id).first()
        if not rec: return {"success": False, "message": "Data bypass tidak ditemukan"}
        
        if "Superman" in data: rec.superman = data["Superman"]
        if "Kontrak_SAP" in data: rec.kontrak_sap = data["Kontrak_SAP"]
        if "SO_SAP" in data: rec.so_sap = data["SO_SAP"]
        if "DO_SAP" in data: rec.do_sap = data["DO_SAP"]
        if "Billing" in data: rec.billing_sap = data["Billing"]
    else:
        do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
        if not do:
            return {"success": False, "message": "Data DO tidak ditemukan"}
        
        # Update fields
        if "Superman" in data: do.superman = data["Superman"]
        if "Kontrak_SAP" in data: do.kontrak_sap = data["Kontrak_SAP"]
        if "SO_SAP" in data: do.so_sap = data["SO_SAP"]
        if "DO_SAP" in data: do.do_sap = data["DO_SAP"]
        if "Billing" in data: do.billing_sap = data["Billing"]
    
    db.commit()
    return {"success": True}

@router.post("/create-bypass")
def create_bypass_entry(data: dict, db: Session = Depends(get_db)):
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
        return {"success": True, "id": new_rec.id}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.put("/update-bypass")
def update_bypass_entry(data: dict, db: Session = Depends(get_db)):
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
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.delete("/bypass/{bypass_id}")
def delete_bypass_entry(bypass_id: int, db: Session = Depends(get_db)):
    rec = db.query(models.LaporanBypass).filter(models.LaporanBypass.id == bypass_id).first()
    if not rec:
        return {"success": False, "message": "Data tidak ditemukan"}
    
    db.delete(rec)
    db.commit()
    return {"success": True}

@router.post("/seed-beteleme")
def seed_beteleme(db: Session = Depends(get_db)):
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
    return {"success": True, "inserted": count}
