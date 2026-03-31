from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import models
from api.r_laporan import router as laporan_router, seed_beteleme
from database import engine, SessionLocal

# --- Router imports ---
from endpoints.kontrak import router as kontrak_router
from api.r_invoice import router as invoice_router
from api.r_do import router as do_router
from api.r_dashboard import router as dashboard_router
from api.r_laporan import router as laporan_router

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
        db = SessionLocal()
        try:
            logger.info("Migrating missing columns (PPh, volume, etc)...")
            # postgres supports ADD COLUMN IF NOT EXISTS
            db.execute(text("ALTER TABLE laporan_bypass ADD COLUMN IF NOT EXISTS volume FLOAT DEFAULT 0.0"))
            db.execute(text("ALTER TABLE laporan_bypass ADD COLUMN IF NOT EXISTS satuan VARCHAR DEFAULT 'Kg'"))
            db.execute(text("ALTER TABLE delivery_order ADD COLUMN IF NOT EXISTS volume_do FLOAT DEFAULT 0.0"))
            db.execute(text("ALTER TABLE delivery_order ADD COLUMN IF NOT EXISTS is_pph_disetor VARCHAR DEFAULT 'false'"))
            db.execute(text("ALTER TABLE kontrak ADD COLUMN IF NOT EXISTS is_pph VARCHAR DEFAULT 'false'"))
            db.execute(text("ALTER TABLE kontrak ADD COLUMN IF NOT EXISTS pph_persen FLOAT DEFAULT 0.0"))
            db.commit()
            logger.info("Migration complete: columns verified/added.")
        except Exception as migrate_err:
            logger.error(f"Migration failed: {migrate_err}")
            db.rollback()
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
