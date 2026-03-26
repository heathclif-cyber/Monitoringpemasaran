"""
Seed script: Memasukkan data Invoice realisasi aktual ke database.
Nilai jumlah_pembayaran diinput langsung sesuai data realisasi (bukan dari kalkulasi).
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

# Hapus invoice lama
print("Menghapus data invoice lama...")
db.query(models.DeliveryOrder).delete()
db.query(models.Invoice).delete()
db.commit()
print("Invoice lama dihapus.\n")

MONTHS_ID = {
    'Januari': 1, 'Februari': 2, 'Maret': 3, 'April': 4,
    'Mei': 5, 'Juni': 6, 'Juli': 7, 'Agustus': 8,
    'September': 9, 'Oktober': 10, 'November': 11, 'Desember': 12
}

def parse_date(s):
    s = s.strip()
    if '/' in s:
        parts = s.split('/')
        return date(int(parts[2]), int(parts[1]), int(parts[0]))
    parts = s.split()
    return date(int(parts[2]), MONTHS_ID[parts[1]], int(parts[0]))

# Data invoice realisasi — nilai exakt dari dokumen
invoices_raw = [
    {
        'no_invoice':          'R08D-RO/INV/2026.01.26-1',
        'no_kontrak':          'R08D-RO/SPJ/2026.01.26-1',
        'tanggal_transaksi':   parse_date('26 Januari 2026'),
        'status_invoice':      'Paid',
        'nilai_pokok':         245_000_000.0,
        'nominal_ppn':         26_950_000.0,
        'nominal_pph22':       0.0,
        'jumlah_pembayaran':   271_950_000.0,
        'terbilang_invoice':   'Dua Ratus Tujuh Puluh Satu Juta Sembilan Ratus Lima Puluh Ribu Rupiah',
        'pph_22_persen':       0.0,
    },
    {
        'no_invoice':          'R08D-RO/INV/2026.02.18-1',
        'no_kontrak':          'R08D-RO/SPJ/2026.02.18-2',
        'tanggal_transaksi':   parse_date('18 Februari 2026'),
        'status_invoice':      'Paid',
        'nilai_pokok':         375_000_000.0,
        'nominal_ppn':         41_250_000.0,
        'nominal_pph22':       937_500.0,
        'jumlah_pembayaran':   416_250_000.0,
        'terbilang_invoice':   'Empat Ratus Enam Belas Juta Dua Ratus Lima Puluh Ribu Rupiah',
        'pph_22_persen':       0.25,
    },
    {
        'no_invoice':          '0159/HO-SUPCO/WASTE-L/N-I/I/2026',
        'no_kontrak':          '0159/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_transaksi':   parse_date('28 Januari 2026'),
        'status_invoice':      'Paid',
        'nilai_pokok':         561_600_000.0,
        'nominal_ppn':         61_776_000.0,
        'nominal_pph22':       1_404_000.0,
        'jumlah_pembayaran':   623_376_000.0,
        'terbilang_invoice':   'Enam Ratus Dua Puluh Tiga Juta Tiga Ratus Tujuh Puluh Enam Ribu Rupiah',
        'pph_22_persen':       0.25,
    },
    {
        'no_invoice':          '0160/HO-SUPCO/WASTE-L/N-I/I/2026',
        'no_kontrak':          '0160/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_transaksi':   parse_date('28 Januari 2026'),
        'status_invoice':      'Paid',
        'nilai_pokok':         136_656_000.0,
        'nominal_ppn':         15_032_160.0,
        'nominal_pph22':       341_640.0,
        'jumlah_pembayaran':   151_688_160.0,
        'terbilang_invoice':   'Seratus Lima Puluh Satu Juta Enam Ratus Delapan Puluh Delapan Ribu Seratus Enam Puluh Rupiah',
        'pph_22_persen':       0.25,
    },
    {
        'no_invoice':          '0161/HO-SUPCO/WASTE-L/N-I/I/2026',
        'no_kontrak':          '0161/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_transaksi':   parse_date('28 Januari 2026'),
        'status_invoice':      'Paid',
        'nilai_pokok':         604_928_000.0,
        'nominal_ppn':         66_542_080.0,
        'nominal_pph22':       1_512_320.0,
        'jumlah_pembayaran':   671_470_080.0,
        'terbilang_invoice':   'Enam Ratus Tujuh Puluh Satu Juta Empat Ratus Tujuh Puluh Ribu Delapan Puluh Rupiah',
        'pph_22_persen':       0.25,
    },
    {
        'no_invoice':          '2105/HO-SUPCO/WASTE-L/N-I/XII/2025',
        'no_kontrak':          '2105/HO-SUPCO/WASTE-L/N-I/XII/2025',
        'tanggal_transaksi':   parse_date('03 Desember 2025'),
        'status_invoice':      'Paid',
        'nilai_pokok':         1_004_000_000.0,
        'nominal_ppn':         110_440_000.0,
        'nominal_pph22':       2_510_000.0,
        'jumlah_pembayaran':   1_114_440_000.0,
        'terbilang_invoice':   'Satu Miliar Seratus Empat Belas Juta Empat Ratus Empat Puluh Ribu Rupiah',
        'pph_22_persen':       0.25,
    },
    {
        'no_invoice':          '0182/HO-SUPCO/WASTE-L/N-I/II/2026',
        'no_kontrak':          '0182/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_transaksi':   parse_date('06 Februari 2026'),
        'status_invoice':      'Paid',
        'nilai_pokok':         953_088_000.0,
        'nominal_ppn':         104_839_680.0,
        'nominal_pph22':       2_382_720.0,
        'jumlah_pembayaran':   1_057_927_680.0,
        'terbilang_invoice':   'Satu Miliar Lima Puluh Tujuh Juta Sembilan Ratus Dua Puluh Tujuh Ribu Enam Ratus Delapan Puluh Rupiah',
        'pph_22_persen':       0.25,
    },
    {
        'no_invoice':          '0183/HO-SUPCO/WASTE-L/N-I/II/2026',
        'no_kontrak':          '0183/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_transaksi':   parse_date('06 Februari 2026'),
        'status_invoice':      'Paid',
        'nilai_pokok':         711_000_000.0,
        'nominal_ppn':         78_210_000.0,
        'nominal_pph22':       1_777_500.0,
        'jumlah_pembayaran':   789_210_000.0,
        'terbilang_invoice':   'Tujuh Ratus Delapan Puluh Sembilan Juta Dua Ratus Sepuluh Ribu Rupiah',
        'pph_22_persen':       0.25,
    },
    {
        'no_invoice':          '0184/HO-SUPCO/WASTE-L/N-I/II/2026',
        'no_kontrak':          '0184/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_transaksi':   parse_date('06 Februari 2026'),
        'status_invoice':      'Paid',
        'nilai_pokok':         474_000_000.0,
        'nominal_ppn':         52_140_000.0,
        'nominal_pph22':       1_185_000.0,
        'jumlah_pembayaran':   526_140_000.0,
        'terbilang_invoice':   'Lima Ratus Dua Puluh Enam Juta Seratus Empat Puluh Ribu Rupiah',
        'pph_22_persen':       0.25,
    },
    {
        'no_invoice':          'R08D-RP/INV/2026.03.13-3',
        'no_kontrak':          'R08D-RO/SPJ.2026.03.13-2',
        'tanggal_transaksi':   parse_date('13 Maret 2026'),
        'status_invoice':      'Unpaid',
        'nilai_pokok':         44_144_135.0,
        'nominal_ppn':         4_855_855.0,
        'nominal_pph22':       0.0,
        'jumlah_pembayaran':   48_999_990.0,
        'terbilang_invoice':   'Empat Puluh Delapan Juta Sembilan Ratus Sembilan Puluh Sembilan Ribu Sembilan Ratus Sembilan Puluh Rupiah',
        'pph_22_persen':       0.0,
    },
]

print(f"Memasukkan {len(invoices_raw)} data invoice...")
inserted = 0
for raw in invoices_raw:
    try:
        inv = models.Invoice(
            no_invoice=raw['no_invoice'],
            no_kontrak=raw['no_kontrak'],
            tanggal_transaksi=raw['tanggal_transaksi'],
            status_invoice=raw['status_invoice'],
            pph_22_persen=raw['pph_22_persen'],
            jumlah_pembayaran=raw['jumlah_pembayaran'],
            terbilang_invoice=raw['terbilang_invoice'],
        )
        db.add(inv)
        db.commit()
        db.refresh(inv)
        thn = raw['tanggal_transaksi'].year
        bulan = raw['tanggal_transaksi'].month
        print(f"  [{thn}-{bulan:02d}] ✓ {raw['no_invoice'][:42]:<44} | Total: Rp{raw['jumlah_pembayaran']:>18,.0f}")
        inserted += 1
    except Exception as e:
        db.rollback()
        print(f"  ✗ ERROR: {raw['no_invoice']} → {e}")

db.close()

# Summary
print(f"\n✅ Selesai! {inserted}/{len(invoices_raw)} invoice berhasil dimasukkan.")

# Grand total by year
total_2025 = sum(r['jumlah_pembayaran'] for r in invoices_raw if r['tanggal_transaksi'].year == 2025)
total_2026 = sum(r['jumlah_pembayaran'] for r in invoices_raw if r['tanggal_transaksi'].year == 2026)
print(f"\nTotal Invoice 2025: Rp{total_2025:,.0f}")
print(f"Total Invoice 2026: Rp{total_2026:,.0f}")
