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


SupportSource = tuple[str, str, str, str]

_PENDING_SUPPORT_HINT = (
    "Upload salah satu: Kontrak, Invoice, atau Kuitansi (pada nomor invoice terkait)."
)


def _invoice_support_sources(no_invoice: str) -> list[SupportSource]:
    """Dokumen pendukung pada entity Invoice — berlaku semua komoditi."""
    return [
        ("invoice", no_invoice, "invoice", "Dokumen Invoice"),
        ("invoice", no_invoice, "kuitansi", "Kuitansi"),
    ]


def _standar_support_sources(kontrak_id: str, no_invoice: str) -> list[SupportSource]:
    """Kontrak standar — cukup salah satu sumber (semua komoditi)."""
    return [
        ("kontrak", kontrak_id, "kontrak", "Dokumen Kontrak"),
        *_invoice_support_sources(no_invoice),
    ]


def _payung_ba_support_sources(no_ba: str, no_invoice: str) -> list[SupportSource]:
    """Kontrak payung BA — BA atau dokumen invoice (semua komoditi)."""
    return [
        ("ba", no_ba, "berita_acara", "Berita Acara"),
        *_invoice_support_sources(no_invoice),
    ]


def _resolve_first_available(
    db: Session,
    sources: list[SupportSource],
) -> ResolvedSupportDoc:
    last_error: FileNotFoundError | None = None
    for entity_type, entity_id, doc_type, label in sources:
        try:
            return _resolve_upload(
                db,
                entity_type=entity_type,
                entity_id=entity_id,
                doc_type=doc_type,
                label=label,
            )
        except FileNotFoundError as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise FileNotFoundError("Dokumen pendukung tidak ditemukan.")


def _find_first_uploaded(
    db: Session,
    sources: list[SupportSource],
) -> dict[str, str | bool | None] | None:
    for entity_type, entity_id, doc_type, label in sources:
        ok, name = _upload_status(
            db,
            entity_type=entity_type,
            entity_id=entity_id,
            doc_type=doc_type,
        )
        if ok:
            return {
                "label": label,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "doc_type": doc_type,
                "uploaded": True,
                "file_name": name,
                "upload_hint": f"{label} ({entity_type}/{entity_id})",
            }
    return None


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

    no_invoice = invoice.no_invoice
    if not no_invoice:
        raise ValueError(f"Nomor invoice kosong untuk DO: {no_do}")

    if is_payung_ba(kontrak):
        no_ba = do.no_ba or invoice.no_ba
        if not no_ba and do.berita_acara:
            no_ba = do.berita_acara.no_ba
        if not no_ba:
            raise ValueError(
                f"DO {no_do} kontrak payung tanpa nomor BA. "
                "Pastikan invoice/DO terhubung ke Berita Acara."
            )
        return _resolve_first_available(
            db,
            _payung_ba_support_sources(no_ba, no_invoice),
        )

    return _resolve_first_available(
        db,
        _standar_support_sources(kontrak.no_kontrak, no_invoice),
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
    no_invoice = do.invoice.no_invoice
    requirements: list[dict[str, str | bool | None]] = []

    if not no_invoice:
        requirements.append(
            {
                "label": "Invoice",
                "entity_type": "invoice",
                "entity_id": "-",
                "doc_type": "invoice",
                "uploaded": False,
                "file_name": None,
                "upload_hint": f"DO {no_do} belum terhubung ke invoice",
            }
        )
        return requirements, False

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

        sources = _payung_ba_support_sources(no_ba, no_invoice)
        matched = _find_first_uploaded(db, sources)
        if matched:
            requirements.append(matched)
            return requirements, True
        requirements.append(
            {
                "label": "Dokumen Pendukung",
                "entity_type": "invoice",
                "entity_id": no_invoice,
                "doc_type": "invoice",
                "uploaded": False,
                "file_name": None,
                "upload_hint": f"{_PENDING_SUPPORT_HINT} BA: {no_ba}, Invoice: {no_invoice}.",
            }
        )
        return requirements, False

    kontrak_id = kontrak.no_kontrak
    sources = _standar_support_sources(kontrak_id, no_invoice)
    matched = _find_first_uploaded(db, sources)

    if matched:
        requirements.append(matched)
        return requirements, True

    requirements.append(
        {
            "label": "Dokumen Pendukung",
            "entity_type": "invoice",
            "entity_id": no_invoice,
            "doc_type": "invoice",
            "uploaded": False,
            "file_name": None,
            "upload_hint": f"{_PENDING_SUPPORT_HINT} Kontrak: {kontrak_id}, Invoice: {no_invoice}.",
        }
    )
    return requirements, False


def resolve_support_doc_from_do(no_do: str) -> ResolvedSupportDoc:
    from database import SessionLocal

    db = SessionLocal()
    try:
        return resolve_support_doc_for_do(db, no_do)
    finally:
        db.close()