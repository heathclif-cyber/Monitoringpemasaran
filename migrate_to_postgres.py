"""
Script Migrasi Data: SQLite (Lokal) -> PostgreSQL (Railway)
===========================================================
Jalankan sekali untuk memindahkan semua data dari blueprint.db ke Railway PostgreSQL.

Usage:
    python migrate_to_postgres.py

Pastikan DATABASE_URL sudah diset di .env sebelum menjalankan script ini.
"""

import os
import sys
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ---- Konfigurasi ----
SQLITE_URL = "sqlite:///./blueprint.db"
PG_URL = os.getenv("DATABASE_URL", "")

if not PG_URL or "sqlite" in PG_URL:
    print("ERROR: DATABASE_URL tidak diset atau masih SQLite.")
    print("Tolong set DATABASE_URL di file .env dengan URL PostgreSQL Anda.")
    sys.exit(1)

# Fix postgres:// -> postgresql://
if PG_URL.startswith("postgres://"):
    PG_URL = PG_URL.replace("postgres://", "postgresql://", 1)

# Strip pgbouncer param
def _clean_url(url):
    parsed = urlparse(url)
    if not parsed.query:
        return url
    UNSUPPORTED = {"pgbouncer", "application_name"}
    kept = {k: v for k, v in parse_qs(parsed.query).items() if k not in UNSUPPORTED}
    return urlunparse(parsed._replace(query=urlencode(kept, doseq=True)))

PG_URL_CLEAN = _clean_url(PG_URL)

# ---- Setup Engines ----
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

print("Menghubungkan ke SQLite (sumber)...")
sqlite_engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
SqliteSession = sessionmaker(bind=sqlite_engine)

print("Menghubungkan ke PostgreSQL (tujuan)...")
pg_engine = create_engine(
    PG_URL_CLEAN,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 10}
)
PgSession = sessionmaker(bind=pg_engine)

# ---- Import Models ----
# Tambahkan path proyek agar import model bisa jalan
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import models

# Buat tabel di PostgreSQL jika belum ada
print("Membuat tabel di PostgreSQL jika belum ada...")
models.Base.metadata.create_all(bind=pg_engine)

from sqlalchemy import inspect, text

# ---- Fungsi Migrasi ----
def migrate_table(model_class, label):
    src = SqliteSession()
    dst = PgSession()
    inspector = inspect(sqlite_engine)
    try:
        table_name = model_class.__tablename__
        if not inspector.has_table(table_name):
            print(f"  [{label}] Tabel {table_name} tidak ada di SQLite. Dilewati.")
            return

        columns = [c["name"] for c in inspector.get_columns(table_name)]
        query = text(f"SELECT * FROM {table_name}")
        result = src.execute(query).fetchall()
        count = len(result)
        
        if count == 0:
            print(f"  [{label}] Tidak ada data. Dilewati.")
            return

        print(f"  [{label}] Memigrasikan {count} record...")
        for row in result:
            # Cek apakah sudah ada di tujuan (berdasarkan PK)
            pk_col = model_class.__mapper__.primary_key[0].name
            pk_val = getattr(row, pk_col, None)
            
            # Use Session.get() instead of Query.get() for SQLAlchemy 2.0 compatibility
            existing = dst.get(model_class, pk_val)
            if existing:
                print(f"    - {pk_val} sudah ada, dilewati.")
                continue

            # Buat objek baru dari data SQLite (HANYA MENGAMBIL KOLOM YG ADA DI SQLITE)
            data = {}
            for col_name in columns:
                if hasattr(model_class, col_name):
                    data[col_name] = getattr(row, col_name)
                    
            new_rec = model_class(**data)
            dst.add(new_rec)

        dst.commit()
        print(f"  [{label}] Selesai! {count} record berhasil dimigrasikan.")
    except Exception as e:
        dst.rollback()
        print(f"  [{label}] ERROR: {e}")
    finally:
        src.close()
        dst.close()

# ---- Jalankan Migrasi ----
print("\n=== MULAI MIGRASI ===")
# Urutan penting! Karena ada foreign key: Kontrak -> Invoice -> DO
migrate_table(models.Kontrak,       "Kontrak")
migrate_table(models.Invoice,       "Invoice")
migrate_table(models.DeliveryOrder, "Delivery Order")
migrate_table(models.LaporanBypass, "Laporan Bypass")

print("\n=== MIGRASI SELESAI ===")
print("Semua data dari SQLite sudah dipindahkan ke PostgreSQL.")
print("Silakan cek aplikasi di Hugging Face Spaces.")
