"""Captcha login ringan untuk menyiapkan sesi Chromium Superman di Railway.

HTTP dipakai hanya pada tahap login/captcha. Setelah login berhasil, cookie
ditulis ke storage state dan seluruh deklarasi tetap dijalankan Chromium
Playwright di Railway.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.parse import unquote, urljoin, urlparse

import httpx

from services.superman.config import SupermanConfig

logger = logging.getLogger("superman.captcha")
TTL_SECONDS = 300
_TOKEN_RE = re.compile(r'name=["\']_token["\']\s+value=["\']([^"\']+)["\']', re.I)
_CAPTCHA_RE = re.compile(r'src=["\']([^"\']*captcha[^"\']*)["\']', re.I)


@dataclass
class PendingCaptcha:
    cfg: SupermanConfig
    created_at: float
    cookies: dict[str, str] = field(default_factory=dict)
    token: str = ""
    captcha_src: str = ""
    base_url: str = ""


_store: dict[str, PendingCaptcha] = {}
_lock = Lock()


def _dispose(challenge_id: str) -> None:
    with _lock:
        _store.pop(challenge_id, None)


def _cleanup() -> None:
    now = time.time()
    with _lock:
        expired = [key for key, value in _store.items() if now - value.created_at > TTL_SECONDS]
    for key in expired:
        _dispose(key)


def _entry(challenge_id: str) -> PendingCaptcha:
    _cleanup()
    with _lock:
        value = _store.get(challenge_id)
    if not value:
        raise ValueError("Tantangan captcha kedaluwarsa. Muat ulang captcha.")
    return value


def _client(cookies: dict[str, str] | None = None) -> httpx.Client:
    # Connect pendek: kalau Railway diblokir, gagal cepat (jangan loading 50–80s).
    return httpx.Client(
        http2=False,
        follow_redirects=True,
        timeout=httpx.Timeout(20.0, connect=8.0),
        cookies=cookies or {},
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )


def _token(html: str) -> str:
    match = _TOKEN_RE.search(html or "")
    return match.group(1) if match else ""


def _captcha_src(html: str, base_url: str) -> str:
    match = _CAPTCHA_RE.search(html or "")
    if not match:
        return ""
    src = match.group(1).strip()
    if src.startswith("//"):
        return "https:" + src
    return src if src.startswith("http") else urljoin(base_url + "/", src.lstrip("/"))


def _image(client: httpx.Client, src: str) -> bytes:
    if not src:
        raise RuntimeError("Gambar captcha tidak ditemukan di halaman login Superman.")
    response = client.get(src)
    if response.status_code >= 400 or not response.content:
        raise RuntimeError(f"Gagal mengunduh gambar captcha (HTTP {response.status_code}).")
    return response.content


def _payload(image: bytes, challenge_id: str) -> dict[str, Any]:
    return {"challenge_id": challenge_id, "image_base64": base64.b64encode(image).decode("ascii"), "mime_type": "image/png"}


def _cookies(client: httpx.Client) -> dict[str, str]:
    return {name: value for name, value in client.cookies.items()}


def _load_login(entry: PendingCaptcha) -> bytes:
    base = entry.base_url
    with _client(entry.cookies) as client:
        page = client.get(base + "/")
        if page.status_code >= 400:
            raise RuntimeError(f"Portal Superman merespons HTTP {page.status_code} saat membuka login.")
        entry.token = _token(page.text)
        entry.captcha_src = _captcha_src(page.text, base)
        if not entry.token or not entry.captcha_src:
            raise RuntimeError("Form login atau captcha Superman tidak dapat dibaca.")
        image = _image(client, entry.captcha_src)
        entry.cookies = _cookies(client)
        entry.created_at = time.time()
        return image


def start_captcha_challenge(cfg: SupermanConfig) -> dict[str, Any]:
    if not cfg.username or not cfg.password:
        raise RuntimeError("Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment.")
    _cleanup()
    entry = PendingCaptcha(cfg=cfg, created_at=time.time(), base_url=cfg.base_url.rstrip("/"))
    last_error: Exception | None = None
    # 2 percobaan singkat saja — ConnectTimeout berulang tidak membantu user.
    for attempt in range(1, 3):
        try:
            image = _load_login(entry)
            challenge_id = str(uuid.uuid4())
            with _lock:
                _store.clear()
                _store[challenge_id] = entry
            logger.info("captcha challenge siap id=%s (httpx session)", challenge_id[:8])
            return _payload(image, challenge_id)
        except (httpx.HTTPError, RuntimeError) as exc:
            last_error = exc
            logger.warning(
                "captcha HTTP attempt %s gagal: %s: %s",
                attempt,
                type(exc).__name__,
                exc,
            )
            time.sleep(0.8 * attempt)
    detail = f"{type(last_error).__name__}: {last_error}" if last_error else "unknown"
    msg = (
        "Captcha tidak bisa dimuat dari server Railway "
        f"(portal {entry.base_url}). Detail: {detail[:200]}. "
        "Jaringan datacenter Railway ke Superman putus (ConnectTimeout) — "
        "bukan bug form. Solusi: jalankan agent di PC "
        "`python scripts/superman/commands/agent.py watch --api <URL> --username ...` "
        "lalu klik Buat Deklarasi lagi (captcha diisi di PC, bukan di Railway)."
    )
    try:
        from services.superman.error_log import log_superman_error

        log_superman_error(
            source="captcha_start",
            message=msg,
            kind="captcha_network_timeout",
            context={
                "base_url": entry.base_url,
                "last_error_type": type(last_error).__name__ if last_error else None,
                "last_error": str(last_error)[:500] if last_error else None,
                "attempts": 2,
            },
        )
    except Exception:
        pass
    raise RuntimeError(msg) from last_error


def refresh_captcha_challenge(challenge_id: str) -> dict[str, Any]:
    entry = _entry(challenge_id)
    try:
        return _payload(_load_login(entry), challenge_id)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Gagal refresh captcha Superman: {exc}") from exc


def _is_login_html(html: str) -> bool:
    body = (html or "").lower()
    return "signin-username" in body or 'name="username"' in body or 'id="captcha"' in body


def _save_state(client: httpx.Client, base_url: str, state_path: str) -> None:
    host = urlparse(base_url).hostname or "superman.ptpn1.co.id"
    state = {"cookies": [{"name": key, "value": value, "domain": host, "path": "/", "expires": -1, "httpOnly": True, "secure": True, "sameSite": "Lax"} for key, value in _cookies(client).items()], "origins": []}
    path = Path(state_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            json.dump(state, file)
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def verify_captcha_challenge(challenge_id: str, answer: str) -> dict[str, Any]:
    entry = _entry(challenge_id)
    if not answer.strip():
        raise ValueError("Jawaban captcha kosong.")
    base = entry.base_url
    try:
        with _client(entry.cookies) as client:
            headers = {"Referer": base + "/", "Origin": base}
            xsrf = client.cookies.get("XSRF-TOKEN")
            if xsrf:
                headers["X-XSRF-TOKEN"] = unquote(xsrf)
            response = client.post(base + "/user/login", data={"_token": entry.token, "username": entry.cfg.username, "password": entry.cfg.password, "captcha": answer.strip()}, headers=headers)
            if response.status_code < 400 and not _is_login_html(response.text):
                check = client.get(base + "/sppd")
                if check.status_code < 400 and not _is_login_html(check.text):
                    _save_state(client, base, entry.cfg.state_path)
                    _dispose(challenge_id)
                    logger.info("login Superman OK; sesi siap untuk Chromium")
                    return {"ok": True, "session_valid": True}
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Gagal login Superman: {exc}") from exc

    image = _load_login(entry)
    return {"ok": False, "error": "Captcha salah atau login belum diterima. Coba gambar baru.", "failure_kind": "captcha", **_payload(image, challenge_id)}
