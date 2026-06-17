from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
import logging

import jwt as pyjwt

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)



# --- Router imports ---
from endpoints.kontrak import router as kontrak_router
from api.r_invoice import router as invoice_router
from api.r_do import router as do_router
from api.r_dashboard import router as dashboard_router
from api.r_laporan import router as laporan_router
from api.r_documents import router as documents_router
from api.r_ba import router as ba_router
from api.r_auth import router as auth_router
from api.r_users import router as users_router

# --- App Initialization ---
app = FastAPI(title="PTPN I - Sales Document Automation")

_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_PUBLIC_PATHS = {"/api/auth/login", "/api/auth/me", "/health"}

@app.middleware("http")
async def readonly_tamu_middleware(request: Request, call_next):
    """Tamu hanya boleh GET. POST/PUT/DELETE di-block kecuali path publik."""
    if request.method in _WRITE_METHODS and request.url.path not in _PUBLIC_PATHS:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                secret = os.getenv("SECRET_KEY", "change-me-in-production")
                payload = pyjwt.decode(token, secret, algorithms=["HS256"])
                if payload.get("role") == "tamu":
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "Akun tamu hanya bisa melihat data"},
                    )
            except Exception:
                pass
    return await call_next(request)

@app.on_event("startup")
def startup_event():
    logger.info("Application starting up...")
    if os.getenv("RUN_DB_MIGRATE", "").lower() in ("1", "true", "yes"):
        try:
            from services.db_migrate import run_migrations
            run_migrations()
        except Exception as e:
            logger.error("Database migration failed: %s", e)
    else:
        logger.info("Skipping DB migration (set RUN_DB_MIGRATE=true to run on startup)")

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
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(kontrak_router)
app.include_router(invoice_router)
app.include_router(do_router)
app.include_router(dashboard_router)
app.include_router(laporan_router)
app.include_router(documents_router)
app.include_router(ba_router)


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
