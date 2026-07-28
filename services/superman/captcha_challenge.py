"""Tantangan captcha Superman melalui Chromium Playwright di Railway.

Browser dipertahankan selama operator menjawab captcha. Dengan begitu gambar,
cookie, dan form yang dikirim semuanya berasal dari sesi Chromium yang sama.
Ini menghindari jalur httpx terpisah yang sering timeout dari Railway.
"""

from __future__ import annotations

import base64
import logging
import time
import uuid
from dataclasses import dataclass
from threading import Lock
from typing import Any, Literal

from playwright.sync_api import Browser, Page, Playwright, sync_playwright

from services.superman.auth import _is_login_page, save_storage_state_atomic
from services.superman.config import SupermanConfig

logger = logging.getLogger("superman.captcha")

TTL_SECONDS = 300
LoginFailureKind = Literal["captcha", "credentials", "lockout", "unknown"]
_BROWSER_ARGS = ["--disable-http2", "--disable-dev-shm-usage"]


@dataclass
class PendingCaptcha:
    pw: Playwright
    browser: Browser
    page: Page
    cfg: SupermanConfig
    created_at: float


_store: dict[str, PendingCaptcha] = {}
_lock = Lock()


def _dispose(challenge_id: str) -> None:
    with _lock:
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
    for challenge_id in expired:
        _dispose(challenge_id)


def _dispose_all() -> None:
    with _lock:
        challenge_ids = list(_store)
    for challenge_id in challenge_ids:
        _dispose(challenge_id)


def _get_entry(challenge_id: str) -> PendingCaptcha:
    _cleanup_expired()
    with _lock:
        entry = _store.get(challenge_id)
    if not entry:
        raise ValueError("Tantangan captcha kedaluwarsa. Muat ulang captcha.")
    return entry


def _fill_credentials(page: Page, cfg: SupermanConfig) -> None:
    page.fill("#signin-username", cfg.username)
    page.fill("#signin-password", cfg.password)


def _captcha_locator(page: Page):
    primary = page.locator(".captcha img")
    if primary.count() > 0:
        return primary.first
    return page.locator("img[src*='captcha']").first


def _captcha_image(page: Page) -> bytes:
    image = _captcha_locator(page)
    image.wait_for(state="visible", timeout=15_000)
    return image.screenshot(type="png")


def _image_payload(body: bytes, challenge_id: str) -> dict[str, Any]:
    return {
        "challenge_id": challenge_id,
        "image_base64": base64.b64encode(body).decode("ascii"),
        "mime_type": "image/png",
    }


def _page_error_text(page: Page) -> str:
    messages: list[str] = []
    for selector in (".alert-danger", ".text-danger strong", "form .text-danger", ".help-block", "#countdown"):
        locator = page.locator(selector)
        for index in range(min(locator.count(), 3)):
            try:
                value = locator.nth(index).inner_text(timeout=700).strip()
            except Exception:
                continue
            if value and value not in messages:
                messages.append(value)
    return " ".join(messages)


def _classify_login_failure(page: Page) -> tuple[LoginFailureKind, str]:
    page_error = _page_error_text(page)
    try:
        body = page.locator("body").inner_text(timeout=2_000).lower()
    except Exception:
        body = ""
    combined = f"{body} {page_error.lower()}"
    if "gagal login lebih dari" in combined or "coba lagi dalam" in combined:
        return "lockout", page_error or "Akun Superman terkunci sementara. Tunggu beberapa menit."
    if any(word in combined for word in ("password", "username", "kata sandi")) and any(
        word in combined for word in ("salah", "tidak sesuai", "invalid")
    ):
        return "credentials", page_error or "Username atau password Superman salah."
    if "captcha" in combined:
        return "captcha", page_error or "Captcha salah. Selesaikan hitungan lalu coba lagi."
    return "unknown", page_error or "Login Superman belum berhasil. Coba captcha baru."


def _open_login_page(page: Page, cfg: SupermanConfig) -> None:
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            page.goto(cfg.base_url, wait_until="domcontentloaded", timeout=45_000)
            page.wait_for_selector("#signin-username, .captcha img, form.form-auth-small", timeout=20_000)
            return
        except Exception as exc:
            last_error = exc
            logger.warning("Chromium captcha attempt %s gagal: %s", attempt, exc)
            page.wait_for_timeout(700 * attempt)
    raise RuntimeError(
        "Chromium Railway tidak dapat membuka form login Superman setelah 3 percobaan. "
        "Periksa koneksi Railway ke portal Superman."
    ) from last_error


def _reload_captcha(entry: PendingCaptcha) -> bytes:
    page = entry.page
    reload_button = page.locator("#reload")
    if reload_button.count() == 1:
        reload_button.click()
        page.wait_for_timeout(900)
    else:
        _open_login_page(page, entry.cfg)
    _fill_credentials(page, entry.cfg)
    return _captcha_image(page)


def start_captcha_challenge(cfg: SupermanConfig) -> dict[str, Any]:
    if not cfg.username or not cfg.password:
        raise RuntimeError("Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment.")

    _cleanup_expired()
    _dispose_all()
    pw = sync_playwright().start()
    browser: Browser | None = None
    try:
        browser = pw.chromium.launch(
            headless=cfg.headless,
            slow_mo=cfg.slow_mo_ms,
            args=_BROWSER_ARGS,
        )
        page = browser.new_page()
        page.set_default_timeout(45_000)
        _open_login_page(page, cfg)
        _fill_credentials(page, cfg)
        image = _captcha_image(page)
    except Exception:
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        pw.stop()
        raise

    challenge_id = str(uuid.uuid4())
    with _lock:
        _store[challenge_id] = PendingCaptcha(
            pw=pw,
            browser=browser,
            page=page,
            cfg=cfg,
            created_at=time.time(),
        )
    logger.info("captcha challenge siap id=%s (chromium)", challenge_id[:8])
    return _image_payload(image, challenge_id)


def refresh_captcha_challenge(challenge_id: str) -> dict[str, Any]:
    entry = _get_entry(challenge_id)
    image = _reload_captcha(entry)
    entry.created_at = time.time()
    return _image_payload(image, challenge_id)


def verify_captcha_challenge(challenge_id: str, answer: str) -> dict[str, Any]:
    entry = _get_entry(challenge_id)
    answer = answer.strip()
    if not answer:
        raise ValueError("Jawaban captcha kosong.")

    page = entry.page
    try:
        _fill_credentials(page, entry.cfg)
        page.fill("#captcha", answer)
        submit = page.locator("form.form-auth-small button[type='submit']")
        if submit.count() != 1:
            raise RuntimeError("Tombol login Superman tidak ditemukan.")
        try:
            with page.expect_navigation(wait_until="domcontentloaded", timeout=45_000):
                submit.click()
        except Exception:
            page.wait_for_timeout(1_500)
    except Exception as exc:
        raise RuntimeError(f"Chromium gagal mengirim login Superman: {exc}") from exc

    if not _is_login_page(page):
        save_storage_state_atomic(page.context, entry.cfg.state_path)
        _dispose(challenge_id)
        logger.info("login Superman OK via Chromium captcha")
        return {"ok": True, "session_valid": True}

    kind, message = _classify_login_failure(page)
    image = _reload_captcha(entry)
    entry.created_at = time.time()
    return {
        "ok": False,
        "error": message,
        "failure_kind": kind,
        **_image_payload(image, challenge_id),
    }
