"""Tantangan captcha Superman — browser tetap hidup sampai user menjawab."""

from __future__ import annotations

import base64
import time
import uuid
from dataclasses import dataclass
from threading import Lock
from typing import Any

from playwright.sync_api import Page, sync_playwright

from services.superman.auth import _is_login_page
from services.superman.config import SupermanConfig

TTL_SECONDS = 300


@dataclass
class PendingCaptcha:
    pw: Any
    browser: Any
    page: Page
    cfg: SupermanConfig
    created_at: float


_store: dict[str, PendingCaptcha] = {}
_lock = Lock()


def _dispose(challenge_id: str) -> None:
    entry = _store.pop(challenge_id, None)
    if not entry:
        return
    try:
        entry.browser.close()
    except Exception:
        pass
    try:
        entry.pw.stop()
    except Exception:
        pass


def _cleanup_expired() -> None:
    now = time.time()
    with _lock:
        expired = [key for key, entry in _store.items() if now - entry.created_at > TTL_SECONDS]
    for key in expired:
        _dispose(key)


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


def _captcha_image(page: Page, cfg: SupermanConfig) -> bytes:
    img_src = page.locator('img[src*="captcha"]').first.get_attribute("src") or ""
    if img_src.startswith("/"):
        img_src = cfg.base_url.rstrip("/") + img_src
    return page.request.get(img_src).body()


def _image_payload(body: bytes, challenge_id: str) -> dict[str, Any]:
    return {
        "challenge_id": challenge_id,
        "image_base64": base64.b64encode(body).decode("ascii"),
        "mime_type": "image/png",
    }


def start_captcha_challenge(cfg: SupermanConfig) -> dict[str, Any]:
    if not cfg.username or not cfg.password:
        raise RuntimeError("Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment.")

    _cleanup_expired()
    pw = sync_playwright().start()
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(cfg.base_url, wait_until="networkidle", timeout=60000)
    page.fill("#signin-username", cfg.username)
    page.fill("#signin-password", cfg.password)
    body = _captcha_image(page, cfg)
    challenge_id = str(uuid.uuid4())
    with _lock:
        _store[challenge_id] = PendingCaptcha(
            pw=pw,
            browser=browser,
            page=page,
            cfg=cfg,
            created_at=time.time(),
        )
    return _image_payload(body, challenge_id)


def refresh_captcha_challenge(challenge_id: str) -> dict[str, Any]:
    entry = _get_entry(challenge_id)
    entry.page.click("#reload")
    entry.page.wait_for_timeout(600)
    body = _captcha_image(entry.page, entry.cfg)
    entry.created_at = time.time()
    return _image_payload(body, challenge_id)


def verify_captcha_challenge(challenge_id: str, answer: str) -> dict[str, Any]:
    entry = _get_entry(challenge_id)
    page = entry.page
    cfg = entry.cfg
    page.fill("#captcha", answer.strip())
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle", timeout=20000)
    page.wait_for_timeout(1200)

    if _is_login_page(page):
        body = refresh_captcha_challenge(challenge_id)
        return {
            "ok": False,
            "error": "Captcha salah. Periksa hitungan matematika lalu coba lagi.",
            **body,
        }

    state_path = cfg.state_path
    from pathlib import Path

    path = Path(state_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    page.context.storage_state(path=str(path))
    _dispose(challenge_id)
    return {"ok": True, "session_valid": True}