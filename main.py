from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import models
from database import engine, SessionLocal

# --- Router imports ---
from endpoints.kontrak import router as kontrak_router
from api.r_invoice import router as invoice_router
from api.r_do import router as do_router
from api.r_dashboard import router as dashboard_router
from api.r_laporan import router as laporan_router
from api.r_documents import router as documents_router

# --- App Initialization ---
app = FastAPI(title="PTPN I - Sales Document Automation")

@app.on_event("startup")
def startup_event():
    logger.info("Application starting up...")
    try:
        # Create tables on startup to avoid blocking the main import thread
        logger.info("Initializing database tables...")
        models.Base.metadata.create_all(bind=engine)
        
        # --- MIGRATION: Ensure new columns exist ---
        from sqlalchemy import text
        try:
            db = SessionLocal()
            logger.info("Migrating missing columns (PPh, volume, etc)...")
            
            # Helper to add column safely
            def add_column_safely(table, col, type_def):
                try:
                    # Try Postgres style first (IF NOT EXISTS)
                    db.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {type_def}"))
                    db.commit()
                except Exception:
                    db.rollback()
                    try:
                        # Try SQLite/Standard style (will fail if exists)
                        db.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {type_def}"))
                        db.commit()
                    except Exception:
                        db.rollback() # Likely already exists
            
            add_column_safely("laporan_bypass", "volume", "FLOAT DEFAULT 0.0")
            add_column_safely("laporan_bypass", "satuan", "VARCHAR DEFAULT 'Kg'")
            add_column_safely("delivery_order", "volume_do", "FLOAT DEFAULT 0.0")
            add_column_safely("delivery_order", "is_pph_disetor", "VARCHAR DEFAULT 'false'")
            add_column_safely("kontrak", "is_ppn", "VARCHAR DEFAULT 'true'")
            add_column_safely("kontrak", "ppn_persen", "FLOAT DEFAULT 11.0")
            add_column_safely("kontrak", "is_pph", "VARCHAR DEFAULT 'false'")
            add_column_safely("kontrak", "pph_persen", "FLOAT DEFAULT 0.0")
            add_column_safely("delivery_order", "rencana_pengambilan", "DATE DEFAULT NULL")
            add_column_safely("delivery_order", "link_deklarasi_penerimaan", "VARCHAR DEFAULT NULL")
            add_column_safely("laporan_bypass", "link_deklarasi_penerimaan", "VARCHAR DEFAULT NULL")
            add_column_safely("kontrak_unit", "volume", "FLOAT DEFAULT 0.0")
            add_column_safely("invoice", "nama_unit", "VARCHAR DEFAULT NULL")
            add_column_safely("delivery_order", "link_berita_acara_serah_terima", "VARCHAR DEFAULT NULL")

            # Normalize unit names (fix inconsistent spacing vs hyphens)
            try:
                from sqlalchemy import update as sql_update
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
                        logger.info(f"Normalized {result.rowcount} rows: {tbl}.{col} '{old}' -> '{new}'")
                db.commit()
            except Exception as norm_err:
                db.rollback()
                logger.warning(f"Unit normalization skipped: {norm_err}")

            logger.info("Migration routine finished.")
        except Exception as migrate_err:
            logger.error(f"Migration routine failed: {migrate_err}")
        finally:
            db.close()

        logger.info("Database initialization complete.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        # We don't raise here so the app can still start and show health check status

os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Serve React SPA from frontend/dist
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")
else:
    app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# --- Include Routers ---
app.include_router(kontrak_router)
app.include_router(invoice_router)
app.include_router(do_router)
app.include_router(dashboard_router)
app.include_router(laporan_router)
app.include_router(documents_router)


# --- Root Page: serve React SPA or fallback to Jinja2 ---
@app.get("/")
def read_root(request: Request):
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/health")
def health_check():
    return {"status": "ok"}

# --- SPA Fallback: serve React index.html for all non-API routes (must be LAST) ---
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return JSONResponse(status_code=404, content={"detail": "Not found"})
