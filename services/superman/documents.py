"""Resolve dokumen pendukung SPPn dari upload Monitoring Pemasaran."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session, joinedload

import models
from services.ba_utils import is_payung_ba
from services.local_storage import StorageError, build_folder, get_file_path

_PREFERRED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png")


@dataclass(frozen=True)
class ResolvedSupportDoc:
    path: Path
    entity_type: str
    entity_id: str
    doc_type: str
    file_name: str
    label: str

    def describe(self) -> str:
        return f"{self.label} ({self.entity_type}/{self.entity_id}, {self.file_name})"


def _latest_upload(
    db: Session,
    entity_type: str,
    entity_id: str,
    doc_type: str,
) -> models.DocumentUpload | None:
    return (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type == entity_type,
            models.DocumentUpload.entity_id == entity_id,
            models.DocumentUpload.doc_type == doc_type,
        )
        .order_by(models.DocumentUpload.uploaded_at.desc())
        .first()
    )


def _path_from_upload(upload: models.DocumentUpload) -> Path:
    if not upload.storage_path:
        raise StorageError("storage_path kosong")
    return Path(get_file_path(upload.storage_path))


def _scan_folder(entity_type: str, entity_id: str, doc_type: str) -> Path | None:
    folder = build_folder(entity_type, entity_id, doc_type)
    if not os.path.isdir(folder):
        return None
    files = [
        os.path.join(folder, name)
        for name in os.listdir(folder)
        if os.path.isfile(os.path.join(folder, name))
    ]
    if not files:
        return None
    for ext in _PREFERRED_EXTENSIONS:
        for file_path in files:
            if file_path.lower().endswith(ext):
                return Path(file_path)
    return Path(files[0])


def _resolve_upload(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
    label: str,
) -> ResolvedSupportDoc:
    upload = _latest_upload(db, entity_type, entity_id, doc_type)
    if upload:
        try:
            path = _path_from_upload(upload)
            if path.is_file():
                return ResolvedSupportDoc(
                    path=path,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    doc_type=doc_type,
                    file_name=upload.file_name,
                    label=label,
                )
        except StorageError:
            pass

    scanned = _scan_folder(entity_type, entity_id, doc_type)
    if scanned and scanned.is_file():
        return ResolvedSupportDoc(
            path=scanned,
            entity_type=entity_type,
            entity_id=entity_id,
            doc_type=doc_type,
            file_name=scanned.name,
            label=label,
        )

    raise FileNotFoundError(
        f"Dokumen {label} tidak ditemukan untuk {entity_type}={entity_id} "
        f"(doc_type={doc_type}). Upload di aplikasi Monitoring Pemasaran."
    )


def resolve_support_doc_for_do(db: Session, no_do: str) -> ResolvedSupportDoc:
    do = (
        db.query(models.DeliveryOrder)
        .options(
            joinedload(models.DeliveryOrder.invoice).joinedload(models.Invoice.kontrak),
            joinedload(models.DeliveryOrder.berita_acara),
        )
        .filter(models.DeliveryOrder.no_do == no_do)
        .first()
    )
    if not do:
        raise ValueError(f"DO tidak ditemukan: {no_do}")

    invoice = do.invoice
    if not invoice:
        raise ValueError(f"Invoice tidak ditemukan untuk DO: {no_do}")

    kontrak = invoice.kontrak
    if not kontrak:
        raise ValueError(f"Kontrak tidak ditemukan untuk DO: {no_do}")

    if is_payung_ba(kontrak):
        no_ba = do.no_ba or invoice.no_ba
        if not no_ba and do.berita_acara:
            no_ba = do.berita_acara.no_ba
        if not no_ba:
            raise ValueError(
                f"DO {no_do} kontrak payung tanpa nomor BA. "
                "Pastikan invoice/DO terhubung ke Berita Acara."
            )
        try:
            return _resolve_upload(
                db,
                entity_type="ba",
                entity_id=no_ba,
                doc_type="berita_acara",
                label="Berita Acara",
            )
        except FileNotFoundError:
            return _resolve_upload(
                db,
                entity_type="do",
                entity_id=no_do,
                doc_type="berita_acara",
                label="Berita Acara (DO)",
            )

    return _resolve_upload(
        db,
        entity_type="kontrak",
        entity_id=kontrak.no_kontrak,
        doc_type="kontrak",
        label="Kontrak",
    )


def _upload_status(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
) -> tuple[bool, str | None]:
    upload = _latest_upload(db, entity_type, entity_id, doc_type)
    if upload:
        try:
            path = _path_from_upload(upload)
            if path.is_file():
                return True, upload.file_name
        except StorageError:
            pass

    scanned = _scan_folder(entity_type, entity_id, doc_type)
    if scanned and scanned.is_file():
        return True, scanned.name
    return False, None


def superman_doc_requirements_for_do(db: Session, no_do: str) -> tuple[list[dict[str, str | bool | None]], bool]:
    """Daftar dokumen wajib sebelum deklarasi Superman + apakah semua sudah ada."""
    do = (
        db.query(models.DeliveryOrder)
        .options(
            joinedload(models.DeliveryOrder.invoice).joinedload(models.Invoice.kontrak),
            joinedload(models.DeliveryOrder.berita_acara),
        )
        .filter(models.DeliveryOrder.no_do == no_do)
        .first()
    )
    if not do or not do.invoice or not do.invoice.kontrak:
        return [], False

    kontrak = do.invoice.kontrak
    requirements: list[dict[str, str | bool | None]] = []

    if is_payung_ba(kontrak):
        no_ba = do.no_ba or do.invoice.no_ba
        if not no_ba and do.berita_acara:
            no_ba = do.berita_acara.no_ba
        if not no_ba:
            requirements.append(
                {
                    "label": "Berita Acara",
                    "entity_type": "ba",
                    "entity_id": "-",
                    "doc_type": "berita_acara",
                    "uploaded": False,
                    "file_name": None,
                    "upload_hint": "Hubungkan DO ke Berita Acara terlebih dahulu",
                }
            )
            return requirements, False

        ba_ok, ba_name = _upload_status(db, entity_type="ba", entity_id=no_ba, doc_type="berita_acara")
        do_ok, do_name = _upload_status(db, entity_type="do", entity_id=no_do, doc_type="berita_acara")
        uploaded = ba_ok or do_ok
        requirements.append(
            {
                "label": "Berita Acara",
                "entity_type": "ba" if ba_ok else "do",
                "entity_id": no_ba if ba_ok else no_do,
                "doc_type": "berita_acara",
                "uploaded": uploaded,
                "file_name": ba_name or do_name,
                "upload_hint": f"Upload di menu Upload Dokumen → BA → {no_ba}",
            }
        )
        return requirements, uploaded

    kontrak_id = kontrak.no_kontrak
    uploaded, file_name = _upload_status(
        db,
        entity_type="kontrak",
        entity_id=kontrak_id,
        doc_type="kontrak",
    )
    requirements.append(
        {
            "label": "Dokumen Kontrak",
            "entity_type": "kontrak",
            "entity_id": kontrak_id,
            "doc_type": "kontrak",
            "uploaded": uploaded,
            "file_name": file_name,
            "upload_hint": f"Upload di menu Upload Dokumen → Kontrak → {kontrak_id}",
        }
    )
    return requirements, uploaded


def resolve_support_doc_from_do(no_do: str) -> ResolvedSupportDoc:
    from database import SessionLocal

    db = SessionLocal()
    try:
        return resolve_support_doc_for_do(db, no_do)
    finally:
        db.close()