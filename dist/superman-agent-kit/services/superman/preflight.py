"""Validasi sebelum job deklarasi Superman — gagal cepat dengan pesan jelas."""

from __future__ import annotations

from database import SessionLocal
from services.superman.documents import superman_doc_requirements_for_invoice
from services.superman.payload import build_payload_from_invoice


def validate_deklarasi_ready(no_invoice: str) -> None:
    """Pastikan dokumen lengkap dan invoice lunas sebelum buka browser Superman."""
    ref = no_invoice.strip()
    if not ref:
        raise ValueError("no_invoice wajib diisi")

    db = SessionLocal()
    try:
        requirements, ready = superman_doc_requirements_for_invoice(db, ref)
        if not ready:
            missing: list[str] = []
            for req in requirements:
                if req.get("required", True) and not req.get("uploaded"):
                    hint = str(req.get("upload_hint") or req.get("label") or "dokumen wajib")
                    missing.append(hint)
            detail = "; ".join(missing[:5]) if missing else "dokumen wajib belum lengkap"
            raise ValueError(f"Dokumen pendukung Superman belum lengkap. {detail}")
    finally:
        db.close()

    # Memuat payload sekaligus memvalidasi lunas + relasi invoice/kontrak.
    build_payload_from_invoice(ref)