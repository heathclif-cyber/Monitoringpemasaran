from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
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

VALID_ENTITY_TYPES = {"kontrak", "invoice", "do", "bypass", "ba"}
VALID_DOC_TYPES = {"kontrak", "invoice", "kuitansi", "do", "deklarasi", "berita_acara"}

DOC_TYPE_LABELS = {
    "kontrak": "Dokumen Kontrak",
    "invoice": "Invoice",
    "kuitansi": "Kuitansi",
    "do": "Delivery Order",
    "deklarasi": "Deklarasi Penerimaan",
    "berita_acara": "Berita Acara Serah Terima",
}

ENTITY_DOC_REQUIREMENTS: dict[str, list[str]] = {
    "kontrak": ["kontrak"],
    "invoice": ["invoice", "kuitansi"],
    "do": ["do", "deklarasi", "berita_acara"],
    "bypass": ["deklarasi"],
    "ba": ["berita_acara"],
}


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
    elif entity_type == "ba":
        if not db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == entity_id).first():
            raise HTTPException(status_code=404, detail="Berita Acara tidak ditemukan")


def _build_slots(db: Session, entity_type: str, entity_id: str) -> list[schemas.DocumentSlotOut]:
    required = ENTITY_DOC_REQUIREMENTS.get(entity_type, [])
    uploads = (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type == entity_type,
            models.DocumentUpload.entity_id == entity_id,
        )
        .order_by(models.DocumentUpload.uploaded_at.desc())
        .all()
    )
    by_type = {u.doc_type: u for u in uploads}

    slots: list[schemas.DocumentSlotOut] = []
    for doc_type in required:
        upload = by_type.get(doc_type)
        slots.append(
            schemas.DocumentSlotOut(
                doc_type=doc_type,
                label=DOC_TYPE_LABELS.get(doc_type, doc_type),
                uploaded=upload is not None,
                file_name=upload.file_name if upload else None,
                web_url=upload.web_url if upload else None,
                uploaded_at=upload.uploaded_at if upload else None,
                document_id=upload.id if upload else None,
            )
        )
    return slots


def _summarize_slots(slots: list[schemas.DocumentSlotOut]) -> schemas.DocumentCompletenessSummary:
    uploaded = sum(1 for s in slots if s.uploaded)
    total = len(slots)
    return schemas.DocumentCompletenessSummary(total=total, uploaded=uploaded, missing=total - uploaded)


def _completeness_for_entity(
    db: Session,
    entity_type: str,
    entity_id: str,
    *,
    display_label: str,
    sublabel: Optional[str] = None,
    include_related: bool = False,
) -> schemas.DocumentCompletenessOut:
    slots = _build_slots(db, entity_type, entity_id)
    related: list[schemas.DocumentCompletenessOut] = []

    if include_related and entity_type == "kontrak":
        invoices = (
            db.query(models.Invoice)
            .filter(models.Invoice.no_kontrak == entity_id)
            .order_by(models.Invoice.tanggal_transaksi.desc())
            .all()
        )
        for inv in invoices:
            inv_item = _completeness_for_entity(
                db,
                "invoice",
                inv.no_invoice,
                display_label=inv.no_invoice,
                sublabel=f"Kontrak: {entity_id}",
            )
            dos = (
                db.query(models.DeliveryOrder)
                .filter(models.DeliveryOrder.no_invoice == inv.no_invoice)
                .order_by(models.DeliveryOrder.tanggal_do.desc())
                .all()
            )
            inv_item.related = [
                _completeness_for_entity(
                    db,
                    "do",
                    do.no_do,
                    display_label=do.no_do,
                    sublabel=f"Invoice: {inv.no_invoice}",
                )
                for do in dos
            ]
            related.append(inv_item)
    elif include_related and entity_type == "invoice":
        dos = (
            db.query(models.DeliveryOrder)
            .filter(models.DeliveryOrder.no_invoice == entity_id)
            .order_by(models.DeliveryOrder.tanggal_do.desc())
            .all()
        )
        related = [
            _completeness_for_entity(
                db,
                "do",
                do.no_do,
                display_label=do.no_do,
                sublabel=f"Invoice: {entity_id}",
            )
            for do in dos
        ]

    summary = _summarize_slots(slots)
    for child in related:
        summary.total += child.summary.total
        summary.uploaded += child.summary.uploaded
        summary.missing += child.summary.missing
        for grandchild in child.related:
            summary.total += grandchild.summary.total
            summary.uploaded += grandchild.summary.uploaded
            summary.missing += grandchild.summary.missing

    return schemas.DocumentCompletenessOut(
        entity_type=entity_type,
        entity_id=entity_id,
        display_label=display_label,
        sublabel=sublabel,
        slots=slots,
        summary=summary,
        related=related,
    )


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
    elif entity_type == "ba" and doc_type == "berita_acara":
        ba = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == entity_id).first()
        if ba:
            ba.link_berita_acara = web_url


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


@router.get("/references", response_model=List[schemas.DocumentReferenceOut])
def list_references(
    entity_type: str = Query(...),
    q: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    entity_type = entity_type.strip().lower()
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type tidak valid")

    term = f"%{q.strip()}%" if q.strip() else None
    results: list[schemas.DocumentReferenceOut] = []

    if entity_type == "kontrak":
        query = db.query(models.Kontrak).order_by(models.Kontrak.tanggal_kontrak.desc())
        if term:
            query = query.filter(
                (models.Kontrak.no_kontrak.ilike(term))
                | (models.Kontrak.pembeli.ilike(term))
            )
        for row in query.limit(limit).all():
            results.append(
                schemas.DocumentReferenceOut(
                    entity_type="kontrak",
                    entity_id=row.no_kontrak,
                    label=row.no_kontrak,
                    sublabel=row.pembeli,
                )
            )
    elif entity_type == "invoice":
        query = db.query(models.Invoice).order_by(models.Invoice.tanggal_transaksi.desc())
        if term:
            query = query.filter(
                (models.Invoice.no_invoice.ilike(term))
                | (models.Invoice.no_kontrak.ilike(term))
            )
        for row in query.limit(limit).all():
            results.append(
                schemas.DocumentReferenceOut(
                    entity_type="invoice",
                    entity_id=row.no_invoice,
                    label=row.no_invoice,
                    sublabel=row.no_kontrak,
                )
            )
    elif entity_type == "do":
        query = db.query(models.DeliveryOrder).order_by(models.DeliveryOrder.tanggal_do.desc())
        if term:
            query = query.filter(
                (models.DeliveryOrder.no_do.ilike(term))
                | (models.DeliveryOrder.no_invoice.ilike(term))
            )
        for row in query.limit(limit).all():
            results.append(
                schemas.DocumentReferenceOut(
                    entity_type="do",
                    entity_id=row.no_do,
                    label=row.no_do,
                    sublabel=row.no_invoice,
                )
            )
    elif entity_type == "ba":
        query = db.query(models.BeritaAcara).order_by(models.BeritaAcara.tanggal_ba.desc())
        if term:
            query = query.filter(
                (models.BeritaAcara.no_ba.ilike(term))
                | (models.BeritaAcara.no_kontrak.ilike(term))
            )
        for row in query.limit(limit).all():
            results.append(
                schemas.DocumentReferenceOut(
                    entity_type="ba",
                    entity_id=row.no_ba,
                    label=row.no_ba,
                    sublabel=row.no_kontrak,
                )
            )
    else:
        query = db.query(models.LaporanBypass).order_by(models.LaporanBypass.tanggal.desc())
        if term:
            query = query.filter(
                (models.LaporanBypass.unit.ilike(term))
                | (models.LaporanBypass.komoditi.ilike(term))
                | (models.LaporanBypass.pembeli.ilike(term))
            )
        for row in query.limit(limit).all():
            results.append(
                schemas.DocumentReferenceOut(
                    entity_type="bypass",
                    entity_id=str(row.id),
                    label=f"BYPASS-{row.id}",
                    sublabel=f"{row.unit or '-'} · {row.komoditi or '-'}",
                )
            )

    return results


@router.get("/completeness", response_model=schemas.DocumentCompletenessOut)
def document_completeness(
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    include_related: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    entity_type = entity_type.strip().lower()
    entity_id = entity_id.strip()
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type tidak valid")
    if not entity_id:
        raise HTTPException(status_code=400, detail="entity_id wajib diisi")

    _validate_entity(db, entity_type, entity_id)

    display_label = entity_id
    sublabel: Optional[str] = None

    if entity_type == "kontrak":
        row = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == entity_id).first()
        sublabel = row.pembeli if row else None
    elif entity_type == "invoice":
        row = db.query(models.Invoice).filter(models.Invoice.no_invoice == entity_id).first()
        sublabel = row.no_kontrak if row else None
    elif entity_type == "do":
        row = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == entity_id).first()
        sublabel = row.no_invoice if row else None
    elif entity_type == "bypass":
        row = db.query(models.LaporanBypass).filter(models.LaporanBypass.id == int(entity_id)).first()
        display_label = f"BYPASS-{entity_id}"
        sublabel = f"{row.unit or '-'} · {row.komoditi or '-'}" if row else None
    elif entity_type == "ba":
        row = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == entity_id).first()
        sublabel = row.no_kontrak if row else None

    return _completeness_for_entity(
        db,
        entity_type,
        entity_id,
        display_label=display_label,
        sublabel=sublabel,
        include_related=include_related and entity_type in {"kontrak", "invoice"},
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