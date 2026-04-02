from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from contextlib import asynccontextmanager
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup Logic ---
    logger.info("Application starting up...")
    try:
        logger.info("Initializing database tables...")
        models.Base.metadata.create_all(bind=engine)
        
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
    
    yield
    # --- Shutdown Logic ---
    logger.info("Application shutting down...")

# --- App Initialization ---
app = FastAPI(title="PTPN I - Sales Document Automation", lifespan=lifespan)

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

