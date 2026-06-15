"""Microsoft Graph / OneDrive — personal (Family) or organizational M365."""

from __future__ import annotations

import logging
import os
import re
from typing import Any
from urllib.parse import quote, urlencode

import httpx

logger = logging.getLogger(__name__)

PERSONAL_TENANT = "consumers"
GRAPH_SCOPE = "offline_access Files.ReadWrite"

MS_TENANT_ID = os.getenv("MS_TENANT_ID", "")
MS_CLIENT_ID = os.getenv("MS_CLIENT_ID", "")
MS_CLIENT_SECRET = os.getenv("MS_CLIENT_SECRET", "")
MS_REFRESH_TOKEN = os.getenv("MS_REFRESH_TOKEN", "")
MS_REDIRECT_URI = os.getenv(
    "MS_REDIRECT_URI",
    "http://localhost:8000/api/documents/oauth/callback",
)
ONEDRIVE_USER_EMAIL = os.getenv("ONEDRIVE_USER_EMAIL", "")
ONEDRIVE_ROOT_FOLDER = os.getenv("ONEDRIVE_ROOT_FOLDER", "Monitoring Pemasaran")

DOC_TYPE_SUBFOLDERS: dict[str, str] = {
    "kontrak": "Kontrak",
    "invoice": "Invoice",
    "kuitansi": "Invoice/Kuitansi",
    "do": "DO",
    "deklarasi": "Deklarasi",
    "berita_acara": "Berita-Acara",
}

ALLOWED_EXTENSIONS = {".docx", ".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls"}
MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB


class OneDriveConfigError(Exception):
    pass


class OneDriveUploadError(Exception):
    pass


def is_personal_mode() -> bool:
    return bool(MS_REFRESH_TOKEN)


def is_onedrive_configured() -> bool:
    if not (MS_CLIENT_ID and MS_CLIENT_SECRET):
        return False
    if MS_REFRESH_TOKEN:
        return True
    return bool(MS_TENANT_ID and ONEDRIVE_USER_EMAIL)


def get_onedrive_mode() -> str | None:
    if not (MS_CLIENT_ID and MS_CLIENT_SECRET):
        return None
    if MS_REFRESH_TOKEN:
        return "personal"
    if MS_TENANT_ID and ONEDRIVE_USER_EMAIL:
        return "organizational"
    return "pending_auth"


def build_authorize_url() -> str:
    if not (MS_CLIENT_ID and MS_CLIENT_SECRET):
        raise OneDriveConfigError("Set MS_CLIENT_ID dan MS_CLIENT_SECRET terlebih dahulu.")
    params = {
        "client_id": MS_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": MS_REDIRECT_URI,
        "scope": GRAPH_SCOPE,
        "response_mode": "query",
    }
    return f"https://login.microsoftonline.com/{PERSONAL_TENANT}/oauth2/v2.0/authorize?{urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    if not (MS_CLIENT_ID and MS_CLIENT_SECRET):
        raise OneDriveConfigError("Set MS_CLIENT_ID dan MS_CLIENT_SECRET terlebih dahulu.")
    url = f"https://login.microsoftonline.com/{PERSONAL_TENANT}/oauth2/v2.0/token"
    data = {
        "client_id": MS_CLIENT_ID,
        "client_secret": MS_CLIENT_SECRET,
        "code": code,
        "redirect_uri": MS_REDIRECT_URI,
        "grant_type": "authorization_code",
        "scope": GRAPH_SCOPE,
    }
    try:
        with httpx.Client(timeout=30) as client:
            res = client.post(url, data=data)
            res.raise_for_status()
            return res.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        logger.error("OAuth code exchange error: %s", detail)
        raise OneDriveUploadError("Gagal menukar authorization code. Cek MS_REDIRECT_URI di Azure.") from exc


def _require_config() -> None:
    if MS_REFRESH_TOKEN:
        missing = [
            name
            for name, val in [
                ("MS_CLIENT_ID", MS_CLIENT_ID),
                ("MS_CLIENT_SECRET", MS_CLIENT_SECRET),
                ("MS_REFRESH_TOKEN", MS_REFRESH_TOKEN),
            ]
            if not val
        ]
    else:
        missing = [
            name
            for name, val in [
                ("MS_TENANT_ID", MS_TENANT_ID),
                ("MS_CLIENT_ID", MS_CLIENT_ID),
                ("MS_CLIENT_SECRET", MS_CLIENT_SECRET),
                ("ONEDRIVE_USER_EMAIL", ONEDRIVE_USER_EMAIL),
            ]
            if not val
        ]
    if missing:
        raise OneDriveConfigError(
            f"OneDrive belum dikonfigurasi. Set environment variable: {', '.join(missing)}"
        )


def _sanitize_segment(value: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]', "-", value.strip())
    return cleaned or "unknown"


def build_remote_folder(entity_type: str, entity_id: str, doc_type: str) -> str:
    sub = DOC_TYPE_SUBFOLDERS.get(doc_type, "Lainnya")
    safe_id = _sanitize_segment(entity_id)
    return f"{ONEDRIVE_ROOT_FOLDER}/{sub}/{safe_id}"


def _token_url() -> str:
    tenant = PERSONAL_TENANT if MS_REFRESH_TOKEN else MS_TENANT_ID
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


def get_access_token() -> str:
    _require_config()
    if MS_REFRESH_TOKEN:
        return _get_token_via_refresh()
    return _get_token_via_client_credentials()


def _get_token_via_refresh() -> str:
    data = {
        "client_id": MS_CLIENT_ID,
        "client_secret": MS_CLIENT_SECRET,
        "refresh_token": MS_REFRESH_TOKEN,
        "grant_type": "refresh_token",
        "scope": GRAPH_SCOPE,
    }
    try:
        with httpx.Client(timeout=30) as client:
            res = client.post(_token_url(), data=data)
            res.raise_for_status()
            payload = res.json()
            return payload["access_token"]
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        logger.error("Graph refresh token error: %s", detail)
        raise OneDriveUploadError(
            "Gagal refresh token Microsoft. Login ulang via /api/documents/oauth/authorize."
        ) from exc
    except Exception as exc:
        logger.error("Graph refresh token error: %s", exc)
        raise OneDriveUploadError("Gagal autentikasi Microsoft Graph") from exc


def _get_token_via_client_credentials() -> str:
    data = {
        "client_id": MS_CLIENT_ID,
        "client_secret": MS_CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }
    try:
        with httpx.Client(timeout=30) as client:
            res = client.post(_token_url(), data=data)
            res.raise_for_status()
            payload = res.json()
            return payload["access_token"]
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        logger.error("Graph token error: %s", detail)
        raise OneDriveUploadError(
            "Gagal autentikasi Microsoft Graph. Pastikan App Registration sudah admin consent."
        ) from exc
    except Exception as exc:
        logger.error("Graph token error: %s", exc)
        raise OneDriveUploadError("Gagal autentikasi Microsoft Graph") from exc


def _drive_upload_url(encoded_path: str) -> str:
    if MS_REFRESH_TOKEN:
        return f"https://graph.microsoft.com/v1.0/me/drive/root:/{encoded_path}:/content"
    return (
        f"https://graph.microsoft.com/v1.0/users/{ONEDRIVE_USER_EMAIL}"
        f"/drive/root:/{encoded_path}:/content"
    )


def upload_bytes(
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
    file_name: str,
    content: bytes,
) -> dict[str, Any]:
    _require_config()

    if len(content) > MAX_FILE_BYTES:
        raise OneDriveUploadError(f"Ukuran file melebihi {MAX_FILE_BYTES // (1024 * 1024)} MB")

    ext = os.path.splitext(file_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise OneDriveUploadError(
            f"Format tidak didukung. Gunakan: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    safe_name = _sanitize_segment(os.path.splitext(file_name)[0]) + ext
    folder = build_remote_folder(entity_type, entity_id, doc_type)
    remote_path = f"{folder}/{safe_name}"
    encoded_path = quote(remote_path, safe="/")

    token = get_access_token()
    url = _drive_upload_url(encoded_path)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream",
    }

    try:
        with httpx.Client(timeout=120) as client:
            res = client.put(url, headers=headers, content=content)
            res.raise_for_status()
            item = res.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        logger.error("OneDrive upload error: %s", detail)
        raise OneDriveUploadError(f"Upload OneDrive gagal: {exc.response.status_code}") from exc
    except Exception as exc:
        logger.error("OneDrive upload error: %s", exc)
        raise OneDriveUploadError("Upload OneDrive gagal") from exc

    return {
        "item_id": item.get("id"),
        "web_url": item.get("webUrl"),
        "file_name": item.get("name") or safe_name,
        "remote_path": remote_path,
    }