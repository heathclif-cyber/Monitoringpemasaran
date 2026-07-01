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


def _seed_default_users(db) -> None:
    from services.auth import hash_password
    import os

    existing_count = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
    if existing_count and existing_count > 0:
        return

    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    tamu_password = os.getenv("TAMU_PASSWORD", "tamu123")

    import models as m
    db.add(m.User(
        username="admin",
        hashed_password=hash_password(admin_password),
        nama_lengkap="Administrator",
        role="admin",
        is_active=True,
    ))
    db.add(m.User(
        username="tamu",
        hashed_password=hash_password(tamu_password),
        nama_lengkap="Tamu",
        role="tamu",
        is_active=True,
    ))
    db.commit()
    logger.info("Seed default users: admin + tamu")


def run_migrations() -> None:
    logger.info("Menghubungkan ke Railway PostgreSQL...")
    logger.info("(Dari PC lokal bisa 30-60 detik — jangan Ctrl+C, tunggu sampai selesai)")
    t0 = time.perf_counter()

    logger.info("Membuat tabel jika belum ada...")
    models.Base.metadata.create_all(bind=engine)
    logger.info("Koneksi OK (%.1f detik)", time.perf_counter() - t0)

    db = SessionLocal()
    try:
        _seed_default_users(db)
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
        db.execute(text("UPDATE kontrak SET status = 'Active' WHERE status IS NULL OR status = 'Draft'"))
        db.commit()
        add_column_safely(db, "invoice", "no_ba", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "delivery_order", "no_ba", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "berita_acara", "bulan_buku", "DATE DEFAULT NULL")
        add_column_safely(db, "berita_acara", "harga_satuan", "FLOAT DEFAULT 0.0")
        db.execute(text(
            "UPDATE berita_acara ba SET harga_satuan = k.harga_satuan "
            "FROM kontrak k WHERE ba.no_kontrak = k.no_kontrak "
            "AND COALESCE(ba.harga_satuan, 0) = 0 AND COALESCE(k.harga_satuan, 0) > 0"
        ))
        db.commit()
        db.execute(text(
            "UPDATE berita_acara SET bulan_buku = DATE_TRUNC('month', tanggal_ba)::date "
            "WHERE bulan_buku IS NULL AND tanggal_ba IS NOT NULL"
        ))
        db.commit()
        add_column_safely(db, "document_upload", "storage_path", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "users", "jabatan", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "delivery_order", "no_pembayaran", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "pembayaran", "superman", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "invoice", "superman", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "invoice", "kontrak_sap", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "invoice", "so_sap", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "invoice", "do_sap", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "invoice", "billing_sap", "VARCHAR DEFAULT NULL")
        add_column_safely(db, "invoice", "link_deklarasi_penerimaan", "VARCHAR DEFAULT NULL")

        db.execute(text(
            "UPDATE invoice i SET superman = sub.superman "
            "FROM ("
            "  SELECT DISTINCT ON (no_invoice) no_invoice, superman "
            "  FROM pembayaran "
            "  WHERE superman IS NOT NULL AND TRIM(superman) <> '' "
            "  ORDER BY no_invoice, tanggal_pembayaran"
            ") sub "
            "WHERE i.no_invoice = sub.no_invoice "
            "AND (i.superman IS NULL OR TRIM(i.superman) = '')"
        ))
        db.commit()

        # Backfill pembayaran dari DO existing
        dos_without_pay = db.execute(text(
            "SELECT no_do, no_invoice, COALESCE(tanggal_pembayaran, tanggal_do), "
            "nominal_transfer, is_pph_disetor, selisih "
            "FROM delivery_order WHERE no_pembayaran IS NULL"
        )).fetchall()
        for row in dos_without_pay:
            no_do, no_invoice, tgl, nominal, pph, selisih = row
            if not tgl:
                continue
            no_pay = f"PAY-{no_do}"
            existing_pay = db.execute(
                text("SELECT 1 FROM pembayaran WHERE no_pembayaran = :no"),
                {"no": no_pay},
            ).fetchone()
            if not existing_pay:
                db.execute(text(
                    "INSERT INTO pembayaran (no_pembayaran, no_invoice, tanggal_pembayaran, "
                    "nominal_transfer, is_pph_disetor, selisih) "
                    "VALUES (:no_pay, :no_inv, :tgl, :nominal, :pph, :selisih)"
                ), {
                    "no_pay": no_pay,
                    "no_inv": no_invoice,
                    "tgl": tgl,
                    "nominal": float(nominal or 0),
                    "pph": pph or "false",
                    "selisih": float(selisih or 0),
                })
            db.execute(text(
                "UPDATE delivery_order SET no_pembayaran = :no_pay WHERE no_do = :no_do"
            ), {"no_pay": no_pay, "no_do": no_do})
        db.commit()

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

        from services.stok_utils import backfill_stok_from_dos
        bf = backfill_stok_from_dos(db)
        if bf["created"]:
            logger.info(
                "Backfill stok dari DO: %d entri keluar dibuat (%d dilewati)",
                bf["created"],
                bf["skipped"],
            )

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