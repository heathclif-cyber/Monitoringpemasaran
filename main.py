from fastapi import FastAPI, Request
from fastapi import HTTPException, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)



# --- Router imports ---
from endpoints.kontrak import router as kontrak_router
from api.r_invoice import router as invoice_router
from api.r_pembayaran import router as pembayaran_router
from api.r_do import router as do_router
from api.r_dashboard import router as dashboard_router
from api.r_laporan import router as laporan_router
from api.r_documents import router as documents_router
from api.r_ba import router as ba_router
from api.r_stok import router as stok_router
from api.r_superman import router as superman_router
from api.r_piutang import router as piutang_router
from api.r_auth import router as auth_router
from api.r_users import router as users_router
from api.r_integrasi import router as integrasi_router
from api.r_kontak_pajak import router as kontak_pajak_router
from database import SessionLocal
from services.auth import get_active_user_from_token

# --- App Initialization ---
app = FastAPI(title="PTPN I - Sales Document Automation")

_PUBLIC_API_PATHS = {"/api/auth/login"}
_INTEGRATION_PREFIX = "/api/integrasi/"

@app.middleware("http")
async def api_access_control(request: Request, call_next):
    """Require an active account for every API route except login and health.

    This closes accidental public read endpoints. Integration accounts are
    intentionally confined to the explicit, versioned integration contract so
    a machine credential cannot browse the operational application API.
    """
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/") or path in _PUBLIC_API_PATHS:
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    db = SessionLocal()
    try:
        try:
            user = get_active_user_from_token(auth_header[7:], db)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers={"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None,
            )

        if user.role == "integrasi" and not path.startswith(_INTEGRATION_PREFIX):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Akun integrasi hanya dapat mengakses API integrasi"},
            )

        request.state.authenticated_user = user.username
        request.state.authenticated_role = user.role
        response = await call_next(request)
        logger.info(
            "api_access user=%s role=%s method=%s path=%s status=%s",
            user.username,
            user.role,
            request.method,
            path,
            response.status_code,
        )
        return response
    finally:
        db.close()

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
app.include_router(integrasi_router)
app.include_router(kontrak_router)
app.include_router(invoice_router)
app.include_router(pembayaran_router)
app.include_router(do_router)
app.include_router(dashboard_router)
app.include_router(laporan_router)
app.include_router(documents_router)
app.include_router(ba_router)
app.include_router(stok_router)
app.include_router(superman_router)
app.include_router(piutang_router)
app.include_router(kontak_pajak_router)


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
