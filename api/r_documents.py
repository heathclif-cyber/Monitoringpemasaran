from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
from database import get_db
from services.onedrive import (
    MS_REDIRECT_URI,
    OneDriveConfigError,
    OneDriveUploadError,
    build_authorize_url,
    exchange_code_for_tokens,
    get_onedrive_mode,
    is_onedrive_configured,
    upload_bytes,
)

router = APIRouter(prefix="/api/documents", tags=["Documents"])

VALID_ENTITY_TYPES = {"kontrak", "invoice", "do", "bypass"}
VALID_DOC_TYPES = {"kontrak", "invoice", "kuitansi", "do", "deklarasi", "berita_acara"}


def _validate_entity(db: Session, entity_type: str, entity_id: str) -> None:
    if entity_type == "kontrak":
        if not db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == entity_id).first():
            raise HTTPException(status_code=404, detail="Kontrak tidak ditemukan")
    elif entity_type == "invoice":
        if not db.query(models.Invoice).filter(models.Invoice.no_invoice == entity_id).first():
            raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
    elif entity_type == "do":
        if not db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == entity_id).first():
            raise HTTPException(status_code=404, detail="Delivery Order tidak ditemukan")
    elif entity_type == "bypass":
        try:
            bypass_id = int(entity_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="ID bypass tidak valid") from exc
        if not db.query(models.LaporanBypass).filter(models.LaporanBypass.id == bypass_id).first():
            raise HTTPException(status_code=404, detail="Data bypass tidak ditemukan")


def _sync_entity_link(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
    web_url: str,
) -> None:
    if entity_type == "do":
        do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == entity_id).first()
        if not do:
            return
        if doc_type == "deklarasi":
            do.link_deklarasi_penerimaan = web_url
        elif doc_type == "berita_acara":
            do.link_berita_acara_serah_terima = web_url
    elif entity_type == "bypass" and doc_type == "deklarasi":
        try:
            bypass_id = int(entity_id)
        except ValueError:
            return
        rec = db.query(models.LaporanBypass).filter(models.LaporanBypass.id == bypass_id).first()
        if rec:
            rec.link_deklarasi_penerimaan = web_url


@router.get("/status")
def documents_status():
    mode = get_onedrive_mode()
    return {
        "configured": is_onedrive_configured(),
        "mode": mode,
        "auth_url": "/api/documents/oauth/authorize" if mode == "pending_auth" else None,
        "redirect_uri": MS_REDIRECT_URI if mode == "pending_auth" else None,
        "doc_types": sorted(VALID_DOC_TYPES),
        "entity_types": sorted(VALID_ENTITY_TYPES),
    }


@router.get("/oauth/authorize")
def oauth_authorize():
    try:
        return RedirectResponse(build_authorize_url())
    except OneDriveConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/oauth/callback", response_class=HTMLResponse)
def oauth_callback(code: Optional[str] = None, error: Optional[str] = None, error_description: Optional[str] = None):
    if error:
        msg = error_description or error
        return HTMLResponse(f"<h2>Login gagal</h2><p>{msg}</p>", status_code=400)
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code tidak ditemukan")

    try:
        tokens = exchange_code_for_tokens(code)
    except OneDriveUploadError as exc:
        return HTMLResponse(f"<h2>OAuth gagal</h2><p>{exc}</p>", status_code=502)

    refresh_token = tokens.get("refresh_token", "")
    if not refresh_token:
        return HTMLResponse(
            "<h2>Refresh token tidak diterima</h2>"
            "<p>Coba login ulang. Pastikan scope <code>offline_access</code> aktif di App Registration.</p>",
            status_code=502,
        )

    safe_token = refresh_token.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return HTMLResponse(
        f"""<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>OneDrive Terhubung</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }}
    code, pre {{ background: #f4f4f5; padding: 0.75rem; border-radius: 6px; word-break: break-all; display: block; }}
    h2 {{ color: #166534; }}
    ol {{ line-height: 1.7; }}
  </style>
</head>
<body>
  <h2>OneDrive akun personal berhasil terhubung</h2>
  <p>Salin nilai berikut ke file <code>.env</code> (lokal) atau Railway Variables (production):</p>
  <pre>MS_REFRESH_TOKEN={safe_token}</pre>
  <ol>
    <li>Tambahkan baris di atas ke environment variable.</li>
    <li>Restart backend / redeploy Railway.</li>
    <li>Buka halaman Upload — status harus <strong>configured: true</strong>.</li>
  </ol>
  <p>Redirect URI yang dipakai: <code>{MS_REDIRECT_URI}</code></p>
</body>
</html>"""
    )


@router.get("", response_model=List[schemas.DocumentUploadOut])
def list_documents(
    entity_type: str,
    entity_id: str,
    doc_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type tidak valid")

    q = db.query(models.DocumentUpload).filter(
        models.DocumentUpload.entity_type == entity_type,
        models.DocumentUpload.entity_id == entity_id,
    )
    if doc_type:
        if doc_type not in VALID_DOC_TYPES:
            raise HTTPException(status_code=400, detail="doc_type tidak valid")
        q = q.filter(models.DocumentUpload.doc_type == doc_type)

    return q.order_by(models.DocumentUpload.uploaded_at.desc()).all()


@router.post("/upload", response_model=schemas.DocumentUploadOut)
async def upload_document(
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    entity_type = entity_type.strip().lower()
    entity_id = entity_id.strip()
    doc_type = doc_type.strip().lower()

    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type tidak valid")
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(status_code=400, detail="doc_type tidak valid")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nama file wajib ada")

    _validate_entity(db, entity_type, entity_id)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")

    try:
        result = upload_bytes(
            entity_type=entity_type,
            entity_id=entity_id,
            doc_type=doc_type,
            file_name=file.filename,
            content=content,
        )
    except OneDriveConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OneDriveUploadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    existing = (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type == entity_type,
            models.DocumentUpload.entity_id == entity_id,
            models.DocumentUpload.doc_type == doc_type,
        )
        .first()
    )

    if existing:
        existing.file_name = result["file_name"]
        existing.onedrive_item_id = result.get("item_id")
        existing.web_url = result["web_url"]
        record = existing
    else:
        record = models.DocumentUpload(
            entity_type=entity_type,
            entity_id=entity_id,
            doc_type=doc_type,
            file_name=result["file_name"],
            onedrive_item_id=result.get("item_id"),
            web_url=result["web_url"],
        )
        db.add(record)

    _sync_entity_link(db, entity_type=entity_type, entity_id=entity_id, doc_type=doc_type, web_url=result["web_url"])
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db)):
    record = db.query(models.DocumentUpload).filter(models.DocumentUpload.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")

    db.delete(record)
    db.commit()
    return {"success": True}