import os
import sys
from datetime import datetime

sys.path.append(os.getcwd())
import models
from database import SessionLocal

do_data = [
    {
        "no_do": "R08D-RO/UK/2026.02.05-2",
        "no_invoice": "R08D-RO/INV/2026.01.26-1",
        "tgl_bayar": "2026-02-05",
        "nominal": 271950000,
        "tgl_do": "2026-02-05",
        "unit": "Minahasa-Halmahera",
        "alamat": "Afdeling Tiniawangko, Kec. Tenga, Kab. Minahasa Selatan"
    },
    {
        "no_do": "0159/HO-SUPCO/DO/KR/2025",
        "no_invoice": "0159/HO-SUPCO/WASTE-L/N-I/I/2026",
        "tgl_bayar": "2026-01-30",
        "nominal": 623376000,
        "tgl_do": "2026-01-28",
        "unit": "Beteleme",
        "alamat": "PTPN I Regional 5 Kotta Blater"
    },
    {
        "no_do": "0160/HO-SUPCO/DO/KR/2025",
        "no_invoice": "0160/HO-SUPCO/WASTE-L/N-I/I/2026",
        "tgl_bayar": "2026-01-30",
        "nominal": 151688160,
        "tgl_do": "2026-01-28",
        "unit": "Awaya-Telpaputih",
        "alamat": "PTPN I Regional 5 Kotta Blater"
    },
    {
        "no_do": "182/HO-SUPCO/DO/KR/2026",
        "no_invoice": "0182/HO-SUPCO/WASTE-L/N-I/II/2026",
        "tgl_bayar": "2026-02-10",
        "nominal": 1057927680,
        "tgl_do": "2026-02-06",
        "unit": "Awaya-Telpaputih",
        "alamat": "PTPN I Regional 5 Kotta Blater"
    },
    {
        "no_do": "183/HO-SUPCO/DO/KR/2026",
        "no_invoice": "0183/HO-SUPCO/WASTE-L/N-I/II/2026",
        "tgl_bayar": "2026-02-10",
        "nominal": 263070000,
        "tgl_do": "2026-02-10",  # Fallback to payment date
        "unit": "Beteleme",
        "alamat": "PTPN I Regional 5 Kotta Blater"
    },
    {
        "no_do": "R08D-RH/SKJ/2026.03.06-1",
        "no_invoice": "R08D-RO/INV/2026.02.18-1",
        "tgl_bayar": "2026-03-06",
        "nominal": 416250000,
        "tgl_do": "2026-03-06",
        "unit": "Minahasa-Halmahera",
        "alamat": "Afdeling Tiniawangko, Kec. Tenga, Kab. Minahasa Selatan"
    }
]

def insert_dos():
    db = SessionLocal()
    try:
        for idx, data in enumerate(do_data):
            no_do = data["no_do"]
            if not no_do or no_do == "#N/A": continue
            
            existing = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
            tgl_do = datetime.strptime(data["tgl_do"], '%Y-%m-%d').date()
            tgl_bayar = datetime.strptime(data["tgl_bayar"], '%Y-%m-%d').date() if data["tgl_bayar"] else None
            
            if existing:
                existing.no_invoice = data["no_invoice"]
                existing.tanggal_do = tgl_do
                existing.kepada_unit = data["unit"]
                existing.alamat_unit = data["alamat"]
                existing.tanggal_pembayaran = tgl_bayar
                existing.nominal_transfer = data["nominal"]
                print(f"Updated DO: {no_do}")
            else:
                new_do = models.DeliveryOrder(
                    no_do=no_do,
                    no_invoice=data["no_invoice"],
                    tanggal_do=tgl_do,
                    kepada_unit=data["unit"],
                    alamat_unit=data["alamat"],
                    tanggal_pembayaran=tgl_bayar,
                    nominal_transfer=data["nominal"]
                )
                db.add(new_do)
                print(f"Inserted DO: {no_do}")
                
        # Also let's try mapping the ones without clear NO DOs as bypassing or if they are just delivery orders with their invoice num
        extra_dos = [
            ("0161/HO-SUPCO/DO/KR/2026", "0161/HO-SUPCO/WASTE-L/N-I/I/2026", "2026-02-24", 369550080, "Awaya-Telpaputih"),
            ("0184/HO-SUPCO/DO/KR/2026", "0184/HO-SUPCO/WASTE-L/N-I/II/2026", "2026-02-24", 263070000, "Awaya-Telpaputih")
        ]
        
        for e in extra_dos:
            existing = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == e[0]).first()
            if not existing:
                new_do = models.DeliveryOrder(
                    no_do=e[0],
                    no_invoice=e[1],
                    tanggal_do=datetime.strptime(e[2], "%Y-%m-%d").date(),
                    kepada_unit=e[4],
                    alamat_unit="PTPN I Regional 5 Kotta Blater",
                    tanggal_pembayaran=datetime.strptime(e[2], "%Y-%m-%d").date(),
                    nominal_transfer=e[3]
                )
                db.add(new_do)
                print(f"Inserted DO: {e[0]}")
            
        db.commit()
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    insert_dos()
