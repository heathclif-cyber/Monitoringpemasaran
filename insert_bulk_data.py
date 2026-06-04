import os
import sys
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add project context
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from models import Kontrak
from database import _clean_db_url

# 1. Tentukan URL Database Tujuan (Railway PostgreSQL)
DB_URL = os.getenv("DATABASE_URL", "sqlite:///./blueprint.db")

# 2. Persiapan Koneksi ke Database
engine = create_engine(
    _clean_db_url(DB_URL),
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args={"connect_timeout": 10}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 3. Data Mentah (Tab-separated)
RAW_DATA = """R08D-RO/SPJ/2026.01.26-1	26 Januari 2026	Gapoktan Nyiur Melambai	Frans D. Tilaar	Lingkungan Jaga IV,Desa Elusan, Kecamatan Amurang Barat, Kabupaten Minahasa Selatan, Sulawesi Utara, 95955	Perorangan	Kelapa	Butir	Genjah Kuning Nias	2025	Minahasa-Halmahera	-	-	Butir	-	-	35000	7000	0	11	26950000	Netto tanpa Pembungkus	Januari - Februari 2026	245000000	dua ratus empat puluh lima juta Rupiah	-	-	0	0	-	-	-	Afdeling Tiniawangko, Kec. Tenga, Kab. Minahasa Selatan	2026-02-09	14	0
0159/HO-SUPCO/WASTE-L/N-I/I/2026	28 Januari 2026	PT Nasional Bhirawa Tama	Welly Budi Sanjaya	Jl Peltu Sujono No.21 Malang 65148	Badan Usaha	Karet	Kg	Brown Crepe 3X Hitam	2025	Beteleme	-	300 unit @ 80 kg Bale	Brown Crepe 3X Hitam	-	Loco Gudang Transito Jember	24000	23400	0	11	61776000	Loco Gudang Transito Jember	Januari - Februari 2026	561600000	lima ratus enam puluh satu juta enam ratus ribu Rupiah	-	-	0	0	-	-	-	PTPN I Regional 5 Kotta Blater	2026-03-27	0	0
0160/HO-SUPCO/WASTE-L/N-I/I/2026	28 Januari 2026	PT Nasional Bhirawa Tama	Welly Budi Sanjaya	Jl Peltu Sujono No.21 Malang 65148	Badan Usaha	Karet	Kg	Brown Crepe 3X Hitam	2025	Awaya-Telpaputih	-	73 Unit @ 80 Bale	Brown Crepe 3X Hitam	-	Loco Gudang Transito Jember	5840	23400	0	11	15032160	Loco Gudang Transito Jember	Januari - Februari 2026	136656000	seratus tiga puluh enam juta enam ratus lima puluh enam ribu Rupiah	-	-	0	0	-	-	-	PTPN I Regional 5 Kotta Blater	2026-03-27	0	0
0161/HO-SUPCO/WASTE-L/N-I/I/2026	28 Januari 2026	PT Nasional Bhirawa Tama	Welly Budi Sanjaya	Jl Peltu Sujono No.21 Malang 65148	Badan Usaha	Karet	Kg	Brown Crepe 3X	2025	Awaya-Telpaputih	-	278 unit @ 80 kg Bale	Brown Crepe 3X 	-	Loco Gudang Transito Jember	22240	27200	0	11	66542080	Loco Gudang Transito Jember	Februari - Maret 2026	604928000	enam ratus empat juta sembilan ratus dua puluh delapan ribu Rupiah	-	-	0	0	-	-	-	PTPN I Regional 5 Kotta Blater	2026-03-27	0	0
2105/HO-SUPCO/WASTE-L/N-I/XII/2025	03 Desember 2025	PT Nasional Bhirawa Tama	Welly Budi Sanjaya	Jl Peltu Sujono No.21 Malang 65149	Badan Usaha	Karet	Kg	Brown Crepe 3X	2025	Beteleme	-	502 unit @ 80 kg Bale	Brown Crepe 3X 	-	Loco Gudang Transito Jember	40160	25000	0	11	110440000	Loco Gudang Transito Jember	Desember 2025 - Januari 2026	1004000000	satu miliar empat juta Rupiah	-	-	0	0	-	-	-	PTPN I Regional 5 Kotta Blater	2025-01-26	0	0
R08D-RO/SPJ/2026.02.18-2	18 Februari 2026	CV Angin Utara	Yolanda Nova Bukara	Kelurahan Bengkol, Kecamatan Mapanget, Kota Manado	Badan Usaha	Kelapa	Butir	Genjah Kuning Nias	2025-2026	Minahasa-Halmahera	-	-	Butir	-	-	50000	7500	0	11	41250000	Netto tanpa Pembungkus	Februari - April 2026	375000000	tiga ratus tujuh puluh lima juta Rupiah	-	-	0	0	-	-	Diberikan refraksi sebagiamana diatur di peraturan terkait yang berlaku	Afdeling Tiniawangko, Kec. Tenga, Kab. Minahasa Selatan	2026-03-04	14	30
0182/HO-SUPCO/WASTE-L/N-I/II/2026	06 Februari 2026	PT Nasional Bhirawa Tama	Welly Budi Sanjaya	Jl Peltu Sujono No.21 Malang 65149	Badan Usaha	Karet	Kg	Brown Crepe 3X	2025	Awaya-Telpaputih	-	438 Unit @ 80 kg Bale	Brown Crepe 3X 	-	Loco Gudang Transito Jember	35040	27200	0	11	104839680	Loco Gudang Transito Jember	Februari - Maret 2026	953088000	Sembilan ratus lima puluh tiga juta delapan puluh delapan ribu rupiah	-	-	0	0	-	-	-	PTPN I Regional 5 Kotta Blater	2026-02-03	0	0
0183/HO-SUPCO/WASTE-L/N-I/II/2026	06 Februari 2026	PT Nasional Bhirawa Tama	Welly Budi Sanjaya	Jl Peltu Sujono No.21 Malang 65149	Badan Usaha	Karet	Kg	Brown Crepe 3X Hitam	2025	Beteleme	-	375 Unit @ 80 kg Bale	Brown Crepe 3X Hitam	-	Loco Gudang Transito Jember	30000	23700	0	11	78210000	Loco Gudang Transito Jember	Februari - Maret 2026	711000000	Tujuh ratus sebelas juta Rupiah	-	-	0	0	-	-	-	PTPN I Regional 5 Kotta Blater	2026-02-03	0	0
0184/HO-SUPCO/WASTE-L/N-I/II/2026	06 Februari 2026	PT Nasional Bhirawa Tama	Welly Budi Sanjaya	Jl Peltu Sujono No.21 Malang 65149	Badan Usaha	Karet	Kg	Brown Crepe 3X Hitam	2025	Awaya-Telpaputih	-	250 Unit @ 80 kg Bale	Brown Crepe 3X Hitam	-	Loco Gudang Transito Jember	20000	23700	0	11	52140000	Loco Gudang Transito Jember	Februari - Maret 2026	474000000	Empat ratus tujuh puluh empat juta Rupiah	-	-	0	0	-	-	-	PTPN I Regional 5 Kotta Blater	2026-02-03	0	0
011/SGN/SPJB/BO/GKP-N1/II/2026	25 Februari 2026	PT Kaya Makmur Damai Sentosa	Michael Jonathan	Jl Maccini Baru No.142 RT 016 RW 003, Maccini Gusung  Makassar	Badan Usaha	Tebu	Kg	-	2025	Takalar	-	-	-	-	Loco Gudang PG Takalar	20900	14800	0	0	0	-	-	309320000	Tiga ratus sembilan juta tiga ratus dua puluh ribu rupiah	-	-	0	0	-	-	-	PG Takalar	2026-03-06	0	0
0353/HO-SUPCO/WASTE-L/N-I/II/2026	27 Februari 2026	PT Wipolimex Raya	Wijaya Sumono	Jl Prof. HM.Yamin SH LK II No.62 Kisaran Timur, Asahan	Badan Usaha	Karet	Kg	Lump	2025-2026	Beteleme	-	-	-	-	Loco Kebun Unit Beteleme	60000	28500	0	11	188100000	Loco Kebun Unit Beteleme	Maret - April 2026	1710000000	satu milyar tujuh ratus sepuluh juta rupiah	-	-	0	0	-	-	-	Kebun Unit Beteleme	2026-03-27	0	0
0354/HO-SUPCO/WASTE-L/N-I/II/2026	27 Februari 2026	PT Wipolimex Raya	Wijaya Sumono	Jl Prof. HM.Yamin SH LK II No.62 Kisaran Timur, Asahan	Badan Usaha	Karet	Kg	Lump	2025-2026	Awaya-Telpaputih	-	-	-	-	Loco Kebun Unit Awaya-Telpaputih	60000	28500	0	11	188100000	Loco Kebun Unit Awaya-Telpaputih	Maret - April 2026	1710000000	satu milyar tujuh ratus sepuluh juta rupiah	-	-	0	0	-	-	-	Kebun Unit Awaya-Telpaputih	2026-03-27	0	0
R08D-RO/SPJ.2026.03.13-2	13 Maret 2026	Toko Aron Masohi	Suriani Salim	Jl Abdullah Soslissa, Masohi, Maluku Tengah	Perorangan	Kelapa	Kg	Kopra	2026	Awaya-Telpaputih	-	-	Kupas	-	-	3500	12613	0	11	4855854	Netto tanpa Pembungkus	Maret - April 2026	49000000	Empat puluh sembilan juta rupiah	-	-	0	0	-	-	-	Kebun Unit Awaya-Telpaputih	2026-03-27	0	0"""

bulan_map = {
    "Januari": "01", "Februari": "02", "Maret": "03", "April": "04",
    "Mei": "05", "Juni": "06", "Juli": "07", "Agustus": "08",
    "September": "09", "Oktober": "10", "November": "11", "Desember": "12"
}

def parse_date(date_str):
    if not date_str or date_str.strip() == "-" or date_str.strip() == "":
        return None
    date_str = date_str.strip()
    
    # 2026-03-04
    if "-" in date_str and len(date_str.split("-")[0]) == 4:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    
    # Bulan format (26 Januari 2026)
    for b_indo, b_num in bulan_map.items():
        if b_indo in date_str:
            date_str = date_str.replace(b_indo, b_num)
            break
            
    # Remove extra spaces
    parts = str(date_str).split()
    if len(parts) == 3: # dd mm yyyy
        try:
            return datetime.strptime(f"{parts[0]}-{parts[1]}-{parts[2]}", "%d-%m-%Y").date()
        except:
            pass
            
    try:
        return datetime.strptime(date_str, "%d/%m/%Y").date()
    except:
        return datetime.today().date()

def parse_float(val):
    if not val or val.strip() == "-" or str(val).strip() == "":
        return 0.0
    val = str(val).replace("Rp", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(val)
    except:
        return 0.0

db = SessionLocal()
try:
    print("Mulai insert bulk data ke PostgreSQL...")
    lines = RAW_DATA.strip().split("\n")
    inserted = 0
    skipped = 0
    
    for line in lines:
        if not line.strip(): continue
        
        cols = line.split("\t")
        if len(cols) < 35: continue
        
        no_kontrak = cols[0].strip()
        existing = db.query(Kontrak).filter(Kontrak.no_kontrak == no_kontrak).first()
        if existing:
            print(f"Kontrak {no_kontrak} sudah ada, dilewati.")
            skipped += 1
            continue
            
        k = Kontrak(
            no_kontrak=no_kontrak,
            tanggal_kontrak=parse_date(cols[1]),
            pembeli=cols[2].strip(),
            nama_direktur=cols[3].strip(),
            alamat_pembeli=cols[4].strip(),
            status=cols[5].strip() if cols[5].strip() else "Draft",
            komoditi=cols[6].strip(),
            satuan=cols[7].strip(),
            jenis_komoditi=cols[8].strip(),
            tahun_panen=cols[9].strip(),
            kebun_produsen=cols[10].strip(),
            simbol=cols[11].strip(),
            packaging=cols[12].strip(),
            deskripsi_produk=cols[13].strip(),
            mutu=cols[14].strip(),
            pelabuhan_muat=cols[15].strip(),
            volume=parse_float(cols[16]),
            harga_satuan=parse_float(cols[17]),
            premi=parse_float(cols[18]),
            ppn_persen=parse_float(cols[19]),
            nominal_ppn=parse_float(cols[20]),
            kondisi_penyerahan=cols[21].strip(),
            waktu_penyerahan=cols[22].strip(),
            nilai_transaksi=parse_float(cols[23]),
            terbilang=cols[24].strip(),
            no_reff=cols[25].strip(),
            chop=cols[26].strip(),
            pack_qty=parse_float(cols[27]),
            banyaknya_bale_karung=parse_float(cols[28]),
            no_kav_chop=cols[29].strip(),
            levering=cols[30].strip(),
            catatan=cols[31].strip(),
            alamat_produksi=cols[32].strip(),
            jatuh_tempo_pembayaran=parse_date(cols[33]),
            lama_pembayaran_hari=int(parse_float(cols[34])),
            penyerahan_hari=int(parse_float(cols[35]))
        )
        db.add(k)
        inserted += 1

    db.commit()
    print(f"Selesai! {inserted} kontrak berhasil ditambahkan, {skipped} dilewati.")
except Exception as e:
    db.rollback()
    print(f"Error: {e}")
finally:
    db.close()
