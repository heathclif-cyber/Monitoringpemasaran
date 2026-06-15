"""One-time / on-demand database migration. Run: python -m services.db_migrate"""
import logging
import time
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text, update as sql_update

# Pastikan .env terbaca walau dijalankan sebagai module
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import models
from database import SessionLocal, engine

logger = logging.getLogger(__name__)


def add_column_safely(db, table: str, col: str, type_def: str) -> None:
    try:
        db.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {type_def}"))
        db.commit()
    except Exception:
        db.rollback()
        try:
            db.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {type_def}"))
            db.commit()
        except Exception:
            db.rollback()


def run_migrations() -> None:
    logger.info("Menghubungkan ke Railway PostgreSQL...")
    logger.info("(Dari PC lokal bisa 30-60 detik — jangan Ctrl+C, tunggu sampai selesai)")
    t0 = time.perf_counter()

    logger.info("Membuat tabel jika belum ada...")
    models.Base.metadata.create_all(bind=engine)
    logger.info("Koneksi OK (%.1f detik)", time.perf_counter() - t0)

    db = SessionLocal()
    try:
        logger.info("Migrasi kolom yang belum ada...")
        add_column_safely(db, "laporan_bypass", "volume", "FLOAT DEFAULT 0.0")
        add_column_safely(db, "laporan_bypass", "satuan", "VARCHAR DEFAULT 'Kg'")
        add_column_safely(db, "delivery_order", "volume_do", "FLOAT DEFAULT 0.0")
        add_column_safely(db, "delivery_order", "is_pph_disetor", "VARCHAR DEFAULT 'false'")
        add_column_safely(db, "kontrak", "is_ppn", "VARCHAR DEFAULT 'true'")
        add_column_safely(db, "kontrak", "ppn_persen", "FLOAT DEFAULT 11.0")
        add_column_safely(db, "kontrak", "is_pph", "VARCHAR DEFAULT 'false'")
        add_column_safely(db, "kontrak", "pph_persen", "FLOAT DEFAULT 0.0")
        add_column_safely(db, "delivery_order", "rencana_pengambilan", "DATE DEFAULT NULL")
        add_column_safely(db, "delivery_order", "link_deklarasi_penerimaan", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "laporan_bypass", "link_deklarasi_penerimaan", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "kontrak_unit", "volume", "FLOAT DEFAULT 0.0")
        add_column_safely(db, "invoice", "nama_unit", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "delivery_order", "link_berita_acara_serah_terima", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "kontrak", "tipe_alur", "VARCHAR DEFAULT 'STANDAR'")
        add_column_safely(db, "invoice", "no_ba", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "delivery_order", "no_ba", "VARCHAR DEFAULT NULL")

        fixes = [
            ("laporan_bypass", "unit", "Awaya Telpaputih", "Awaya-Telpaputih"),
            ("laporan_bypass", "unit", "Minahasa Halmahera", "Minahasa-Halmahera"),
            ("delivery_order", "kepada_unit", "Awaya Telpaputih", "Awaya-Telpaputih"),
            ("delivery_order", "kepada_unit", "Minahasa Halmahera", "Minahasa-Halmahera"),
            ("invoice", "nama_unit", "Awaya Telpaputih", "Awaya-Telpaputih"),
            ("invoice", "nama_unit", "Minahasa Halmahera", "Minahasa-Halmahera"),
            ("kontrak", "kebun_produsen", "Awaya Telpaputih", "Awaya-Telpaputih"),
            ("kontrak", "kebun_produsen", "Minahasa Halmahera", "Minahasa-Halmahera"),
        ]
        for tbl, col, old, new in fixes:
            stmt = sql_update(models.Base.metadata.tables[tbl]).where(
                getattr(models.Base.metadata.tables[tbl].c, col) == old
            ).values({col: new})
            result = db.execute(stmt)
            if result.rowcount > 0:
                logger.info("Normalized %s rows: %s.%s '%s' -> '%s'", result.rowcount, tbl, col, old, new)
        db.commit()
        logger.info("Migrasi selesai (total %.1f detik).", time.perf_counter() - t0)
    except Exception as err:
        db.rollback()
        logger.error("Migration failed: %s", err)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migrations()