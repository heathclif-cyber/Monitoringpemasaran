import io
import os
import zipfile
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

import models
import schemas
from database import get_db
from services.auth import require_write
from services.local_storage import (
    StorageError,
    build_folder,
    delete_file,
    get_file_path,
    get_mode,
    is_configured,
    upload_bytes,
)

router = APIRouter(prefix="/api/documents", tags=["Documents"])

VALID_ENTITY_TYPES = {"kontrak", "invoice", "do", "bypass", "ba"}
VALID_DOC_TYPES = {
    "kontrak",
    "invoice",
    "kuitansi",
    "rekening_koran",
    "do",
    "deklarasi",
    "berita_acara",  # BA Serah Terima Barang (biasanya di entity DO)
    "ba_panen",      # BA Panen (entity BA, opsional)
}

DOC_TYPE_LABELS = {
    "kontrak": "Dokumen Kontrak",
    "invoice": "Invoice",
    "kuitansi": "Kuitansi",
    "rekening_koran": "Rekening Koran Penerimaan",
    "do": "Delivery Order",
    "deklarasi": "Deklarasi Penerimaan",
    "berita_acara": "BA Serah Terima Barang",
    "ba_panen": "BA Panen",
}

# Slot wajib per entitas (dihitung di completeness / ringkasan)
ENTITY_DOC_REQUIREMENTS: dict[str, list[str]] = {
    "kontrak": ["kontrak"],
    "invoice": ["invoice", "rekening_koran", "kuitansi"],
    "do": ["do", "deklarasi", "berita_acara"],
    "bypass": ["deklarasi"],
    "ba": [],  # BA Panen opsional — tidak memblokir kelengkapan entitas BA
}

# Slot opsional (ditampilkan di UI, tidak dihitung missing)
ENTITY_OPTIONAL_DOCS: dict[str, list[str]] = {
    "ba": ["ba_panen"],
}


def _doc_type_candidates(entity_type: str, doc_type: str) -> list[str]:
    """BA Panen di entity ba: ba_panen (baru) atau berita_acara (legacy)."""
    if entity_type == "ba" and doc_type in ("ba_panen", "berita_acara"):
        return ["ba_panen", "berita_acara"]
    return [doc_type]


def _pick_upload(
    by_type: dict[str, "models.DocumentUpload"],
    entity_type: str,
    doc_type: str,
) -> "models.DocumentUpload | None":
    for candidate in _doc_type_candidates(entity_type, doc_type):
        if candidate in by_type:
            return by_type[candidate]
    return None

FIXED_MATERIALS = [
    "TBS (TANDAN BUAH SEGAR)",
    "Lump",
    "TH BR CR 3X",
    "TH BR CR 3X HITAM",
    "GULA GAPOKTAN",
    "Gula Kemasan 50 KG Milik PG",
    "KELAPA KUPAS",
    "KELAPA BUTIR",
    "Kopra",
    "SAPI PEJANTAN AFKIR",
    "CPO",
]


def _collect_kontrak_materials(
    kontrak: Optional["models.Kontrak"],
    unit_name: Optional[str] = None,
) -> set[str]:
    if not kontrak:
        return set()
    if unit_name and kontrak.units:
        matched = next((u for u in kontrak.units if u.nama_unit == unit_name), None)
        if matched and matched.jenis_komoditi:
            return {matched.jenis_komoditi}
    values: set[str] = set()
    if kontrak.jenis_komoditi:
        values.add(kontrak.jenis_komoditi)
    if kontrak.deskripsi_produk:
        values.add(kontrak.deskripsi_produk)
    for unit in kontrak.units or []:
        if unit.jenis_komoditi:
            values.add(unit.jenis_komoditi)
    return values


def _entity_matches_material_filter(
    entity_type: str,
    row,
    materials: list[str],
) -> bool:
    if not materials:
        return True
    if entity_type == "bypass":
        return False

    filter_set = set(materials)
    if entity_type == "kontrak":
        return bool(_collect_kontrak_materials(row) & filter_set)

    kontrak = None
    unit_name = None
    if entity_type == "invoice":
        kontrak = row.kontrak
        unit_name = row.nama_unit
    elif entity_type == "do":
        kontrak = row.invoice.kontrak if row.invoice else None
        unit_name = row.kepada_unit or (row.invoice.nama_unit if row.invoice else None)
    elif entity_type == "ba":
        kontrak = row.kontrak
        unit_name = row.nama_unit

    if not kontrak:
        return False
    return bool(_collect_kontrak_materials(kontrak, unit_name) & filter_set)


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


def _check_file_exists(upload: "models.DocumentUpload") -> bool:
    if not upload or not upload.storage_path:
        return False
    try:
        get_file_path(upload.storage_path)
        return True
    except StorageError:
        import logging
        logging.getLogger(__name__).warning(
            "file_exists=False id=%s storage_path=%r", upload.id, upload.storage_path
        )
        return False


def _upload_out(record: "models.DocumentUpload") -> schemas.DocumentUploadOut:
    data = schemas.DocumentUploadOut.model_validate(record).model_dump()
    data["file_exists"] = _check_file_exists(record)
    return schemas.DocumentUploadOut(**data)


def _slot_from_upload(
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
    upload: "models.DocumentUpload | None",
    required: bool = True,
) -> schemas.DocumentSlotOut:
    file_exists = _check_file_exists(upload) if upload else False
    return schemas.DocumentSlotOut(
        doc_type=doc_type,
        label=DOC_TYPE_LABELS.get(doc_type, doc_type),
        uploaded=upload is not None,
        file_exists=file_exists,
        file_name=upload.file_name if upload else None,
        web_url=upload.web_url if upload else None,
        uploaded_at=upload.uploaded_at if upload else None,
        document_id=upload.id if upload else None,
        required=required,
        entity_type=entity_type,
        entity_id=entity_id,
        slot_key=f"{entity_type}:{doc_type}",
    )


def _build_slots(db: Session, entity_type: str, entity_id: str) -> list[schemas.DocumentSlotOut]:
    required = ENTITY_DOC_REQUIREMENTS.get(entity_type, [])
    optional = ENTITY_OPTIONAL_DOCS.get(entity_type, [])
    uploads = (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type == entity_type,
            models.DocumentUpload.entity_id == entity_id,
        )
        .order_by(models.DocumentUpload.uploaded_at.desc())
        .all()
    )
    by_type: dict[str, models.DocumentUpload] = {}
    for u in uploads:
        if u.doc_type not in by_type:
            by_type[u.doc_type] = u

    slots: list[schemas.DocumentSlotOut] = []
    for doc_type in required:
        upload = _pick_upload(by_type, entity_type, doc_type)
        slots.append(
            _slot_from_upload(
                entity_type=entity_type,
                entity_id=entity_id,
                doc_type=doc_type,
                upload=upload,
                required=True,
            )
        )
    for doc_type in optional:
        upload = _pick_upload(by_type, entity_type, doc_type)
        slots.append(
            _slot_from_upload(
                entity_type=entity_type,
                entity_id=entity_id,
                doc_type=doc_type,
                upload=upload,
                required=False,
            )
        )
    return slots


def _summarize_slots(slots: list[schemas.DocumentSlotOut]) -> schemas.DocumentCompletenessSummary:
    # Hanya slot wajib; file harus benar-benar ada di disk
    required = [s for s in slots if s.required]
    uploaded = sum(1 for s in required if s.uploaded and s.file_exists)
    total = len(required)
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
    elif entity_type == "ba" and doc_type in ("berita_acara", "ba_panen"):
        ba = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_ba == entity_id).first()
        if ba:
            ba.link_berita_acara = web_url


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/status")
def documents_status():
    return {
        "configured": is_configured(),
        "mode": get_mode(),
        "auth_url": None,
        "redirect_uri": None,
        "doc_types": sorted(VALID_DOC_TYPES),
        "entity_types": sorted(VALID_ENTITY_TYPES),
    }


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


def _build_slots_from_cache(
    entity_type: str,
    entity_id: str,
    uploads_cache: dict[str, dict[str, "models.DocumentUpload"]],
) -> list[schemas.DocumentSlotOut]:
    """Build slots using a pre-fetched cache (avoids per-row DB queries)."""
    required = ENTITY_DOC_REQUIREMENTS.get(entity_type, [])
    optional = ENTITY_OPTIONAL_DOCS.get(entity_type, [])
    by_type = uploads_cache.get(entity_id, {})
    slots: list[schemas.DocumentSlotOut] = []
    for doc_type in required:
        upload = _pick_upload(by_type, entity_type, doc_type)
        slots.append(
            _slot_from_upload(
                entity_type=entity_type,
                entity_id=entity_id,
                doc_type=doc_type,
                upload=upload,
                required=True,
            )
        )
    for doc_type in optional:
        upload = _pick_upload(by_type, entity_type, doc_type)
        slots.append(
            _slot_from_upload(
                entity_type=entity_type,
                entity_id=entity_id,
                doc_type=doc_type,
                upload=upload,
                required=False,
            )
        )
    return slots


@router.get("/materials", response_model=List[str])
def list_materials(db: Session = Depends(get_db)):
    """Daftar jenis material untuk filter upload dokumen."""
    values: set[str] = set(FIXED_MATERIALS)
    for (val,) in db.query(models.Kontrak.jenis_komoditi).distinct().all():
        if val and val.strip():
            values.add(val.strip())
    for (val,) in db.query(models.KontrakUnit.jenis_komoditi).distinct().all():
        if val and val.strip():
            values.add(val.strip())
    for (val,) in db.query(models.Kontrak.deskripsi_produk).distinct().all():
        if val and val.strip():
            values.add(val.strip())
    return sorted(values)


def _pipeline_slot(
    *,
    slot_key: str,
    label: str,
    required: bool,
    entity_type: Optional[str],
    entity_id: Optional[str],
    doc_type: Optional[str],
    cache: dict[tuple[str, str], dict[str, "models.DocumentUpload"]],
    note: Optional[str] = None,
) -> schemas.DocumentPipelineSlotOut:
    upload = None
    if entity_type and entity_id and doc_type:
        by_type = cache.get((entity_type, entity_id), {})
        upload = _pick_upload(by_type, entity_type, doc_type)
    file_exists = _check_file_exists(upload) if upload else False
    uploaded = upload is not None and file_exists
    return schemas.DocumentPipelineSlotOut(
        slot_key=slot_key,
        label=label,
        required=required,
        entity_type=entity_type,
        entity_id=entity_id,
        doc_type=doc_type,
        uploaded=uploaded,
        file_exists=file_exists if upload else True,
        file_name=upload.file_name if upload else None,
        web_url=upload.web_url if upload else None,
        uploaded_at=upload.uploaded_at if upload else None,
        document_id=upload.id if upload else None,
        note=note,
    )


def _superman_status_for_row(
    *,
    superman_no: Optional[str],
    kontrak_ok: bool,
    invoice_ok: bool,
    rekening_ok: bool,
    ba_panen_ok: bool,
    tipe_alur: str,
    has_ba: bool,
) -> str:
    if superman_no and str(superman_no).strip():
        return "done"
    if tipe_alur == "PAYUNG_BA":
        if not has_ba:
            return "missing_docs"
        ready = ba_panen_ok and invoice_ok and rekening_ok
    else:
        ready = kontrak_ok and invoice_ok and rekening_ok
    return "ready" if ready else "missing_docs"


_PIPELINE_MISSING_SLOTS = {
    "ba_serah_terima",
    "do",
    "deklarasi",
    "kontrak",
    "invoice",
    "rekening_koran",
    "superman",
    "unit_tasks",  # DO file + deklarasi + BA Serah Terima
    "ba_panen",  # opsional — baris yang sudah punya file BA Panen (filter "with")
}


def _row_matches_missing_slot(row: schemas.DocumentPipelineRowOut, missing_slot: str) -> bool:
    if missing_slot == "superman":
        return bool(row.no_invoice) and row.superman_status != "done"
    if missing_slot == "unit_tasks":
        return any(
            s.slot_key in ("do", "deklarasi", "ba_serah_terima") and s.required and not s.uploaded
            for s in row.slots
        )
    if missing_slot == "ba_panen":
        return any(s.slot_key == "ba_panen" and s.uploaded for s in row.slots)
    return any(s.slot_key == missing_slot and not s.uploaded for s in row.slots)


@router.get("/pipeline", response_model=schemas.DocumentPipelineResponse)
def document_pipeline(
    status_filter: str = Query(default="incomplete"),
    missing_slot: Optional[str] = Query(default=None),
    unit: Optional[str] = Query(default=None),
    material: List[str] = Query(default=[]),
    q: str = Query(default=""),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Pantau kelengkapan rantai dokumen per DO (dan invoice tanpa DO).

    Slot wajib: Kontrak, Invoice, Rekening Koran, DO, Deklarasi, BA Serah Terima.
    Opsional: Kuitansi, BA Panen.
    Superman: status nomor SPP (bukan file upload).

    missing_slot: ba_serah_terima | do | deklarasi | kontrak | invoice |
                  rekening_koran | superman | unit_tasks | ba_panen
    """
    if status_filter not in ("all", "complete", "incomplete"):
        raise HTTPException(status_code=400, detail="status_filter tidak valid")

    slot_filter = missing_slot.strip().lower() if missing_slot and missing_slot.strip() else None
    if slot_filter and slot_filter not in _PIPELINE_MISSING_SLOTS:
        raise HTTPException(
            status_code=400,
            detail=f"missing_slot tidak valid. Pilih: {', '.join(sorted(_PIPELINE_MISSING_SLOTS))}",
        )

    materials = [m.strip() for m in material if m and m.strip()]
    unit_filter = unit.strip() if unit and unit.strip() else None
    term = q.strip().lower() if q and q.strip() else None

    dos = (
        db.query(models.DeliveryOrder)
        .options(
            joinedload(models.DeliveryOrder.invoice)
            .joinedload(models.Invoice.kontrak)
            .joinedload(models.Kontrak.units),
            joinedload(models.DeliveryOrder.invoice).joinedload(models.Invoice.pembayaran),
            joinedload(models.DeliveryOrder.invoice).joinedload(models.Invoice.berita_acara),
            joinedload(models.DeliveryOrder.berita_acara),
            joinedload(models.DeliveryOrder.pembayaran),
        )
        .order_by(models.DeliveryOrder.tanggal_do.desc())
        .limit(1000)
        .all()
    )

    # Invoice yang belum punya DO — tetap dipantau
    invoices_with_do = {d.no_invoice for d in dos if d.no_invoice}
    orphan_invoices = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.kontrak).joinedload(models.Kontrak.units),
            joinedload(models.Invoice.pembayaran),
            joinedload(models.Invoice.berita_acara),
        )
        .order_by(models.Invoice.tanggal_transaksi.desc())
        .limit(500)
        .all()
    )
    orphan_invoices = [inv for inv in orphan_invoices if inv.no_invoice not in invoices_with_do]

    # Kumpulkan entity ids untuk batch upload
    entity_keys: list[tuple[str, str]] = []
    for do in dos:
        inv = do.invoice
        kontrak = inv.kontrak if inv else None
        if kontrak:
            entity_keys.append(("kontrak", kontrak.no_kontrak))
        if inv:
            entity_keys.append(("invoice", inv.no_invoice))
        entity_keys.append(("do", do.no_do))
        no_ba = do.no_ba or (inv.no_ba if inv else None)
        if no_ba:
            entity_keys.append(("ba", no_ba))
    for inv in orphan_invoices:
        if inv.kontrak:
            entity_keys.append(("kontrak", inv.kontrak.no_kontrak))
        entity_keys.append(("invoice", inv.no_invoice))
        if inv.no_ba:
            entity_keys.append(("ba", inv.no_ba))

    entity_keys = list(dict.fromkeys(entity_keys))
    cache: dict[tuple[str, str], dict[str, models.DocumentUpload]] = {}
    if entity_keys:
        # Query per entity_type groups to keep filter efficient
        by_type_ids: dict[str, list[str]] = {}
        for et, eid in entity_keys:
            by_type_ids.setdefault(et, []).append(eid)
        for et, ids in by_type_ids.items():
            uploads = (
                db.query(models.DocumentUpload)
                .filter(
                    models.DocumentUpload.entity_type == et,
                    models.DocumentUpload.entity_id.in_(ids),
                )
                .order_by(models.DocumentUpload.uploaded_at.desc())
                .all()
            )
            for u in uploads:
                key = (et, u.entity_id)
                if key not in cache:
                    cache[key] = {}
                if u.doc_type not in cache[key]:
                    cache[key][u.doc_type] = u

    def build_row(
        *,
        no_kontrak: str,
        no_invoice: Optional[str],
        no_do: Optional[str],
        no_ba: Optional[str],
        unit_name: Optional[str],
        komoditi: Optional[str],
        pembeli: Optional[str],
        tanggal,
        tipe_alur: str,
        superman_no: Optional[str],
        kontrak_obj,
    ) -> schemas.DocumentPipelineRowOut | None:
        if unit_filter and (unit_name or "").strip() != unit_filter:
            return None
        if materials:
            if not kontrak_obj:
                return None
            if not (_collect_kontrak_materials(kontrak_obj, unit_name) & set(materials)):
                return None

        if term:
            hay = " ".join(
                filter(
                    None,
                    [no_kontrak, no_invoice, no_do, no_ba, unit_name, komoditi, pembeli, superman_no],
                )
            ).lower()
            if term not in hay:
                return None

        slots: list[schemas.DocumentPipelineSlotOut] = [
            _pipeline_slot(
                slot_key="kontrak",
                label=DOC_TYPE_LABELS["kontrak"],
                required=True,
                entity_type="kontrak",
                entity_id=no_kontrak,
                doc_type="kontrak",
                cache=cache,
            ),
            _pipeline_slot(
                slot_key="invoice",
                label=DOC_TYPE_LABELS["invoice"],
                required=bool(no_invoice),
                entity_type="invoice" if no_invoice else None,
                entity_id=no_invoice,
                doc_type="invoice" if no_invoice else None,
                cache=cache,
                note=None if no_invoice else "Invoice belum dibuat",
            ),
            _pipeline_slot(
                slot_key="rekening_koran",
                label=DOC_TYPE_LABELS["rekening_koran"],
                required=bool(no_invoice),
                entity_type="invoice" if no_invoice else None,
                entity_id=no_invoice,
                doc_type="rekening_koran" if no_invoice else None,
                cache=cache,
            ),
            _pipeline_slot(
                slot_key="kuitansi",
                label=DOC_TYPE_LABELS["kuitansi"],
                required=False,
                entity_type="invoice" if no_invoice else None,
                entity_id=no_invoice,
                doc_type="kuitansi" if no_invoice else None,
                cache=cache,
            ),
            _pipeline_slot(
                slot_key="do",
                label=DOC_TYPE_LABELS["do"],
                required=bool(no_do),
                entity_type="do" if no_do else None,
                entity_id=no_do,
                doc_type="do" if no_do else None,
                cache=cache,
                note=None if no_do else "DO belum dibuat",
            ),
            _pipeline_slot(
                slot_key="deklarasi",
                label=DOC_TYPE_LABELS["deklarasi"],
                required=bool(no_do),
                entity_type="do" if no_do else None,
                entity_id=no_do,
                doc_type="deklarasi" if no_do else None,
                cache=cache,
            ),
            _pipeline_slot(
                slot_key="ba_serah_terima",
                label=DOC_TYPE_LABELS["berita_acara"],
                required=bool(no_do),
                entity_type="do" if no_do else None,
                entity_id=no_do,
                doc_type="berita_acara" if no_do else None,
                cache=cache,
                note=None if no_do else "BA Serah Terima diunggah per DO",
            ),
            _pipeline_slot(
                slot_key="ba_panen",
                label=DOC_TYPE_LABELS["ba_panen"],
                required=False,
                entity_type="ba" if no_ba else None,
                entity_id=no_ba,
                doc_type="ba_panen" if no_ba else None,
                cache=cache,
                note=(
                    f"No. BA: {no_ba}"
                    if no_ba
                    else "Opsional — hanya jika ada BA Panen (alur payung)"
                ),
            ),
        ]

        kontrak_ok = slots[0].uploaded
        invoice_ok = slots[1].uploaded if no_invoice else False
        rekening_ok = slots[2].uploaded if no_invoice else False
        ba_panen_ok = slots[7].uploaded if no_ba else False
        sm_status = _superman_status_for_row(
            superman_no=superman_no,
            kontrak_ok=kontrak_ok,
            invoice_ok=invoice_ok,
            rekening_ok=rekening_ok,
            ba_panen_ok=ba_panen_ok,
            tipe_alur=tipe_alur,
            has_ba=bool(no_ba),
        )
        # Slot status Superman (bukan file)
        slots.append(
            schemas.DocumentPipelineSlotOut(
                slot_key="superman",
                label="Superman (No. SPP)",
                required=bool(no_invoice),
                entity_type=None,
                entity_id=None,
                doc_type=None,
                uploaded=sm_status == "done",
                file_exists=True,
                file_name=superman_no if sm_status == "done" else None,
                web_url=None,
                uploaded_at=None,
                document_id=None,
                note=(
                    f"No. SPP: {superman_no}"
                    if sm_status == "done"
                    else (
                        "Dokumen pendukung siap — belum dideklarasikan"
                        if sm_status == "ready"
                        else "Dokumen pendukung Superman belum lengkap"
                    )
                ),
            )
        )

        required_slots = [s for s in slots if s.required]
        required_uploaded = sum(1 for s in required_slots if s.uploaded)
        missing = [s.label for s in required_slots if not s.uploaded]
        is_complete = len(missing) == 0

        row_key = no_do or no_invoice or no_kontrak
        return schemas.DocumentPipelineRowOut(
            row_key=row_key,
            no_kontrak=no_kontrak,
            no_invoice=no_invoice,
            no_do=no_do,
            no_ba=no_ba,
            unit=unit_name,
            komoditi=komoditi,
            pembeli=pembeli,
            tanggal=tanggal,
            tipe_alur=tipe_alur or "STANDAR",
            superman=superman_no,
            superman_status=sm_status if no_invoice else "none",
            slots=slots,
            required_total=len(required_slots),
            required_uploaded=required_uploaded,
            missing_required=missing,
            is_complete=is_complete,
        )

    all_rows: list[schemas.DocumentPipelineRowOut] = []
    units_set: set[str] = set()

    for do in dos:
        inv = do.invoice
        if not inv or not inv.kontrak:
            continue
        kontrak = inv.kontrak
        unit_name = (
            do.kepada_unit
            or inv.nama_unit
            or kontrak.kebun_produsen
            or (kontrak.units[0].nama_unit if kontrak.units else None)
        )
        if unit_name:
            units_set.add(unit_name)
        no_ba = do.no_ba or inv.no_ba
        # Superman: prefer pembayaran → do → invoice
        sm = None
        if do.pembayaran and do.pembayaran.superman:
            sm = do.pembayaran.superman
        elif do.superman:
            sm = do.superman
        elif inv.superman:
            sm = inv.superman
        else:
            for p in inv.pembayaran or []:
                if p.superman:
                    sm = p.superman
                    break

        materials_set = _collect_kontrak_materials(kontrak, unit_name)
        komoditi = next(iter(materials_set), kontrak.jenis_komoditi or kontrak.deskripsi_produk)

        row = build_row(
            no_kontrak=kontrak.no_kontrak,
            no_invoice=inv.no_invoice,
            no_do=do.no_do,
            no_ba=no_ba,
            unit_name=unit_name,
            komoditi=komoditi,
            pembeli=kontrak.pembeli,
            tanggal=do.tanggal_do,
            tipe_alur=getattr(kontrak, "tipe_alur", None) or "STANDAR",
            superman_no=sm,
            kontrak_obj=kontrak,
        )
        if row:
            all_rows.append(row)

    for inv in orphan_invoices:
        if not inv.kontrak:
            continue
        kontrak = inv.kontrak
        unit_name = inv.nama_unit or kontrak.kebun_produsen or (
            kontrak.units[0].nama_unit if kontrak.units else None
        )
        if unit_name:
            units_set.add(unit_name)
        sm = inv.superman
        if not sm:
            for p in inv.pembayaran or []:
                if p.superman:
                    sm = p.superman
                    break
        materials_set = _collect_kontrak_materials(kontrak, unit_name)
        komoditi = next(iter(materials_set), kontrak.jenis_komoditi or kontrak.deskripsi_produk)
        row = build_row(
            no_kontrak=kontrak.no_kontrak,
            no_invoice=inv.no_invoice,
            no_do=None,
            no_ba=inv.no_ba,
            unit_name=unit_name,
            komoditi=komoditi,
            pembeli=kontrak.pembeli,
            tanggal=inv.tanggal_transaksi,
            tipe_alur=getattr(kontrak, "tipe_alur", None) or "STANDAR",
            superman_no=sm,
            kontrak_obj=kontrak,
        )
        if row:
            all_rows.append(row)

    # Ringkasan dari hasil filter unit/material/q (sebelum status & missing_slot)
    summary = schemas.DocumentPipelineSummaryOut(
        total_rows=len(all_rows),
        complete=sum(1 for r in all_rows if r.is_complete),
        incomplete=sum(1 for r in all_rows if not r.is_complete),
        missing_kontrak=sum(
            1 for r in all_rows if any(s.slot_key == "kontrak" and not s.uploaded for s in r.slots)
        ),
        missing_invoice=sum(
            1
            for r in all_rows
            if any(s.slot_key == "invoice" and s.required and not s.uploaded for s in r.slots)
        ),
        missing_do=sum(
            1 for r in all_rows if any(s.slot_key == "do" and s.required and not s.uploaded for s in r.slots)
        ),
        missing_deklarasi=sum(
            1
            for r in all_rows
            if any(s.slot_key == "deklarasi" and s.required and not s.uploaded for s in r.slots)
        ),
        missing_ba_serah_terima=sum(
            1
            for r in all_rows
            if any(s.slot_key == "ba_serah_terima" and s.required and not s.uploaded for s in r.slots)
        ),
        missing_superman=sum(1 for r in all_rows if r.superman_status != "done" and r.no_invoice),
        with_ba_panen=sum(
            1 for r in all_rows if any(s.slot_key == "ba_panen" and s.uploaded for s in r.slots)
        ),
    )

    rows = all_rows
    if status_filter == "complete":
        rows = [r for r in rows if r.is_complete]
    elif status_filter == "incomplete":
        rows = [r for r in rows if not r.is_complete]

    if slot_filter:
        rows = [r for r in rows if _row_matches_missing_slot(r, slot_filter)]

    rows = rows[:limit]

    return schemas.DocumentPipelineResponse(summary=summary, rows=rows, units=sorted(units_set))


@router.get("/summary", response_model=List[schemas.DocumentSummaryRow])
def document_summary(
    entity_type: str = Query(...),
    status_filter: str = Query(default="incomplete"),
    material: List[str] = Query(default=[]),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Ringkasan upload per entitas. Filter: all | complete | incomplete, material (multi)."""
    entity_type = entity_type.strip().lower()
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type tidak valid")
    if status_filter not in ("all", "complete", "incomplete"):
        raise HTTPException(status_code=400, detail="status_filter tidak valid")

    materials = [m.strip() for m in material if m and m.strip()]

    # Ambil lebih banyak baris bila ada filter agar hasil akhir tetap mendekati limit
    fetch_limit = min(limit * 10, 1000) if materials or status_filter != "all" else limit

    # --- 1. Fetch entity rows ---
    entity_rows: list[tuple[str, str | None]] = []  # (entity_id, sublabel)
    display_labels: dict[str, str] = {}

    if entity_type == "kontrak":
        query = (
            db.query(models.Kontrak)
            .options(joinedload(models.Kontrak.units))
            .order_by(models.Kontrak.tanggal_kontrak.desc())
        )
        for row in query.limit(fetch_limit).all():
            if not _entity_matches_material_filter("kontrak", row, materials):
                continue
            entity_rows.append((row.no_kontrak, row.pembeli))
            display_labels[row.no_kontrak] = row.no_kontrak
    elif entity_type == "invoice":
        query = (
            db.query(models.Invoice)
            .options(joinedload(models.Invoice.kontrak).joinedload(models.Kontrak.units))
            .order_by(models.Invoice.tanggal_transaksi.desc())
        )
        for row in query.limit(fetch_limit).all():
            if not _entity_matches_material_filter("invoice", row, materials):
                continue
            entity_rows.append((row.no_invoice, row.no_kontrak))
            display_labels[row.no_invoice] = row.no_invoice
    elif entity_type == "do":
        query = (
            db.query(models.DeliveryOrder)
            .options(
                joinedload(models.DeliveryOrder.invoice)
                .joinedload(models.Invoice.kontrak)
                .joinedload(models.Kontrak.units),
            )
            .order_by(models.DeliveryOrder.tanggal_do.desc())
        )
        for row in query.limit(fetch_limit).all():
            if not _entity_matches_material_filter("do", row, materials):
                continue
            entity_rows.append((row.no_do, row.no_invoice))
            display_labels[row.no_do] = row.no_do
    elif entity_type == "ba":
        query = (
            db.query(models.BeritaAcara)
            .options(joinedload(models.BeritaAcara.kontrak).joinedload(models.Kontrak.units))
            .order_by(models.BeritaAcara.tanggal_ba.desc())
        )
        for row in query.limit(fetch_limit).all():
            if not _entity_matches_material_filter("ba", row, materials):
                continue
            entity_rows.append((row.no_ba, row.no_kontrak))
            display_labels[row.no_ba] = row.no_ba
    elif entity_type == "bypass":
        if not materials:
            for row in db.query(models.LaporanBypass).order_by(models.LaporanBypass.tanggal.desc()).limit(fetch_limit):
                eid = str(row.id)
                entity_rows.append((eid, f"{row.unit or '-'} · {row.komoditi or '-'}"))
                display_labels[eid] = f"BYPASS-{eid}"

    if not entity_rows:
        return []

    # --- 2. Batch-fetch all uploads in ONE query ---
    all_ids = [eid for eid, _ in entity_rows]
    all_uploads = (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type == entity_type,
            models.DocumentUpload.entity_id.in_(all_ids),
        )
        .order_by(models.DocumentUpload.uploaded_at.desc())
        .all()
    )

    # Build cache: entity_id -> {doc_type -> most-recent upload}
    cache: dict[str, dict[str, models.DocumentUpload]] = {}
    for u in all_uploads:
        if u.entity_id not in cache:
            cache[u.entity_id] = {}
        if u.doc_type not in cache[u.entity_id]:
            cache[u.entity_id][u.doc_type] = u

    # --- 3. Build result rows in memory (no further DB queries) ---
    rows: list[schemas.DocumentSummaryRow] = []
    for entity_id, sublabel in entity_rows:
        slots = _build_slots_from_cache(entity_type, entity_id, cache)
        summary = _summarize_slots(slots)
        if status_filter == "complete" and summary.missing > 0:
            continue
        if status_filter == "incomplete" and summary.missing == 0:
            continue
        rows.append(schemas.DocumentSummaryRow(
            entity_type=entity_type,
            entity_id=entity_id,
            display_label=display_labels[entity_id],
            sublabel=sublabel,
            total=summary.total,
            uploaded=summary.uploaded,
            missing=summary.missing,
            slots=slots,
        ))
        if len(rows) >= limit:
            break

    return rows


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

    records = q.order_by(models.DocumentUpload.uploaded_at.desc()).all()
    return [_upload_out(record) for record in records]


_EXT_MEDIA_TYPE: dict[str, str] = {
    "pdf":  "application/pdf",
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls":  "application/vnd.ms-excel",
}


def _file_media_type(file_name: str) -> str:
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    return _EXT_MEDIA_TYPE.get(ext, "application/octet-stream")


@router.get("/view/{document_id}")
def view_document(document_id: int, db: Session = Depends(get_db)):
    """Serve file inline agar bisa ditampilkan langsung di browser."""
    record = db.query(models.DocumentUpload).filter(models.DocumentUpload.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
    if not record.storage_path:
        raise HTTPException(status_code=404, detail="File tidak tersedia")

    try:
        file_path = get_file_path(record.storage_path)
    except StorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return FileResponse(path=file_path, media_type=_file_media_type(record.file_name))


@router.get("/download/{document_id}")
def download_document(document_id: int, db: Session = Depends(get_db)):
    """Download file yang di-upload via local storage."""
    record = db.query(models.DocumentUpload).filter(models.DocumentUpload.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
    if not record.storage_path:
        raise HTTPException(status_code=404, detail="File tidak tersedia")

    try:
        file_path = get_file_path(record.storage_path)
    except StorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return FileResponse(
        path=file_path,
        filename=record.file_name,
        media_type="application/octet-stream",
    )


@router.post("/upload", response_model=schemas.DocumentUploadOut)
async def upload_document(
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_write),
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
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Hanya file PDF yang diizinkan")

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
    except StorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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
        existing.storage_path = result["storage_path"]
        existing.web_url = ""  # diisi setelah commit (pakai ID)
        record = existing
    else:
        record = models.DocumentUpload(
            entity_type=entity_type,
            entity_id=entity_id,
            doc_type=doc_type,
            file_name=result["file_name"],
            storage_path=result["storage_path"],
            web_url="",  # diisi setelah commit
        )
        db.add(record)

    # Commit dulu agar record dapat ID
    db.flush()
    # Set web_url dengan ID yang sudah ada
    record.web_url = f"/api/documents/download/{record.id}"
    db.commit()
    db.refresh(record)

    _sync_entity_link(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        doc_type=doc_type,
        web_url=record.web_url,
    )

    return _upload_out(record)


def _bundle_number_name(entity_id: str) -> str:
    """Nomor dokumen untuk nama file — slash diganti agar tetap datar di ZIP."""
    return (
        entity_id.replace("/", "-")
        .replace("\\", "-")
        .strip()
    )


# Prefix nama file di bundle — None = nomor dokumen saja
BUNDLE_FILE_PREFIX: dict[str, str | None] = {
    "kontrak": None,
    "invoice": None,
    "kuitansi": "Kuitansi",
    "do": None,
    "deklarasi": "Deklarasi",
    "berita_acara": "BA-Serah-Terima",
    "ba_panen": "BA-Panen",
    "rekening_koran": "Rekening-Koran",
}


def _flat_bundle_arcname(
    entity_id: str,
    doc_type: str,
    file_name: str,
    used_names: set[str],
) -> str:
    """Nama file bundle: nomor dokumen, atau Prefix-Nomor untuk jenis selain utama."""
    _, ext = os.path.splitext(file_name)
    ext = ext or ""

    base = _bundle_number_name(entity_id)
    prefix = BUNDLE_FILE_PREFIX.get(doc_type)
    stem = f"{prefix}-{base}" if prefix else base

    candidate = f"{stem}{ext}"
    if candidate not in used_names:
        used_names.add(candidate)
        return candidate

    n = 2
    while True:
        alt = f"{stem}-{n}{ext}"
        if alt not in used_names:
            used_names.add(alt)
            return alt
        n += 1


@router.get("/bundle/kontrak")
def bundle_kontrak(no_kontrak: str = Query(...), db: Session = Depends(get_db)):
    """Download semua dokumen terkait 1 kontrak sebagai ZIP datar (tanpa subfolder)."""
    kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not kontrak:
        raise HTTPException(status_code=404, detail="Kontrak tidak ditemukan")

    # Kumpulkan semua entity yang terkait: kontrak + invoice + DO + BA
    entities: list[tuple[str, str]] = []

    entities.append(("kontrak", no_kontrak))

    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.no_kontrak == no_kontrak)
        .order_by(models.Invoice.tanggal_transaksi)
        .all()
    )
    for inv in invoices:
        entities.append(("invoice", inv.no_invoice))
        dos = (
            db.query(models.DeliveryOrder)
            .filter(models.DeliveryOrder.no_invoice == inv.no_invoice)
            .order_by(models.DeliveryOrder.tanggal_do)
            .all()
        )
        for do in dos:
            entities.append(("do", do.no_do))

    bas = (
        db.query(models.BeritaAcara)
        .filter(models.BeritaAcara.no_kontrak == no_kontrak)
        .order_by(models.BeritaAcara.tanggal_ba)
        .all()
    )
    for ba in bas:
        entities.append(("ba", ba.no_ba))

    # Batch-fetch semua uploads
    all_entity_ids = [eid for _, eid in entities]
    all_types = list({et for et, _ in entities})
    uploads = (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type.in_(all_types),
            models.DocumentUpload.entity_id.in_(all_entity_ids),
        )
        .all()
    )
    upload_map: dict[tuple[str, str], list[models.DocumentUpload]] = {}
    for u in uploads:
        key = (u.entity_type, u.entity_id)
        upload_map.setdefault(key, []).append(u)

    # Build ZIP in memory — semua file di root, tanpa subfolder
    zip_buffer = io.BytesIO()
    total_files = 0
    used_arcnames: set[str] = set()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for entity_type, entity_id in entities:
            recs = upload_map.get((entity_type, entity_id), [])
            for rec in recs:
                if not rec.storage_path:
                    continue
                try:
                    file_path = get_file_path(rec.storage_path)
                    arcname = _flat_bundle_arcname(
                        entity_id, rec.doc_type, rec.file_name, used_arcnames,
                    )
                    zf.write(file_path, arcname)
                    total_files += 1
                except StorageError:
                    pass  # skip file yang tidak ditemukan

    if total_files == 0:
        raise HTTPException(status_code=404, detail="Tidak ada dokumen yang tersedia untuk di-download")

    zip_buffer.seek(0)
    safe_no = no_kontrak.replace("/", "-").replace("\\", "-")
    filename = f"Bundle_{safe_no}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    record = db.query(models.DocumentUpload).filter(models.DocumentUpload.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")

    # Hapus file fisik
    if record.storage_path:
        try:
            delete_file(record.storage_path)
        except StorageError:
            pass  # file mungkin sudah tidak ada

    db.delete(record)
    db.commit()
    return {"success": True}
