from fastapi import FastAPI, Request
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
from api.r_laporan import router as laporan_router, seed_beteleme

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
            from sqlalchemy import text
            
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
            
            logger.info("Migration routine finished.")
        except Exception as migrate_err:
            logger.error(f"Migration routine failed: {migrate_err}")
        finally:
            db.close()

        # Seed Beteleme Sawit data if not present
        db = SessionLocal()
        try:
            seed_beteleme(db)
            logger.info("Beteleme Sawit data seeded successfully.")
        except Exception as seed_err:
            logger.error(f"Seeding failed: {seed_err}")
        finally:
            db.close()
            
        logger.info("Database initialization complete.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        # We don't raise here so the app can still start and show health check status

os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# --- Include Routers ---
app.include_router(kontrak_router)
app.include_router(invoice_router)
app.include_router(do_router)
app.include_router(dashboard_router)
app.include_router(laporan_router)


# --- Root Page ---
@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/health")
def health_check():
    return {"status": "ok"}
