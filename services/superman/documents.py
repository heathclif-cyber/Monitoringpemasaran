"""Resolve dokumen pendukung SPPn dari upload Monitoring Pemasaran."""

from __future__ import annotations

import os
import tempfile
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
    document_id: int | None = None

    def describe(self) -> str:
        return f"{self.label} ({self.entity_type}/{self.entity_id}, {self.file_name})"


def _doc_type_candidates(entity_type: str, doc_type: str) -> list[str]:
    """Entity ba: berita_acara (utama) atau ba_panen (file legacy)."""
    if entity_type == "ba" and doc_type in ("ba_panen", "berita_acara"):
        return ["berita_acara", "ba_panen"]
    return [doc_type]


def _latest_upload(
    db: Session,
    entity_type: str,
    entity_id: str,
    doc_type: str,
) -> models.DocumentUpload | None:
    for candidate in _doc_type_candidates(entity_type, doc_type):
        upload = (
            db.query(models.DocumentUpload)
            .filter(
                models.DocumentUpload.entity_type == entity_type,
                models.DocumentUpload.entity_id == entity_id,
                models.DocumentUpload.doc_type == candidate,
            )
            .order_by(models.DocumentUpload.uploaded_at.desc())
            .first()
        )
        if upload:
            return upload
    return None


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
                    doc_type=upload.doc_type or doc_type,
                    file_name=upload.file_name,
                    label=label,
                    document_id=int(upload.id) if upload.id is not None else None,
                )
        except StorageError:
            pass

    for candidate in _doc_type_candidates(entity_type, doc_type):
        scanned = _scan_folder(entity_type, entity_id, candidate)
        if scanned and scanned.is_file():
            return ResolvedSupportDoc(
                path=scanned,
                entity_type=entity_type,
                entity_id=entity_id,
                doc_type=candidate,
                file_name=scanned.name,
                label=label,
                document_id=int(upload.id) if upload and upload.id is not None else None,
            )

    raise FileNotFoundError(
        f"Dokumen {label} tidak ditemukan untuk {entity_type}={entity_id} "
        f"(doc_type={doc_type}). Upload di aplikasi Monitoring Pemasaran."
    )


SupportSource = tuple[str, str, str, str]

_PENDING_SUPPORT_HINT = (
    "Upload Kontrak, Invoice, dan Rekening Koran Penerimaan (wajib). Kuitansi opsional."
)

_ATTACH_ORDER = {
    "invoice": 0,
    "kontrak": 1,
    "berita_acara": 1,
    "ba_panen": 1,
    "rekening_koran": 2,
}


def _invoice_mandatory_sources(no_invoice: str) -> list[SupportSource]:
    return [
        ("invoice", no_invoice, "invoice", "Dokumen Invoice"),
    ]


def _rekening_koran_mandatory_sources(no_invoice: str) -> list[SupportSource]:
    return [
        ("invoice", no_invoice, "rekening_koran", "Rekening Koran Penerimaan"),
    ]


def _kuitansi_optional_sources(no_invoice: str) -> list[SupportSource]:
    return [
        ("invoice", no_invoice, "kuitansi", "Kuitansi"),
    ]


def _faktur_pajak_optional_sources(no_invoice: str) -> list[SupportSource]:
    return [
        ("invoice", no_invoice, "faktur_pajak", "E-Faktur"),
    ]


def _do_optional_sources(delivery_orders: list) -> list[SupportSource]:
    """Dokumen DO + BA serah terima barang per Delivery Order terkait invoice."""
    sources: list[SupportSource] = []
    for do in delivery_orders:
        if not do.no_do:
            continue
        sources.append(("do", do.no_do, "do", "Delivery Order"))
        sources.append(("do", do.no_do, "berita_acara", "BA Serah Terima Barang"))
    return sources


def _standar_mandatory_sources(kontrak_id: str, no_invoice: str) -> list[SupportSource]:
    return [
        ("kontrak", kontrak_id, "kontrak", "Dokumen Kontrak"),
        *_invoice_mandatory_sources(no_invoice),
        *_rekening_koran_mandatory_sources(no_invoice),
    ]


def _payung_ba_mandatory_sources(no_ba: str, no_invoice: str) -> list[SupportSource]:
    return [
        # berita_acara (utama) / ba_panen (legacy file lama)
        ("ba", no_ba, "berita_acara", "Berita Acara"),
        *_invoice_mandatory_sources(no_invoice),
        *_rekening_koran_mandatory_sources(no_invoice),
    ]


def _standar_support_sources(kontrak_id: str, no_invoice: str) -> list[SupportSource]:
    """Alias: dokumen wajib standar (kontrak + invoice)."""
    return _standar_mandatory_sources(kontrak_id, no_invoice)


def _payung_ba_support_sources(no_ba: str, no_invoice: str) -> list[SupportSource]:
    """Alias: dokumen wajib payung BA (BA + invoice)."""
    return _payung_ba_mandatory_sources(no_ba, no_invoice)


def _resolve_optional_docs(
    db: Session,
    sources: list[SupportSource],
) -> list[ResolvedSupportDoc]:
    """Ambil dokumen yang tersedia; lewati yang belum diupload tanpa error."""
    resolved: list[ResolvedSupportDoc] = []
    for entity_type, entity_id, doc_type, label in sources:
        try:
            resolved.append(
                _resolve_upload(
                    db,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    doc_type=doc_type,
                    label=label,
                )
            )
        except FileNotFoundError:
            continue
    return resolved


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


def _requirement_entry(
    db: Session,
    source: SupportSource,
    *,
    required: bool = True,
) -> dict[str, str | bool | None]:
    entity_type, entity_id, doc_type, label = source
    uploaded, file_name = _upload_status(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        doc_type=doc_type,
    )
    stale = _latest_upload(db, entity_type, entity_id, doc_type)
    suffix = "" if required else " (opsional)"
    if uploaded and file_name:
        hint = f"{label} sudah diupload ({file_name})"
    elif stale and stale.file_name:
        hint = (
            f"{label} tercatat di database ({stale.file_name}) tetapi file tidak ada di server — "
            "upload ulang"
        )
    else:
        hint = f"Upload {label} untuk {entity_type}={entity_id}"
    return {
        "label": f"{label}{suffix}",
        "entity_type": entity_type,
        "entity_id": entity_id,
        "doc_type": doc_type,
        "uploaded": uploaded,
        "file_name": file_name,
        "required": required,
        "upload_hint": hint,
    }


def _requirements_from_sources(
    db: Session,
    mandatory_sources: list[SupportSource],
    optional_sources: list[SupportSource] | None = None,
) -> tuple[list[dict[str, str | bool | None]], bool]:
    requirements = [
        _requirement_entry(db, source, required=True) for source in mandatory_sources
    ]
    for source in optional_sources or []:
        requirements.append(_requirement_entry(db, source, required=False))
    ready = all(req["uploaded"] for req in requirements if req.get("required", True))
    return requirements, ready


def _resolve_mandatory_support_docs(
    db: Session,
    mandatory_sources: list[SupportSource],
) -> list[ResolvedSupportDoc]:
    missing: list[str] = []
    resolved: list[ResolvedSupportDoc] = []
    for entity_type, entity_id, doc_type, label in mandatory_sources:
        uploaded, _ = _upload_status(
            db,
            entity_type=entity_type,
            entity_id=entity_id,
            doc_type=doc_type,
        )
        if not uploaded:
            missing.append(label)
            continue
        try:
            resolved.append(
                _resolve_upload(
                    db,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    doc_type=doc_type,
                    label=label,
                )
            )
        except FileNotFoundError:
            missing.append(label)
    if missing:
        raise FileNotFoundError(
            f"Dokumen wajib belum lengkap: {', '.join(missing)}. {_PENDING_SUPPORT_HINT}"
        )
    resolved.sort(key=lambda doc: _ATTACH_ORDER.get(doc.doc_type, 9))
    return resolved


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


def resolve_support_docs_for_do(db: Session, no_do: str) -> list[ResolvedSupportDoc]:
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
        return _resolve_mandatory_support_docs(
            db,
            _payung_ba_mandatory_sources(no_ba, no_invoice),
        )

    return _resolve_mandatory_support_docs(
        db,
        _standar_mandatory_sources(kontrak.no_kontrak, no_invoice),
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
        if upload.storage_path:
            try:
                get_file_path(upload.storage_path)
                return True, upload.file_name
            except StorageError:
                pass
        try:
            path = _path_from_upload(upload)
            if path.is_file():
                return True, upload.file_name
        except StorageError:
            pass

    for candidate in _doc_type_candidates(entity_type, doc_type):
        scanned = _scan_folder(entity_type, entity_id, candidate)
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

        return _requirements_from_sources(
            db,
            _payung_ba_mandatory_sources(no_ba, no_invoice),
            _kuitansi_optional_sources(no_invoice),
        )

    kontrak_id = kontrak.no_kontrak
    return _requirements_from_sources(
        db,
        _standar_mandatory_sources(kontrak_id, no_invoice),
        _kuitansi_optional_sources(no_invoice),
    )


def resolve_support_docs_from_do(no_do: str) -> list[ResolvedSupportDoc]:
    from database import SessionLocal

    db = SessionLocal()
    try:
        return resolve_support_docs_for_do(db, no_do)
    finally:
        db.close()


def resolve_support_docs_for_pembayaran(db: Session, no_pembayaran: str) -> list[ResolvedSupportDoc]:
    pay = (
        db.query(models.Pembayaran)
        .options(
            joinedload(models.Pembayaran.invoice).joinedload(models.Invoice.kontrak),
            joinedload(models.Pembayaran.invoice).joinedload(models.Invoice.berita_acara),
            joinedload(models.Pembayaran.delivery_order).joinedload(models.DeliveryOrder.berita_acara),
        )
        .filter(models.Pembayaran.no_pembayaran == no_pembayaran)
        .first()
    )
    if not pay:
        raise ValueError(f"Pembayaran tidak ditemukan: {no_pembayaran}")

    invoice = pay.invoice
    if not invoice:
        raise ValueError(f"Invoice tidak ditemukan untuk pembayaran: {no_pembayaran}")

    kontrak = invoice.kontrak
    if not kontrak:
        raise ValueError(f"Kontrak tidak ditemukan untuk pembayaran: {no_pembayaran}")

    no_invoice = invoice.no_invoice
    if not no_invoice:
        raise ValueError(f"Nomor invoice kosong untuk pembayaran: {no_pembayaran}")

    if is_payung_ba(kontrak):
        no_ba = invoice.no_ba
        if pay.delivery_order and pay.delivery_order.no_ba:
            no_ba = pay.delivery_order.no_ba
        if not no_ba and pay.delivery_order and pay.delivery_order.berita_acara:
            no_ba = pay.delivery_order.berita_acara.no_ba
        if not no_ba and invoice.berita_acara:
            no_ba = invoice.berita_acara.no_ba
        if not no_ba:
            raise ValueError(
                f"Pembayaran {no_pembayaran} kontrak payung tanpa nomor BA. "
                "Pastikan invoice terhubung ke Berita Acara."
            )
        return _resolve_mandatory_support_docs(
            db,
            _payung_ba_mandatory_sources(no_ba, no_invoice),
        )

    return _resolve_mandatory_support_docs(
        db,
        _standar_mandatory_sources(kontrak.no_kontrak, no_invoice),
    )


def resolve_support_docs_from_pembayaran(no_pembayaran: str) -> list[ResolvedSupportDoc]:
    from database import SessionLocal

    db = SessionLocal()
    try:
        return resolve_support_docs_for_pembayaran(db, no_pembayaran)
    finally:
        db.close()


def resolve_support_docs_for_invoice(db: Session, no_invoice: str) -> list[ResolvedSupportDoc]:
    invoice = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.kontrak),
            joinedload(models.Invoice.berita_acara),
        )
        .filter(models.Invoice.no_invoice == no_invoice)
        .first()
    )
    if not invoice:
        raise ValueError(f"Invoice tidak ditemukan: {no_invoice}")

    kontrak = invoice.kontrak
    if not kontrak:
        raise ValueError(f"Kontrak tidak ditemukan untuk invoice: {no_invoice}")

    if not invoice.no_invoice:
        raise ValueError(f"Nomor invoice kosong: {no_invoice}")

    if is_payung_ba(kontrak):
        no_ba = invoice.no_ba
        if not no_ba and invoice.berita_acara:
            no_ba = invoice.berita_acara.no_ba
        if not no_ba:
            raise ValueError(
                f"Invoice {no_invoice} kontrak payung tanpa nomor BA. "
                "Pastikan invoice terhubung ke Berita Acara."
            )
        return _resolve_mandatory_support_docs(
            db,
            _payung_ba_mandatory_sources(no_ba, invoice.no_invoice),
        )

    return _resolve_mandatory_support_docs(
        db,
        _standar_mandatory_sources(kontrak.no_kontrak, invoice.no_invoice),
    )


def resolve_support_docs_from_invoice(no_invoice: str) -> list[ResolvedSupportDoc]:
    from database import SessionLocal

    db = SessionLocal()
    try:
        return resolve_support_docs_for_invoice(db, no_invoice)
    finally:
        db.close()


def support_doc_download_manifest(no_invoice: str) -> list[dict]:
    """Manifest unduhan dokumen untuk agent lokal (document_id + meta)."""
    docs = resolve_support_docs_from_invoice(no_invoice)
    out: list[dict] = []
    for doc in docs:
        if not doc.document_id:
            raise FileNotFoundError(
                f"Dokumen {doc.label} tidak punya document_id untuk diunduh agent. "
                "Upload ulang di aplikasi Monitoring Pemasaran."
            )
        out.append(
            {
                "document_id": doc.document_id,
                "label": doc.label,
                "doc_type": doc.doc_type,
                "entity_type": doc.entity_type,
                "entity_id": doc.entity_id,
                "file_name": doc.file_name,
                "download_path": f"/api/documents/download/{doc.document_id}",
            }
        )
    return out


# Alias kompatibilitas skrip lama
def resolve_support_doc_from_invoice(no_invoice: str) -> list[ResolvedSupportDoc]:
    return resolve_support_docs_from_invoice(no_invoice)


def resolve_support_doc_from_do(no_do: str) -> list[ResolvedSupportDoc]:
    return resolve_support_docs_from_do(no_do)


def resolve_support_doc_from_pembayaran(no_pembayaran: str) -> list[ResolvedSupportDoc]:
    return resolve_support_docs_from_pembayaran(no_pembayaran)


def superman_doc_requirements_for_invoice(
    db: Session,
    no_invoice: str,
) -> tuple[list[dict[str, str | bool | None]], bool]:
    invoice = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.kontrak),
            joinedload(models.Invoice.berita_acara),
        )
        .filter(models.Invoice.no_invoice == no_invoice)
        .first()
    )
    if not invoice or not invoice.kontrak:
        return [], False

    kontrak = invoice.kontrak
    requirements: list[dict[str, str | bool | None]] = []

    if not invoice.no_invoice:
        requirements.append(
            {
                "label": "Invoice",
                "entity_type": "invoice",
                "entity_id": "-",
                "doc_type": "invoice",
                "uploaded": False,
                "file_name": None,
                "upload_hint": f"Invoice {no_invoice} tidak valid",
            }
        )
        return requirements, False

    if is_payung_ba(kontrak):
        no_ba = invoice.no_ba
        if not no_ba and invoice.berita_acara:
            no_ba = invoice.berita_acara.no_ba
        if not no_ba:
            requirements.append(
                {
                    "label": "Berita Acara",
                    "entity_type": "ba",
                    "entity_id": "-",
                    "doc_type": "berita_acara",
                    "uploaded": False,
                    "file_name": None,
                    "upload_hint": "Hubungkan invoice ke Berita Acara terlebih dahulu",
                }
            )
            return requirements, False

        return _requirements_from_sources(
            db,
            _payung_ba_mandatory_sources(no_ba, invoice.no_invoice),
            _kuitansi_optional_sources(invoice.no_invoice),
        )

    kontrak_id = kontrak.no_kontrak
    return _requirements_from_sources(
        db,
        _standar_mandatory_sources(kontrak_id, invoice.no_invoice),
        _kuitansi_optional_sources(invoice.no_invoice),
    )


def superman_doc_requirements_for_pembayaran(
    db: Session,
    no_pembayaran: str,
) -> tuple[list[dict[str, str | bool | None]], bool]:
    pay = (
        db.query(models.Pembayaran)
        .options(
            joinedload(models.Pembayaran.invoice).joinedload(models.Invoice.kontrak),
            joinedload(models.Pembayaran.invoice).joinedload(models.Invoice.berita_acara),
            joinedload(models.Pembayaran.delivery_order).joinedload(models.DeliveryOrder.berita_acara),
        )
        .filter(models.Pembayaran.no_pembayaran == no_pembayaran)
        .first()
    )
    if not pay or not pay.invoice or not pay.invoice.kontrak:
        return [], False

    kontrak = pay.invoice.kontrak
    no_invoice = pay.invoice.no_invoice
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
                "upload_hint": f"Pembayaran {no_pembayaran} belum terhubung ke invoice",
            }
        )
        return requirements, False

    if is_payung_ba(kontrak):
        no_ba = pay.invoice.no_ba
        if pay.delivery_order and pay.delivery_order.no_ba:
            no_ba = pay.delivery_order.no_ba
        if not no_ba and pay.delivery_order and pay.delivery_order.berita_acara:
            no_ba = pay.delivery_order.berita_acara.no_ba
        if not no_ba and pay.invoice.berita_acara:
            no_ba = pay.invoice.berita_acara.no_ba
        if not no_ba:
            requirements.append(
                {
                    "label": "Berita Acara",
                    "entity_type": "ba",
                    "entity_id": "-",
                    "doc_type": "berita_acara",
                    "uploaded": False,
                    "file_name": None,
                    "upload_hint": "Hubungkan invoice ke Berita Acara terlebih dahulu",
                }
            )
            return requirements, False

        return _requirements_from_sources(
            db,
            _payung_ba_mandatory_sources(no_ba, no_invoice),
            _kuitansi_optional_sources(no_invoice),
        )

    kontrak_id = kontrak.no_kontrak
    return _requirements_from_sources(
        db,
        _standar_mandatory_sources(kontrak_id, no_invoice),
        _kuitansi_optional_sources(no_invoice),
    )


# --- Bundle upload Superman SPPb: field terpisah untuk Kontrak Perjanjian,
# Invoice/Nota Pembayaran, E-Faktur (opsional) + satu PDF gabungan untuk
# "Upload Dokumen Pendukung" (kontrak, invoice, DO, rekening koran, faktur,
# BA serah terima barang), agar tinggal 1x upload/download. ---

_MERGE_ORDER = {
    "kontrak": 0,
    "invoice": 1,
    "do": 2,
    "rekening_koran": 3,
    "faktur_pajak": 4,
    "berita_acara": 5,
    "ba_panen": 5,
}


def build_merged_support_pdf(docs: list[ResolvedSupportDoc]) -> Path:
    """Gabungkan semua dokumen pendukung (PDF) jadi satu file untuk field
    'Upload Dokumen Pendukung' Superman, urut sesuai _MERGE_ORDER."""
    from pypdf import PdfWriter

    ordered = sorted(docs, key=lambda d: _MERGE_ORDER.get(d.doc_type, 9))
    pdf_paths = [d.path for d in ordered if d.path.suffix.lower() == ".pdf"]
    if not pdf_paths:
        raise FileNotFoundError("Tidak ada dokumen PDF untuk digabung ke Dokumen Pendukung.")

    tmp_dir = Path(tempfile.mkdtemp(prefix="superman_merge_"))
    out_path = tmp_dir / "dokumen_pendukung_gabungan.pdf"
    writer = PdfWriter()
    try:
        for path in pdf_paths:
            writer.append(str(path))
        with open(out_path, "wb") as fh:
            writer.write(fh)
    finally:
        writer.close()
    return out_path


@dataclass
class SupermanUploadBundle:
    all_docs: list[ResolvedSupportDoc]
    merged_path: Path
    kontrak_doc: ResolvedSupportDoc | None
    invoice_doc: ResolvedSupportDoc | None
    efaktur_doc: ResolvedSupportDoc | None

    def extra_single_docs(self) -> dict[str, Path]:
        """Path per field tunggal SPPb (Kontrak Perjanjian, Invoice/Nota, E-Faktur)."""
        out: dict[str, Path] = {}
        if self.kontrak_doc:
            out["kontrak_perjanjian"] = self.kontrak_doc.path
        if self.invoice_doc:
            out["invoice_nota"] = self.invoice_doc.path
        if self.efaktur_doc:
            out["efaktur"] = self.efaktur_doc.path
        return out


def resolve_superman_upload_bundle_for_invoice(db: Session, no_invoice: str) -> SupermanUploadBundle:
    invoice = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.kontrak),
            joinedload(models.Invoice.berita_acara),
            joinedload(models.Invoice.delivery_orders),
        )
        .filter(models.Invoice.no_invoice == no_invoice)
        .first()
    )
    if not invoice:
        raise ValueError(f"Invoice tidak ditemukan: {no_invoice}")

    kontrak = invoice.kontrak
    if not kontrak:
        raise ValueError(f"Kontrak tidak ditemukan untuk invoice: {no_invoice}")

    if is_payung_ba(kontrak):
        no_ba = invoice.no_ba
        if not no_ba and invoice.berita_acara:
            no_ba = invoice.berita_acara.no_ba
        if not no_ba:
            raise ValueError(
                f"Invoice {no_invoice} kontrak payung tanpa nomor BA. "
                "Pastikan invoice terhubung ke Berita Acara."
            )
        mandatory_sources = _payung_ba_mandatory_sources(no_ba, no_invoice)
    else:
        mandatory_sources = _standar_mandatory_sources(kontrak.no_kontrak, no_invoice)

    mandatory_docs = _resolve_mandatory_support_docs(db, mandatory_sources)

    optional_sources = [
        *_faktur_pajak_optional_sources(no_invoice),
        *_do_optional_sources(list(invoice.delivery_orders or [])),
    ]
    optional_docs = _resolve_optional_docs(db, optional_sources)

    all_docs = mandatory_docs + optional_docs
    merged_path = build_merged_support_pdf(all_docs)

    kontrak_doc = next((d for d in mandatory_docs if d.doc_type == "kontrak"), None)
    invoice_doc = next((d for d in mandatory_docs if d.doc_type == "invoice"), None)
    efaktur_doc = next((d for d in optional_docs if d.doc_type == "faktur_pajak"), None)

    return SupermanUploadBundle(
        all_docs=all_docs,
        merged_path=merged_path,
        kontrak_doc=kontrak_doc,
        invoice_doc=invoice_doc,
        efaktur_doc=efaktur_doc,
    )


def resolve_superman_upload_bundle_from_invoice(no_invoice: str) -> SupermanUploadBundle:
    from database import SessionLocal

    db = SessionLocal()
    try:
        return resolve_superman_upload_bundle_for_invoice(db, no_invoice)
    finally:
        db.close()
