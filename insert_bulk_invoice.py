import os
import sys
from datetime import datetime
import json

sys.path.append(os.getcwd())
from database import SessionLocal
import models

# Data mapping
data_text = """R08D-RO/INV/2026.01.26-1|R08D-RO/SPJ/2026.01.26-1|2026-01-26|0|271950000|dua ratus tujuh puluh satu juta sembilan ratus lima puluh ribu Rupiah
R08D-RO/INV/2026.02.18-1|R08D-RO/SPJ/2026.02.18-2|2026-02-18|0.25|416250000|empat ratus enam belas juta dua ratus lima puluh ribu Rupiah
0159/HO-SUPCO/WASTE-L/N-I/I/2026|0159/HO-SUPCO/WASTE-L/N-I/I/2026|2026-01-28|0.25|623376000|enam ratus dua puluh tiga juta tiga ratus tujuh puluh enam ribu Rupiah
0160/HO-SUPCO/WASTE-L/N-I/I/2026|0160/HO-SUPCO/WASTE-L/N-I/I/2026|2026-01-28|0.25|151688160|seratus lima puluh satu juta enam ratus delapan puluh delapan ribu seratus enam puluh Rupiah
0161/HO-SUPCO/WASTE-L/N-I/I/2026|0161/HO-SUPCO/WASTE-L/N-I/I/2026|2026-01-28|0.25|671470080|enam ratus tujuh puluh satu juta empat ratus tujuh puluh ribu delapan puluh Rupiah
2105/HO-SUPCO/WASTE-L/N-I/XII/2025|2105/HO-SUPCO/WASTE-L/N-I/XII/2025|2025-12-03|0.25|1114440000|satu miliar seratus empat belas juta empat ratus empat puluh ribu Rupiah
0182/HO-SUPCO/WASTE-L/N-I/II/2026|0182/HO-SUPCO/WASTE-L/N-I/II/2026|2026-02-06|0.25|1057927680|satu miliar lima puluh tujuh juta sembilan ratus dua puluh tujuh ribu enam ratus delapan puluh Rupiah
0183/HO-SUPCO/WASTE-L/N-I/II/2026|0183/HO-SUPCO/WASTE-L/N-I/II/2026|2026-02-06|0.25|789210000|tujuh ratus delapan puluh sembilan juta dua ratus sepuluh ribu Rupiah
0184/HO-SUPCO/WASTE-L/N-I/II/2026|0184/HO-SUPCO/WASTE-L/N-I/II/2026|2026-02-06|0.25|526140000|lima ratus dua puluh enam juta seratus empat puluh ribu Rupiah
R08D-RP/INV/2026.03.13-3|R08D-RO/SPJ.2026.03.13-2|2026-03-13|0|48999990|empat puluh delapan juta sembilan ratus sembilan puluh sembilan ribu sembilan ratus sembilan puluh Rupiah"""

def insert_invoices():
    db = SessionLocal()
    try:
        lines = data_text.strip().split('\n')
        for line in lines:
            parts = line.split('|')
            no_invoice = parts[0]
            no_kontrak = parts[1]
            tgl = datetime.strptime(parts[2], '%Y-%m-%d').date()
            pph = float(parts[3])
            jumlah = float(parts[4])
            terbilang = parts[5]
            
            existing = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
            if existing:
                existing.no_kontrak = no_kontrak
                existing.tanggal_transaksi = tgl
                existing.pph_22_persen = pph
                existing.jumlah_pembayaran = jumlah
                existing.terbilang_invoice = terbilang
                print(f"Updated: {no_invoice}")
            else:
                new_inv = models.Invoice(
                    no_invoice=no_invoice,
                    no_kontrak=no_kontrak,
                    tanggal_transaksi=tgl,
                    status_invoice="Unpaid",
                    pph_22_persen=pph,
                    jumlah_pembayaran=jumlah,
                    terbilang_invoice=terbilang
                )
                db.add(new_inv)
                print(f"Inserted: {no_invoice}")
        
        db.commit()
        print("Done!")
    except Exception as e:
        print(f"Error: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    insert_invoices()
