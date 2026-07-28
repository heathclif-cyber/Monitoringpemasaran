"""Tantangan captcha Superman — jalur HTTP (httpx) agar andal di Railway.

Playwright page.goto sering hang/timeout ke portal; GET login + gambar captcha
via httpx dari Railway biasanya <1 detik (terbukti probe production).
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
from typing import Any, Literal
from urllib.parse import urljoin, urlparse

import httpx

from services.superman.config import SupermanConfig

logger = logging.getLogger("superman.captcha")

TTL_SECONDS = 300
LoginFailureKind = Literal["captcha", "credentials", "lockout", "unknown"]

_TOKEN_RE = re.compile(
    r'name=["\']_token["\']\s+value=["\']([^"\']+)["\']',
    re.I,
)
_CAPTCHA_IMG_RE = re.compile(
    r'src=["\']([^"\']*captcha[^"\']*)["\']',
    re.I,
)


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


def _cleanup_expired() -> None:
    now = time.time()
    with _lock:
        expired = [key for key, entry in _store.items() if now - entry.created_at > TTL_SECONDS]
    for key in expired:
        _dispose(key)


def _dispose_all() -> None:
    with _lock:
        ids = list(_store.keys())
    for challenge_id in ids:
        _dispose(challenge_id)


def _get_entry(challenge_id: str) -> PendingCaptcha:
    _cleanup_expired()
    with _lock:
        entry = _store.get(challenge_id)
    if not entry:
        raise ValueError("Tantangan captcha kedaluwarsa. Muat ulang captcha.")
    if time.time() - entry.created_at > TTL_SECONDS:
        _dispose(challenge_id)
        raise ValueError("Tantangan captcha kedaluwarsa. Muat ulang captcha.")
    return entry


def _image_payload(body: bytes, challenge_id: str) -> dict[str, Any]:
    return {
        "challenge_id": challenge_id,
        "image_base64": base64.b64encode(body).decode("ascii"),
        "mime_type": "image/png",
    }


def _client(cookies: dict[str, str] | None = None) -> httpx.Client:
    return httpx.Client(
        timeout=httpx.Timeout(40.0, connect=15.0),
        follow_redirects=True,
        cookies=cookies or {},
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )


def _cookie_dict(client: httpx.Client) -> dict[str, str]:
    return {k: v for k, v in client.cookies.items()}


def _extract_token(html: str) -> str:
    m = _TOKEN_RE.search(html or "")
    return m.group(1) if m else ""


def _extract_captcha_src(html: str, base_url: str) -> str:
    m = _CAPTCHA_IMG_RE.search(html or "")
    if not m:
        return ""
    src = m.group(1).strip()
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("http"):
        return src
    return urljoin(base_url.rstrip("/") + "/", src.lstrip("/"))


def _fetch_image(client: httpx.Client, src: str) -> bytes:
    if not src:
        raise RuntimeError("URL gambar captcha tidak ditemukan di halaman login.")
    resp = client.get(src)
    if resp.status_code >= 400 or not resp.content:
        raise RuntimeError(
            f"Gagal mengunduh gambar captcha (HTTP {resp.status_code})."
        )
    return resp.content


def _looks_like_login_html(html: str) -> bool:
    low = (html or "").lower()
    return "signin-username" in low or 'name="username"' in low or "id=\"captcha\"" in low


def _classify_login_failure_html(html: str) -> tuple[LoginFailureKind, str]:
    body_text = re.sub(r"<[^>]+>", " ", html or "")
    combined = body_text.lower()

    # Ambil alert kasar
    alerts = re.findall(
        r'class="[^"]*(?:alert-danger|text-danger)[^"]*"[^>]*>(.*?)</',
        html or "",
        re.I | re.S,
    )
    page_error = " ".join(re.sub(r"\s+", " ", a).strip() for a in alerts if a.strip())[:300]

    if "gagal login lebih dari" in combined or "coba lagi dalam" in combined:
        return "lockout", (
            page_error
            or "Akun Superman terkunci sementara karena terlalu banyak percobaan gagal. Tunggu beberapa menit."
        )

    if any(word in combined for word in ("password", "username", "user", "kata sandi")) and (
        "salah" in combined or "tidak sesuai" in combined or "invalid" in combined
    ):
        return (
            "credentials",
            page_error
            or "Username atau password Superman salah. Periksa SUPERMAN_USER dan SUPERMAN_PASSWORD di Railway.",
        )

    if "captcha" in combined and ("salah" in combined or "verifikasi" in combined or "tidak sesuai" in combined):
        return "captcha", page_error or "Captcha salah. Selesaikan hitungan pada gambar lalu coba lagi."

    if page_error:
        if "captcha" in page_error.lower():
            return "captcha", page_error
        return "unknown", page_error

    return "captcha", "Login gagal. Pastikan jawaban captcha adalah hasil hitungan (angka saja)."


def _save_cookies_storage_state(
    cookies: dict[str, str],
    *,
    base_url: str,
    state_path: Path,
    client: httpx.Client | None = None,
) -> None:
    """Tulis cookies httpx ke format Playwright storage_state."""
    host = urlparse(base_url).hostname or "superman.ptpn1.co.id"
    cookie_list: list[dict[str, Any]] = []

    # Prefer jar metadata if available
    if client is not None:
        try:
            for cookie in client.cookies.jar:
                cookie_list.append(
                    {
                        "name": cookie.name,
                        "value": cookie.value,
                        "domain": (cookie.domain or host).lstrip("."),
                        "path": cookie.path or "/",
                        "expires": float(cookie.expires) if cookie.expires else -1,
                        "httpOnly": True,
                        "secure": bool(cookie.secure),
                        "sameSite": "Lax",
                    }
                )
        except Exception:
            cookie_list = []

    if not cookie_list:
        for name, value in cookies.items():
            cookie_list.append(
                {
                    "name": name,
                    "value": value,
                    "domain": host,
                    "path": "/",
                    "expires": -1,
                    "httpOnly": name.lower() in {"laravel_session", "xsrf-token"},
                    "secure": True,
                    "sameSite": "Lax",
                }
            )

    state = {"cookies": cookie_list, "origins": []}
    state_path = Path(state_path)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        dir=state_path.parent,
        prefix=f".{state_path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(state, fh, ensure_ascii=False)
        os.replace(tmp_name, state_path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def start_captcha_challenge(cfg: SupermanConfig) -> dict[str, Any]:
    if not cfg.username or not cfg.password:
        raise RuntimeError("Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment.")

    _cleanup_expired()
    _dispose_all()

    base = cfg.base_url.rstrip("/")
    try:
        with _client() as client:
            resp = client.get(base + "/")
            if resp.status_code >= 400:
                raise RuntimeError(
                    f"Portal Superman merespons HTTP {resp.status_code} saat buka login."
                )
            html = resp.text or ""
            token = _extract_token(html)
            captcha_src = _extract_captcha_src(html, base)
            if not token:
                raise RuntimeError(
                    "CSRF token login Superman tidak ditemukan. Halaman login mungkin berubah."
                )
            if not captcha_src:
                raise RuntimeError(
                    "Gambar captcha tidak ditemukan di halaman login Superman."
                )
            body = _fetch_image(client, captcha_src)
            cookies = _cookie_dict(client)
    except httpx.TimeoutException as exc:
        raise RuntimeError(
            "Timeout menghubungi portal Superman dari Railway. Coba lagi sebentar."
        ) from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Gagal menghubungi portal Superman: {exc}") from exc

    challenge_id = str(uuid.uuid4())
    with _lock:
        _store[challenge_id] = PendingCaptcha(
            cfg=cfg,
            created_at=time.time(),
            cookies=cookies,
            token=token,
            captcha_src=captcha_src,
            base_url=base,
        )
    logger.info("captcha challenge siap id=%s (httpx)", challenge_id[:8])
    return _image_payload(body, challenge_id)


def refresh_captcha_challenge(challenge_id: str) -> dict[str, Any]:
    entry = _get_entry(challenge_id)
    base = entry.base_url or entry.cfg.base_url.rstrip("/")
    try:
        with _client(entry.cookies) as client:
            # Endpoint reload resmi dari halaman login
            reload_url = base + "/reloadcaptcha"
            resp = client.get(
                reload_url,
                headers={
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Referer": base + "/",
                },
            )
            captcha_src = entry.captcha_src
            if resp.status_code < 400:
                try:
                    data = resp.json()
                    html_snip = str(data.get("captcha") or data.get("html") or "")
                    found = _extract_captcha_src(html_snip, base)
                    if found:
                        captcha_src = found
                except Exception:
                    # Kadang HTML mentah
                    found = _extract_captcha_src(resp.text or "", base)
                    if found:
                        captcha_src = found
            if not captcha_src:
                # Fallback: reload full login page
                page = client.get(base + "/")
                captcha_src = _extract_captcha_src(page.text or "", base)
                token = _extract_token(page.text or "")
                if token:
                    entry.token = token
            body = _fetch_image(client, captcha_src)
            entry.cookies = _cookie_dict(client)
            entry.captcha_src = captcha_src
            entry.created_at = time.time()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Gagal refresh captcha: {exc}") from exc

    return _image_payload(body, challenge_id)


def verify_captcha_challenge(challenge_id: str, answer: str) -> dict[str, Any]:
    entry = _get_entry(challenge_id)
    cfg = entry.cfg
    base = entry.base_url or cfg.base_url.rstrip("/")
    answer = (answer or "").strip()
    if not answer:
        raise ValueError("Jawaban captcha kosong.")

    try:
        with _client(entry.cookies) as client:
            # Pastikan token segar
            login_page = client.get(base + "/")
            token = _extract_token(login_page.text or "") or entry.token
            captcha_src = _extract_captcha_src(login_page.text or "", base) or entry.captcha_src
            entry.token = token
            entry.captcha_src = captcha_src
            entry.cookies = _cookie_dict(client)

            headers = {
                "Referer": base + "/",
                "Origin": base,
            }
            # Laravel kadang cek X-XSRF-TOKEN dari cookie
            xsrf = client.cookies.get("XSRF-TOKEN")
            if xsrf:
                try:
                    from urllib.parse import unquote

                    headers["X-XSRF-TOKEN"] = unquote(xsrf)
                except Exception:
                    headers["X-XSRF-TOKEN"] = xsrf

            resp = client.post(
                base + "/user/login",
                data={
                    "_token": token,
                    "username": cfg.username,
                    "password": cfg.password,
                    "captcha": answer,
                },
                headers=headers,
            )
            html = resp.text or ""
            cookies = _cookie_dict(client)

            # Sukses: bukan halaman login lagi
            if not _looks_like_login_html(html) and resp.status_code < 400:
                # Validasi ringan: buka sppd
                check = client.get(base + "/sppd")
                check_html = check.text or ""
                if not _looks_like_login_html(check_html):
                    _save_cookies_storage_state(
                        cookies,
                        base_url=base,
                        state_path=Path(cfg.state_path),
                        client=client,
                    )
                    _dispose(challenge_id)
                    logger.info("login Superman OK via httpx captcha")
                    return {"ok": True, "session_valid": True}

            kind, message = _classify_login_failure_html(html)
            entry.cookies = cookies
            entry.created_at = time.time()

            if kind in ("credentials", "lockout"):
                # Ambil captcha baru untuk ditampilkan ulang
                try:
                    body = _fetch_image(
                        client,
                        _extract_captcha_src(html, base) or captcha_src,
                    )
                    img = _image_payload(body, challenge_id)
                except Exception:
                    img = refresh_captcha_challenge(challenge_id)
                return {
                    "ok": False,
                    "error": message,
                    "failure_kind": kind,
                    "challenge_id": challenge_id,
                    "credential_hint": {
                        "username": cfg.username,
                        "password_length": len(cfg.password),
                    },
                    **img,
                }

            # captcha salah / unknown → refresh gambar
            body_payload = refresh_captcha_challenge(challenge_id)
            return {
                "ok": False,
                "error": message,
                "failure_kind": kind,
                **body_payload,
            }
    except httpx.TimeoutException as exc:
        raise RuntimeError(
            "Timeout saat login Superman dari Railway. Coba captcha lagi."
        ) from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Gagal login Superman: {exc}") from exc
