from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import models
from database import engine

# --- Router imports ---
from api.r_kontrak import router as kontrak_router
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
