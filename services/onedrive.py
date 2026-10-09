"""OneDrive kantor (Microsoft 365) — salinan dokumen upload + link share untuk WA pajak.

Penyimpanan utama tetap lokal (services/local_storage.py); OneDrive hanya mirror.
Login admin via device code flow (microsoft.com/devicelogin) dengan akun kantor;
Client ID, tenant, dan refresh token disimpan di tabel kv_store — tanpa .env.
"""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

import models
from services.local_storage import DOC_TYPE_SUBFOLDERS

logger = logging.getLogger(__name__)

GRAPH = "https://graph.microsoft.com/v1.0"
SCOPE = "offline_access Files.ReadWrite User.Read"
ROOT_FOLDER = os.getenv("ONEDRIVE_ROOT_FOLDER", "Monitoring Pemasaran")
SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024  # Graph: > 4 MB wajib upload session

KV_CLIENT_ID = "onedrive_client_id"
KV_TENANT = "onedrive_tenant"
KV_REFRESH = "onedrive_refresh_token"
KV_ACCOUNT = "onedrive_account"

# State proses (uvicorn 1 worker): device login yang sedang berjalan + cache access token
_device: dict[str, Any] = {}
_token: dict[str, Any] = {}


class OneDriveError(Exception):
    pass


# --- kv_store ---

def _kv_get(db: Session, key: str) -> str | None:
    row = db.query(models.KvStore).filter(models.KvStore.key == key).first()
    return row.value if row else None


def _kv_set(db: Session, key: str, value: str) -> None:
    row = db.query(models.KvStore).filter(models.KvStore.key == key).first()
    if row:
        row.value = value
    else:
        db.add(models.KvStore(key=key, value=value))
    db.commit()


def _kv_delete(db: Session, key: str) -> None:
    db.query(models.KvStore).filter(models.KvStore.key == key).delete()
    db.commit()


def _authority(db: Session) -> str:
    tenant = _kv_get(db, KV_TENANT) or "organizations"
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0"


def is_connected(db: Session) -> bool:
    return bool(_kv_get(db, KV_CLIENT_ID) and _kv_get(db, KV_REFRESH))


def status(db: Session) -> dict[str, Any]:
    return {
        "connected": is_connected(db),
        "account": _kv_get(db, KV_ACCOUNT),
        "client_id": _kv_get(db, KV_CLIENT_ID),
        "tenant": _kv_get(db, KV_TENANT),
        "login_pending": bool(_device) and _device.get("expires_at", 0) > time.time(),
    }


# --- Login (device code flow) ---

def start_login(db: Session, client_id: str, tenant: str) -> dict[str, Any]:
    client_id = client_id.strip()
    tenant = (tenant or "").strip() or "organizations"
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", client_id):
        raise OneDriveError("Client ID tidak valid (format GUID)")
    _kv_set(db, KV_CLIENT_ID, client_id)
    _kv_set(db, KV_TENANT, tenant)
    res = httpx.post(
        f"{_authority(db)}/devicecode",
        data={"client_id": client_id, "scope": SCOPE},
        timeout=30,
    )
    if res.status_code != 200:
        logger.error("OneDrive devicecode error: %s", res.text[:500])
        raise OneDriveError(_aad_error(res, "Gagal memulai login Microsoft"))
    data = res.json()
    _device.clear()
    _device.update(
        device_code=data["device_code"],
        interval=int(data.get("interval", 5)),
        expires_at=time.time() + int(data.get("expires_in", 900)),
    )
    return {
        "user_code": data["user_code"],
        "verification_uri": data["verification_uri"],
        "expires_in": int(data.get("expires_in", 900)),
    }


def poll_login(db: Session) -> dict[str, Any]:
    """Cek sekali apakah admin sudah menyelesaikan login di microsoft.com/devicelogin."""
    if not _device or _device.get("expires_at", 0) < time.time():
        _device.clear()
        return {"state": "expired"}
    res = httpx.post(
        f"{_authority(db)}/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "client_id": _kv_get(db, KV_CLIENT_ID),
            "device_code": _device["device_code"],
        },
        timeout=30,
    )
    data = res.json()
    if res.status_code != 200:
        err = data.get("error")
        if err in ("authorization_pending", "slow_down"):
            return {"state": "pending"}
        _device.clear()
        logger.error("OneDrive device token error: %s", str(data)[:500])
        return {"state": "error", "message": data.get("error_description", err or "Login gagal")[:300]}
    _device.clear()
    _save_tokens(db, data)
    me = _graph(db, "GET", "/me").json()
    _kv_set(db, KV_ACCOUNT, me.get("userPrincipalName") or me.get("mail") or "")
    return {"state": "connected", "account": _kv_get(db, KV_ACCOUNT)}


def disconnect(db: Session) -> None:
    for key in (KV_REFRESH, KV_ACCOUNT):
        _kv_delete(db, key)
    _token.clear()


def _aad_error(res: httpx.Response, fallback: str) -> str:
    try:
        return res.json().get("error_description", fallback)[:300]
    except Exception:
        return fallback


def _save_tokens(db: Session, data: dict[str, Any]) -> None:
    _token.update(access=data["access_token"], expires_at=time.time() + int(data.get("expires_in", 3600)) - 120)
    if data.get("refresh_token"):
        _kv_set(db, KV_REFRESH, data["refresh_token"])


def _access_token(db: Session) -> str:
    if _token.get("access") and _token.get("expires_at", 0) > time.time():
        return _token["access"]
    refresh = _kv_get(db, KV_REFRESH)
    client_id = _kv_get(db, KV_CLIENT_ID)
    if not (refresh and client_id):
        raise OneDriveError("OneDrive belum terhubung")
    res = httpx.post(
        f"{_authority(db)}/token",
        data={"grant_type": "refresh_token", "client_id": client_id, "refresh_token": refresh, "scope": SCOPE},
        timeout=30,
    )
    if res.status_code != 200:
        logger.error("OneDrive refresh error: %s", res.text[:500])
        raise OneDriveError("Sesi OneDrive kedaluwarsa — hubungkan ulang dari menu Manajemen User")
    _save_tokens(db, res.json())
    return _token["access"]


def _graph(db: Session, method: str, path: str, **kwargs) -> httpx.Response:
    headers = {"Authorization": f"Bearer {_access_token(db)}", **kwargs.pop("headers", {})}
    res = httpx.request(method, f"{GRAPH}{path}", headers=headers, timeout=120, **kwargs)
    if res.status_code >= 400:
        logger.error("Graph %s %s → %s %s", method, path, res.status_code, res.text[:500])
    return res


# --- Upload + share link ---

def _safe(value: str) -> str:
    return re.sub(r'[<>:"/\\|?*#%]', "-", value.strip()) or "unknown"


def remote_path(entity_type: str, entity_id: str, doc_type: str, file_name: str) -> str:
    sub = DOC_TYPE_SUBFOLDERS.get(doc_type, "Lainnya")
    if entity_type == "ba" and doc_type == "berita_acara":
        sub = "BA-Payung"
    return f"{ROOT_FOLDER}/{sub}/{_safe(entity_id)}/{_safe(file_name)}"


def upload(db: Session, path: str, content: bytes) -> str:
    """Upload/overwrite file ke OneDrive; return drive item id."""
    encoded = quote(path, safe="/")
    if len(content) <= SIMPLE_UPLOAD_MAX:
        res = _graph(
            db, "PUT", f"/me/drive/root:/{encoded}:/content",
            content=content, headers={"Content-Type": "application/octet-stream"},
        )
        if res.status_code >= 400:
            raise OneDriveError(f"Upload OneDrive gagal ({res.status_code})")
        return res.json()["id"]

    res = _graph(
        db, "POST", f"/me/drive/root:/{encoded}:/createUploadSession",
        json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
    )
    if res.status_code >= 400:
        raise OneDriveError(f"Upload OneDrive gagal ({res.status_code})")
    upload_url = res.json()["uploadUrl"]
    # URL sesi sudah pre-authenticated — jangan kirim header Authorization
    chunk = 10 * 320 * 1024
    total = len(content)
    item: dict[str, Any] = {}
    for start in range(0, total, chunk):
        end = min(start + chunk, total) - 1
        r = httpx.put(
            upload_url,
            content=content[start:end + 1],
            headers={"Content-Range": f"bytes {start}-{end}/{total}"},
            timeout=120,
        )
        if r.status_code >= 400:
            logger.error("OneDrive chunk upload error: %s", r.text[:500])
            raise OneDriveError(f"Upload OneDrive gagal ({r.status_code})")
        if r.status_code in (200, 201):
            item = r.json()
    return item["id"]


def create_share_link(db: Session, item_id: str) -> tuple[str, str]:
    """Link view-only. Utamakan 'anyone with the link'; jika dilarang tenant → 'organization'."""
    for scope in ("anonymous", "organization"):
        res = _graph(db, "POST", f"/me/drive/items/{item_id}/createLink", json={"type": "view", "scope": scope})
        if res.status_code in (200, 201):
            return res.json()["link"]["webUrl"], scope
    raise OneDriveError("Gagal membuat link share OneDrive")
