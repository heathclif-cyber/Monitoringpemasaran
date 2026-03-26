"""
Seed script: Memasukkan data Delivery Order (DO) realisasi ke database.
Beberapa No. DO yang kosong di sumber data akan di-generate otomatis.
Baris dengan #N/A (no_invoice/no_kontrak tidak valid) dilewati.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import date
from database import SessionLocal, engine
import models
from models import Base

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# Hapus DO lama
print("Menghapus data DO lama...")
db.query(models.DeliveryOrder).delete()
db.commit()
print("DO lama dihapus.\n")

MONTHS_ID = {
    'Januari': 1, 'Februari': 2, 'Maret': 3, 'April': 4,
    'Mei': 5, 'Juni': 6, 'Juli': 7, 'Agustus': 8,
    'September': 9, 'Oktober': 10, 'November': 11, 'Desember': 12
}

def parse_date(s):
    if not s or s.strip() in ('#N/A', '', '-'):
        return None
    s = s.strip()
    if '/' in s:
        parts = s.split('/')
        if len(parts) == 3:
            return date(int(parts[2]), int(parts[1]), int(parts[0]))
    parts = s.split()
    if len(parts) == 3:
        return date(int(parts[2]), MONTHS_ID[parts[1]], int(parts[0]))
    return None

# ---------------------------------------------------------------
# Analisis data sumber:
# Row 2 (R08D-RO/INV/2026.02.06-1) = #N/A → SKIP
# Row 6 & Row 7 (183/HO-SUPCO/DO/KR/2026) = DUPLIKAT → ambil 1 saja
# Row 8-10 = no_do kosong di sumber → generate no_do sintetis
# ---------------------------------------------------------------

dos_raw = [
    # 1. DO Kelapa Gapoktan Nyiur Melambai
    {
        'no_do':            'R08D-RO/UK/2026.02.05-2',
        'no_invoice':       'R08D-RO/INV/2026.01.26-1',
        'tanggal_do':       date(2026, 2, 5),
        'tanggal_pembayaran': date(2026, 2, 5),
        'nominal_transfer': 271_950_000.0,
        'kepada_unit':      'Minahasa-Halmahera',
        'alamat_unit':      'Afdeling Tiniawangko, Kec. Tenga, Kab. Minahasa Selatan',
    },
    # 2. SKIP: R08D-RO/INV/2026.02.06-1 → #N/A (tidak ada kontrak valid)

    # 3. DO 0159 Brown Crepe 3X Hitam Beteleme — LUNAS
    {
        'no_do':            '0159/HO-SUPCO/DO/KR/2025',
        'no_invoice':       '0159/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_do':       date(2026, 1, 28),
        'tanggal_pembayaran': date(2026, 1, 30),
        'nominal_transfer': 623_376_000.0,
        'kepada_unit':      'Beteleme',
        'alamat_unit':      'PTPN I Regional 5 Kotta Blater',
    },
    # 4. DO 0160 Brown Crepe 3X Hitam Awaya-Telpaputih — LUNAS
    {
        'no_do':            '0160/HO-SUPCO/DO/KR/2025',
        'no_invoice':       '0160/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_do':       date(2026, 1, 28),
        'tanggal_pembayaran': date(2026, 1, 30),
        'nominal_transfer': 151_688_160.0,
        'kepada_unit':      'Awaya-Telpaputih',
        'alamat_unit':      'PTPN I Regional 5 Kotta Blater',
    },
    # 5. DO 182 Brown Crepe 3X Awaya-Telpaputih — LUNAS
    {
        'no_do':            '182/HO-SUPCO/DO/KR/2026',
        'no_invoice':       '0182/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_do':       date(2026, 2, 6),
        'tanggal_pembayaran': date(2026, 2, 10),
        'nominal_transfer': 1_057_927_680.0,
        'kepada_unit':      'Awaya-Telpaputih',
        'alamat_unit':      'PTPN I Regional 5 Kotta Blater',
    },
    # 6. DO 183 — Pembayaran termin 1 (10.000 kg × 23.700 × 1.11)
    {
        'no_do':            '183/HO-SUPCO/DO/KR/2026',
        'no_invoice':       '0183/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_do':       date(2026, 2, 6),
        'tanggal_pembayaran': date(2026, 2, 10),
        'nominal_transfer': 263_070_000.0,
        'kepada_unit':      'Beteleme',
        'alamat_unit':      'PTPN I Regional 5 Kotta Blater',
    },
    # 7. DO 0161 — Termin (12.240 kg × 27.200 × 1.11 = 369.550.080)
    #    No DO di sumber kosong → generate sintetis
    {
        'no_do':            'DO-0161/2026-02-24',
        'no_invoice':       '0161/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_do':       date(2026, 2, 24),
        'tanggal_pembayaran': date(2026, 2, 24),
        'nominal_transfer': 369_550_080.0,
        'kepada_unit':      'Awaya-Telpaputih',
        'alamat_unit':      'PTPN I Regional 5 Kotta Blater',
    },
    # 8. DO 0183 — Termin 2 (10.000 kg)
    #    No DO di sumber kosong → generate sintetis
    {
        'no_do':            'DO-0183/2026-02-24',
        'no_invoice':       '0183/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_do':       date(2026, 2, 24),
        'tanggal_pembayaran': date(2026, 2, 24),
        'nominal_transfer': 263_070_000.0,
        'kepada_unit':      'Beteleme',
        'alamat_unit':      'PTPN I Regional 5 Kotta Blater',
    },
    # 9. DO 0184 — Termin (10.000 kg × 23.700 × 1.11)
    #    No DO di sumber kosong → generate sintetis
    {
        'no_do':            'DO-0184/2026-02-24',
        'no_invoice':       '0184/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_do':       date(2026, 2, 24),
        'tanggal_pembayaran': date(2026, 2, 24),
        'nominal_transfer': 263_070_000.0,
        'kepada_unit':      'Awaya-Telpaputih',
        'alamat_unit':      'PTPN I Regional 5 Kotta Blater',
    },
    # 10. DO Kelapa CV Angin Utara — LUNAS
    {
        'no_do':            'R08D-RH/SKJ/2026.03.06-1',
        'no_invoice':       'R08D-RO/INV/2026.02.18-1',
        'tanggal_do':       date(2026, 3, 6),
        'tanggal_pembayaran': date(2026, 3, 6),
        'nominal_transfer': 416_250_000.0,
        'kepada_unit':      'Minahasa-Halmahera',
        'alamat_unit':      'Afdeling Tiniawangko, Kec. Tenga, Kab. Minahasa Selatan',
    },
]

# Hitung selisih per invoice untuk referensi
print(f"Memasukkan {len(dos_raw)} data DO...\n")
inserted = 0
for raw in dos_raw:
    try:
        # Cari invoice untuk hitung selisih
        inv = db.query(models.Invoice).filter(
            models.Invoice.no_invoice == raw['no_invoice']
        ).first()

        if not inv:
            print(f"  ⚠ SKIP: {raw['no_do']} — Invoice '{raw['no_invoice']}' tidak ditemukan di DB")
            continue

        # Hitung total DO lain untuk invoice ini (untuk selisih akumulasi)
        total_paid_so_far = db.query(
            __import__('sqlalchemy').func.sum(models.DeliveryOrder.nominal_transfer)
        ).filter(
            models.DeliveryOrder.no_invoice == raw['no_invoice']
        ).scalar() or 0.0

        selisih = inv.jumlah_pembayaran - (total_paid_so_far + raw['nominal_transfer'])

        do = models.DeliveryOrder(
            no_do=raw['no_do'],
            no_invoice=raw['no_invoice'],
            tanggal_do=raw['tanggal_do'],
            tanggal_pembayaran=raw.get('tanggal_pembayaran'),
            nominal_transfer=raw['nominal_transfer'],
            kepada_unit=raw.get('kepada_unit', ''),
            alamat_unit=raw.get('alamat_unit', ''),
            selisih=selisih,
        )
        db.add(do)
        db.commit()
        db.refresh(do)

        status = '✅ LUNAS' if selisih <= 0 else f'⏳ Sisa Rp{selisih:,.0f}'
        print(f"  ✓ {raw['no_do'][:45]:<47} | Rp{raw['nominal_transfer']:>16,.0f} | {status}")
        inserted += 1

    except Exception as e:
        db.rollback()
        print(f"  ✗ ERROR: {raw['no_do']} → {e}")

db.close()

# Summary by invoice
print(f"\n✅ Selesai! {inserted}/{len(dos_raw)} DO berhasil dimasukkan.")
print("\n--- Rekapitulasi Cash In per Invoice ---")
db2 = SessionLocal()
invoices = db2.query(models.Invoice).all()
total_cash = 0
for inv in invoices:
    dos = db2.query(models.DeliveryOrder).filter(
        models.DeliveryOrder.no_invoice == inv.no_invoice
    ).all()
    paid = sum(d.nominal_transfer for d in dos)
    total_cash += paid
    if paid > 0:
        sisa = inv.jumlah_pembayaran - paid
        pct = (paid / inv.jumlah_pembayaran * 100) if inv.jumlah_pembayaran else 0
        flag = '✅ LUNAS' if sisa <= 0 else f'⏳ Sisa Rp{sisa:,.0f}'
        print(f"  {inv.no_invoice[:40]:<42} Total: Rp{inv.jumlah_pembayaran:>16,.0f} | Bayar: Rp{paid:>16,.0f} | {pct:.0f}% | {flag}")
print(f"\nTotal Cash In: Rp{total_cash:,.0f}")
db2.close()
