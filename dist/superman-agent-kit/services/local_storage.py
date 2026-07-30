"""Local filesystem storage — Railway Volume atau direktori lokal."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))
# Pastikan direktori root upload ada
os.makedirs(UPLOAD_DIR, exist_ok=True)

DOC_TYPE_SUBFOLDERS: dict[str, str] = {
    "kontrak": "Kontrak",
    "invoice": "Invoice",
    "kuitansi": "Invoice/Kuitansi",
    "rekening_koran": "Invoice/Rekening-Koran",
    "do": "DO",
    "deklarasi": "Deklarasi",
    "berita_acara": "Berita-Acara",
}

ALLOWED_EXTENSIONS = {".docx", ".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls"}
MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB


class StorageError(Exception):
    """Error saat operasi penyimpanan file."""

    pass


def is_configured() -> bool:
    """Local storage selalu tersedia."""
    return True


def get_mode() -> str:
    """Local storage mode."""
    return "local"


def _sanitize_segment(value: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]', "-", value.strip())
    return cleaned or "unknown"


def build_folder(entity_type: str, entity_id: str, doc_type: str) -> str:
    """Bangun path folder untuk penyimpanan."""
    sub = DOC_TYPE_SUBFOLDERS.get(doc_type, "Lainnya")
    safe_id = _sanitize_segment(entity_id)
    return os.path.join(UPLOAD_DIR, sub, safe_id)


def _build_web_url(document_id: int) -> str:
    """URL untuk download file via API."""
    return f"/api/documents/download/{document_id}"


def upload_bytes(
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
    file_name: str,
    content: bytes,
) -> dict[str, Any]:
    """Simpan file ke filesystem lokal."""
    if len(content) > MAX_FILE_BYTES:
        raise StorageError(f"Ukuran file melebihi {MAX_FILE_BYTES // (1024 * 1024)} MB")

    ext = os.path.splitext(file_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise StorageError(
            f"Format tidak didukung. Gunakan: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    safe_name = _sanitize_segment(os.path.splitext(file_name)[0]) + ext
    folder = build_folder(entity_type, entity_id, doc_type)
    os.makedirs(folder, exist_ok=True)

    file_path = os.path.join(folder, safe_name)
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info("File disimpan: %s (%d bytes)", file_path, len(content))

    # Simpan path relatif terhadap UPLOAD_DIR agar portabel lintas environment.
    # Normalisasi ke forward-slash agar path konsisten di Windows maupun Linux.
    rel_path = os.path.relpath(file_path, UPLOAD_DIR).replace("\\", "/")

    return {
        "storage_path": rel_path,
        "web_url": "",  # diisi setelah record DB dibuat (butuh ID)
        "file_name": safe_name,
    }


_KNOWN_SUBFOLDERS = tuple(
    sf.split("/")[0] for sf in DOC_TYPE_SUBFOLDERS.values()
) + ("Lainnya",)


def _resolve_storage_path(storage_path: str) -> str:
    """Konversi storage_path (absolut lama atau relatif baru) ke path absolut lokal.

    Path lama disimpan absolut (mis. /data/uploads/Kontrak/...) yang tidak portabel.
    Path baru disimpan relatif terhadap UPLOAD_DIR (mis. Kontrak/...).
    Keduanya di-resolve ke file absolut berdasarkan UPLOAD_DIR saat ini.
    """
    norm = storage_path.replace("\\", "/")

    # Cek apakah path ini relatif (format baru) — langsung join
    # Catatan: di Windows os.path.relpath menghasilkan path dengan backslash,
    # sehingga tidak bisa memakai "\\" not in sebagai indikator absolut.
    if not os.path.isabs(storage_path):
        return os.path.join(UPLOAD_DIR, storage_path)

    # Path absolut lama: ekstrak bagian relatif dari subfolder yang dikenal
    for sf in _KNOWN_SUBFOLDERS:
        marker = f"/{sf}/"
        if marker in norm:
            rel = norm[norm.index(marker) + 1:]   # mis. "Kontrak/entity-id/file.pdf"
            return os.path.join(UPLOAD_DIR, rel)

    # Fallback: gunakan apa adanya
    return storage_path


def get_file_path(storage_path: str) -> str:
    """Dapatkan path file yang tersimpan.

    Coba dua kandidat:
    1. Path yang di-resolve terhadap UPLOAD_DIR saat ini (format baru / relative)
    2. Original path absolut (format lama — upload di environment berbeda)
    """
    real_upload = os.path.normcase(os.path.realpath(UPLOAD_DIR))

    # Kandidat 1: resolve ke UPLOAD_DIR sekarang
    resolved = _resolve_storage_path(storage_path)
    real_resolved = os.path.realpath(resolved)
    if os.path.normcase(real_resolved).startswith(real_upload + os.sep):
        if os.path.isfile(real_resolved):
            return real_resolved

    # Kandidat 2: path absolut asli (mis. /data/uploads/... dari environment lain)
    if os.path.isabs(storage_path):
        real_orig = os.path.realpath(storage_path)
        if os.path.isfile(real_orig):
            return real_orig

    raise StorageError("File tidak ditemukan")


def delete_file(storage_path: str) -> None:
    """Hapus file dari filesystem."""
    try:
        real_path = get_file_path(storage_path)
        os.remove(real_path)
        logger.info("File dihapus: %s", real_path)
    except StorageError:
        raise
    except Exception as exc:
        logger.error("Gagal menghapus file: %s", exc)
        raise StorageError("Gagal menghapus file") from exc
