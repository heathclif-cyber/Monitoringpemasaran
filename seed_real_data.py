"""
Seed script: menghapus data dummy dan memasukkan data kontrak real PTPN I
"""
import sys
import os
import math
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine
import models
from models import Base
from services.utils import terbilang_rupiah

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# ===== HAPUS DATA LAMA =====
print("Menghapus data lama...")
db.query(models.DeliveryOrder).delete()
db.query(models.Invoice).delete()
db.query(models.Kontrak).delete()
db.commit()
print("Data lama berhasil dihapus.")

MONTHS_ID = {
    'Januari': 1, 'Februari': 2, 'Maret': 3, 'April': 4,
    'Mei': 5, 'Juni': 6, 'Juli': 7, 'Agustus': 8,
    'September': 9, 'Oktober': 10, 'November': 11, 'Desember': 12
}

def parse_date(s):
    """Parse 'DD Bulan YYYY' or 'DD/MM/YYYY' format"""
    s = s.strip()
    if '/' in s:
        parts = s.split('/')
        return date(int(parts[2]), int(parts[1]), int(parts[0]))
    parts = s.split()
    d = int(parts[0])
    m = MONTHS_ID[parts[1]]
    y = int(parts[2])
    return date(y, m, d)

def make_kontrak(data: dict):
    vol = data['volume']
    hrg = data['harga_satuan']
    premi = data.get('premi', 0.0)
    ppn = data.get('ppn_persen', 11.0)
    lama_byr = data.get('lama_pembayaran_hari', 14)
    nilai = (vol * hrg) + premi
    nom_ppn = nilai * (ppn / 100)
    tgl = data['tanggal_kontrak']
    jatuh_tempo = tgl + timedelta(days=lama_byr)
    terbilang = terbilang_rupiah(math.floor(nilai))

    syarat = (
        f"a. Pembayaran dilaksanakan selambat-lambatnya {lama_byr} hari kalender setelah ditandatanganinya Kontrak penjualan\n"
        f"b. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran\n"
        f"c. Pengambilan barang selambat-lambatnya {data.get('penyerahan_hari', 15)} hari kalender dari batas akhir tanggal pembayaran\n"
        f"d. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli"
    )

    k = models.Kontrak(
        no_kontrak=data['no_kontrak'],
        tanggal_kontrak=tgl,
        status=data.get('status', 'Active'),
        pembeli=data['pembeli'],
        nama_direktur=data.get('nama_direktur', ''),
        alamat_pembeli=data.get('alamat_pembeli', ''),
        komoditi=data.get('komoditi', ''),
        satuan=data.get('satuan', 'Kg'),
        jenis_komoditi=data.get('jenis_komoditi', ''),
        tahun_panen=data.get('tahun_panen', '2025'),
        kebun_produsen=data.get('kebun_produsen', ''),
        simbol=data.get('simbol', '-'),
        packaging=data.get('packaging', '-'),
        deskripsi_produk=data.get('deskripsi_produk', ''),
        mutu=data.get('mutu', ''),
        pelabuhan_muat=data.get('pelabuhan_muat', ''),
        volume=vol,
        harga_satuan=hrg,
        premi=premi,
        ppn_persen=ppn,
        kondisi_penyerahan=data.get('kondisi_penyerahan', ''),
        waktu_penyerahan=data.get('waktu_penyerahan', ''),
        levering=data.get('levering', ''),
        catatan=data.get('catatan', ''),
        no_reff=data.get('no_reff', ''),
        chop=data.get('chop', ''),
        pack_qty=data.get('pack_qty', 0.0),
        banyaknya_bale_karung=data.get('banyaknya_bale_karung', 0.0),
        no_kav_chop=data.get('no_kav_chop', ''),
        alamat_produksi=data.get('alamat_produksi', ''),
        lama_pembayaran_hari=lama_byr,
        penyerahan_hari=data.get('penyerahan_hari', 15),
        lokasi='Makassar',
        pemilik_komoditas='PT Perkebunan Nusantara I Regional 8',
        penjual='PT Perkebunan Nusantara I Regional 8\nJalan Urip Sumoharjo No. 72-76, Kota Makassar',
        pembayaran_metode='Tunai',
        pembayaran_cara='Transfer',
        pembayaran_bank='Bank Rakyat Indonesia',
        pembayaran_atas_nama='PT Perkebunan Nusantara I Regional 8',
        pembayaran_rek_no='No. 0050-01-005356-30-0',
        bid_offer_nomor='-',
        syarat_syarat=syarat,
        dasar_ketentuan='Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)',
        # Calculated
        nilai_transaksi=nilai,
        nominal_ppn=nom_ppn,
        jatuh_tempo_pembayaran=jatuh_tempo,
        terbilang=terbilang,
    )
    return k

# ===== DATA REAL =====
kontraks_raw = [
    {
        'no_kontrak': 'R08D-RO/SPJ/2026.01.26-1',
        'tanggal_kontrak': parse_date('26 Januari 2026'),
        'status': 'Active',
        'pembeli': 'Gapoktan Nyiur Melambai',
        'nama_direktur': 'Frans D. Tilaar',
        'alamat_pembeli': 'Lingkungan Jaga IV, Desa Elusan, Kecamatan Amurang Barat, Kabupaten Minahasa Selatan, Sulawesi Utara, 95955',
        'komoditi': 'Kelapa',
        'satuan': 'Butir',
        'jenis_komoditi': 'Genjah Kuning Nias',
        'tahun_panen': '2025',
        'kebun_produsen': 'Minahasa-Halmahera',
        'simbol': '-',
        'packaging': '-',
        'deskripsi_produk': 'Butir',
        'mutu': '-',
        'pelabuhan_muat': '-',
        'volume': 35000,
        'harga_satuan': 7000,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Netto tanpa Pembungkus',
        'waktu_penyerahan': 'Januari - Februari 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'Afdeling Tiniawangko, Kec. Tenga, Kab. Minahasa Selatan',
        'lama_pembayaran_hari': 14,
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '0159/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_kontrak': parse_date('28 Januari 2026'),
        'status': 'Active',
        'pembeli': 'PT Nasional Bhirawa Tama',
        'nama_direktur': 'Welly Budi Sanjaya',
        'alamat_pembeli': 'Jl Peltu Sujono No.21 Malang 65148',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Brown Crepe 3X Hitam',
        'tahun_panen': '2025',
        'kebun_produsen': 'Beteleme',
        'simbol': '',
        'packaging': '300 unit @ 80 kg Bale',
        'deskripsi_produk': 'Brown Crepe 3X Hitam',
        'mutu': '',
        'pelabuhan_muat': 'Loco Gudang Transito Jember',
        'volume': 24000,
        'harga_satuan': 23400,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Gudang Transito Jember',
        'waktu_penyerahan': 'Januari - Februari 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'PTPN I Regional 5 Kotta Blater',
        'lama_pembayaran_hari': 58,  # Jatuh tempo 27/03/2026 dari 28/01/2026
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '0160/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_kontrak': parse_date('28 Januari 2026'),
        'status': 'Active',
        'pembeli': 'PT Nasional Bhirawa Tama',
        'nama_direktur': 'Welly Budi Sanjaya',
        'alamat_pembeli': 'Jl Peltu Sujono No.21 Malang 65148',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Brown Crepe 3X Hitam',
        'tahun_panen': '2025',
        'kebun_produsen': 'Awaya-Telpaputih',
        'simbol': '',
        'packaging': '73 Unit @ 80 Bale',
        'deskripsi_produk': 'Brown Crepe 3X Hitam',
        'mutu': '',
        'pelabuhan_muat': 'Loco Gudang Transito Jember',
        'volume': 5840,
        'harga_satuan': 23400,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Gudang Transito Jember',
        'waktu_penyerahan': 'Januari - Februari 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'PTPN I Regional 5 Kotta Blater',
        'lama_pembayaran_hari': 58,
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '0161/HO-SUPCO/WASTE-L/N-I/I/2026',
        'tanggal_kontrak': parse_date('28 Januari 2026'),
        'status': 'Active',
        'pembeli': 'PT Nasional Bhirawa Tama',
        'nama_direktur': 'Welly Budi Sanjaya',
        'alamat_pembeli': 'Jl Peltu Sujono No.21 Malang 65148',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Brown Crepe 3X',
        'tahun_panen': '2025',
        'kebun_produsen': 'Awaya-Telpaputih',
        'simbol': '',
        'packaging': '278 unit @ 80 kg Bale',
        'deskripsi_produk': 'Brown Crepe 3X',
        'mutu': '',
        'pelabuhan_muat': 'Loco Gudang Transito Jember',
        'volume': 22240,
        'harga_satuan': 27200,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Gudang Transito Jember',
        'waktu_penyerahan': 'Februari - Maret 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'PTPN I Regional 5 Kotta Blater',
        'lama_pembayaran_hari': 58,
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '2105/HO-SUPCO/WASTE-L/N-I/XII/2025',
        'tanggal_kontrak': parse_date('03 Desember 2025'),
        'status': 'Active',
        'pembeli': 'PT Nasional Bhirawa Tama',
        'nama_direktur': 'Welly Budi Sanjaya',
        'alamat_pembeli': 'Jl Peltu Sujono No.21 Malang 65149',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Brown Crepe 3X',
        'tahun_panen': '2025',
        'kebun_produsen': 'Beteleme',
        'simbol': '',
        'packaging': '502 unit @ 80 kg Bale',
        'deskripsi_produk': 'Brown Crepe 3X',
        'mutu': '',
        'pelabuhan_muat': 'Loco Gudang Transito Jember',
        'volume': 40160,
        'harga_satuan': 25000,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Gudang Transito Jember',
        'waktu_penyerahan': 'Desember 2025 - Januari 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'PTPN I Regional 5 Kotta Blater',
        'lama_pembayaran_hari': 54,  # 26/01/2025 jatuh tempo
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': 'R08D-RO/SPJ/2026.02.18-2',
        'tanggal_kontrak': parse_date('18 Februari 2026'),
        'status': 'Active',
        'pembeli': 'CV Angin Utara',
        'nama_direktur': 'Yolanda Nova Bukara',
        'alamat_pembeli': 'Kelurahan Bengkol, Kecamatan Mapanget, Kota Manado',
        'komoditi': 'Kelapa',
        'satuan': 'Butir',
        'jenis_komoditi': 'Genjah Kuning Nias',
        'tahun_panen': '2025-2026',
        'kebun_produsen': 'Minahasa-Halmahera',
        'simbol': '-',
        'packaging': '-',
        'deskripsi_produk': 'Butir',
        'mutu': '-',
        'pelabuhan_muat': '-',
        'volume': 50000,
        'harga_satuan': 7500,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Netto tanpa Pembungkus',
        'waktu_penyerahan': 'Februari - April 2026',
        'levering': '',
        'catatan': 'Diberikan refraksi sebagaimana diatur di peraturan terkait yang berlaku',
        'no_reff': '',
        'alamat_produksi': 'Afdeling Tiniawangko, Kec. Tenga, Kab. Minahasa Selatan',
        'lama_pembayaran_hari': 14,
        'penyerahan_hari': 30,
    },
    {
        'no_kontrak': '0182/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_kontrak': parse_date('06 Februari 2026'),
        'status': 'Active',
        'pembeli': 'PT Nasional Bhirawa Tama',
        'nama_direktur': 'Welly Budi Sanjaya',
        'alamat_pembeli': 'Jl Peltu Sujono No.21 Malang 65149',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Brown Crepe 3X',
        'tahun_panen': '2025',
        'kebun_produsen': 'Awaya-Telpaputih',
        'simbol': '',
        'packaging': '438 Unit @ 80 kg Bale',
        'deskripsi_produk': 'Brown Crepe 3X',
        'mutu': '',
        'pelabuhan_muat': 'Loco Gudang Transito Jember',
        'volume': 35040,
        'harga_satuan': 27200,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Gudang Transito Jember',
        'waktu_penyerahan': 'Februari - Maret 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'PTPN I Regional 5 Kotta Blater',
        'lama_pembayaran_hari': -3,  # 03/02/2026, tapi kita pakai 14 default kalau negatif
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '0183/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_kontrak': parse_date('06 Februari 2026'),
        'status': 'Active',
        'pembeli': 'PT Nasional Bhirawa Tama',
        'nama_direktur': 'Welly Budi Sanjaya',
        'alamat_pembeli': 'Jl Peltu Sujono No.21 Malang 65149',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Brown Crepe 3X Hitam',
        'tahun_panen': '2025',
        'kebun_produsen': 'Beteleme',
        'simbol': '',
        'packaging': '375 Unit @ 80 kg Bale',
        'deskripsi_produk': 'Brown Crepe 3X Hitam',
        'mutu': '',
        'pelabuhan_muat': 'Loco Gudang Transito Jember',
        'volume': 30000,
        'harga_satuan': 23700,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Gudang Transito Jember',
        'waktu_penyerahan': 'Februari - Maret 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'PTPN I Regional 5 Kotta Blater',
        'lama_pembayaran_hari': 14,  # ~03/02/2026
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '0184/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_kontrak': parse_date('06 Februari 2026'),
        'status': 'Active',
        'pembeli': 'PT Nasional Bhirawa Tama',
        'nama_direktur': 'Welly Budi Sanjaya',
        'alamat_pembeli': 'Jl Peltu Sujono No.21 Malang 65149',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Brown Crepe 3X Hitam',
        'tahun_panen': '2025',
        'kebun_produsen': 'Awaya-Telpaputih',
        'simbol': '',
        'packaging': '250 Unit @ 80 kg Bale',
        'deskripsi_produk': 'Brown Crepe 3X Hitam',
        'mutu': '',
        'pelabuhan_muat': 'Loco Gudang Transito Jember',
        'volume': 20000,
        'harga_satuan': 23700,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Gudang Transito Jember',
        'waktu_penyerahan': 'Februari - Maret 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'PTPN I Regional 5 Kotta Blater',
        'lama_pembayaran_hari': 14,
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '011/SGN/SPJB/BO/GKP-N1/II/2026',
        'tanggal_kontrak': parse_date('25 Februari 2026'),
        'status': 'Active',
        'pembeli': 'PT Kaya Makmur Damai Sentosa',
        'nama_direktur': 'Michael Jonathan',
        'alamat_pembeli': 'Jl Maccini Baru No.142 RT 016 RW 003, Maccini Gusung Makassar',
        'komoditi': 'Tebu',
        'satuan': 'Kg',
        'jenis_komoditi': '',
        'tahun_panen': '2025',
        'kebun_produsen': 'Takalar',
        'simbol': '',
        'packaging': '',
        'deskripsi_produk': '',
        'mutu': '',
        'pelabuhan_muat': 'Loco Gudang PG Takalar',
        'volume': 20900,
        'harga_satuan': 14800,
        'premi': 0,
        'ppn_persen': 0,  # tidak ada PPN di data
        'kondisi_penyerahan': 'Loco Gudang PG Takalar',
        'waktu_penyerahan': '',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'PG Takalar',
        'lama_pembayaran_hari': 9,  # 06/03/2026 dari 25/02/2026
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '0353/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_kontrak': parse_date('27 Februari 2026'),
        'status': 'Active',
        'pembeli': 'PT Wipolimex Raya',
        'nama_direktur': 'Wijaya Sumono',
        'alamat_pembeli': 'Jl Prof. HM.Yamin SH LK II No.62 Kisaran Timur, Asahan',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Lump',
        'tahun_panen': '2025-2026',
        'kebun_produsen': 'Beteleme',
        'simbol': '',
        'packaging': '',
        'deskripsi_produk': '',
        'mutu': '',
        'pelabuhan_muat': 'Loco Kebun Unit Beteleme',
        'volume': 60000,
        'harga_satuan': 28500,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Kebun Unit Beteleme',
        'waktu_penyerahan': 'Maret - April 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'Kebun Unit Beteleme',
        'lama_pembayaran_hari': 28,  # 27/03/2026 dari 27/02/2026
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': '0354/HO-SUPCO/WASTE-L/N-I/II/2026',
        'tanggal_kontrak': parse_date('27 Februari 2026'),
        'status': 'Active',
        'pembeli': 'PT Wipolimex Raya',
        'nama_direktur': 'Wijaya Sumono',
        'alamat_pembeli': 'Jl Prof. HM.Yamin SH LK II No.62 Kisaran Timur, Asahan',
        'komoditi': 'Karet',
        'satuan': 'Kg',
        'jenis_komoditi': 'Lump',
        'tahun_panen': '2025-2026',
        'kebun_produsen': 'Awaya-Telpaputih',
        'simbol': '',
        'packaging': '',
        'deskripsi_produk': '',
        'mutu': '',
        'pelabuhan_muat': 'Loco Kebun Unit Awaya-Telpaputih',
        'volume': 60000,
        'harga_satuan': 28500,
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Loco Kebun Unit Awaya-Telpaputih',
        'waktu_penyerahan': 'Maret - April 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'Kebun Unit Awaya-Telpaputih',
        'lama_pembayaran_hari': 28,
        'penyerahan_hari': 15,
    },
    {
        'no_kontrak': 'R08D-RO/SPJ.2026.03.13-2',
        'tanggal_kontrak': parse_date('13 Maret 2026'),
        'status': 'Active',
        'pembeli': 'Toko Aron Masohi',
        'nama_direktur': 'Suriani Salim',
        'alamat_pembeli': 'Jl Abdullah Soslissa, Masohi, Maluku Tengah',
        'komoditi': 'Kelapa',
        'satuan': 'Kg',
        'jenis_komoditi': 'Kopra',
        'tahun_panen': '2026',
        'kebun_produsen': 'Awaya-Telpaputih',
        'simbol': '',
        'packaging': '-',
        'deskripsi_produk': 'Kupas',
        'mutu': '',
        'pelabuhan_muat': '-',
        'volume': 3500,
        'harga_satuan': 12613,  # 49.000.000 / 3500 / 1.11 = ~12613
        'premi': 0,
        'ppn_persen': 11,
        'kondisi_penyerahan': 'Netto tanpa Pembungkus',
        'waktu_penyerahan': 'Maret - April 2026',
        'levering': '',
        'catatan': '',
        'no_reff': '',
        'alamat_produksi': 'Kebun Unit Awaya-Telpaputih',
        'lama_pembayaran_hari': 14,
        'penyerahan_hari': 15,
    },
]

# Fix kontrak 0182 lama_pembayaran_hari jika negatif
for k in kontraks_raw:
    if k.get('lama_pembayaran_hari', 1) <= 0:
        k['lama_pembayaran_hari'] = 14

print(f"\nMemasukkan {len(kontraks_raw)} data kontrak...")
inserted = 0
for raw in kontraks_raw:
    try:
        k = make_kontrak(raw)
        db.add(k)
        db.commit()
        db.refresh(k)
        print(f"  ✓ {k.no_kontrak} | {k.pembeli[:30]:<30} | Vol: {k.volume:>10,.0f} | Nilai: Rp{k.nilai_transaksi:>15,.0f}")
        inserted += 1
    except Exception as e:
        db.rollback()
        print(f"  ✗ ERROR pada {raw.get('no_kontrak')}: {e}")

db.close()
print(f"\n✅ Selesai! {inserted}/{len(kontraks_raw)} kontrak berhasil dimasukkan.")
