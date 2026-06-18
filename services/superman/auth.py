from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import BrowserContext, Page, sync_playwright

from services.superman.captcha import solve_math_captcha
from services.superman.config import SupermanConfig


def _is_login_page(page: Page) -> bool:
    return page.locator("#signin-username").count() > 0


def login(page: Page, cfg: SupermanConfig, max_attempts: int = 20) -> bool:
    page.goto(cfg.base_url, wait_until="networkidle", timeout=60000)
    for attempt in range(max_attempts):
        page.fill("#signin-username", cfg.username)
        page.fill("#signin-password", cfg.password)
        img_src = page.locator('img[src*="captcha"]').first.get_attribute("src") or ""
        if img_src.startswith("/"):
            img_src = cfg.base_url.rstrip("/") + img_src
        body = page.request.get(img_src).body()
        answer, raw = solve_math_captcha(body)
        if not answer:
            page.click("#reload")
            page.wait_for_timeout(600)
            continue
        page.fill("#captcha", answer)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle", timeout=20000)
        page.wait_for_timeout(1200)
        if not _is_login_page(page):
            return True
        page.goto(cfg.base_url, wait_until="networkidle")
    raise RuntimeError(f"Login Superman gagal setelah {max_attempts} percobaan captcha (terakhir OCR={raw!r})")


def ensure_session(cfg: SupermanConfig) -> str:
    state_path = Path(cfg.state_path)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    if state_path.exists() and os.getenv("SUPERMAN_FORCE_LOGIN", "").lower() not in ("1", "true", "yes"):
        return str(state_path)

    if not cfg.username or not cfg.password:
        raise RuntimeError("Set SUPERMAN_USER dan SUPERMAN_PASSWORD di .env")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        login(page, cfg)
        context.storage_state(path=str(state_path))
        browser.close()
    return str(state_path)


def open_authenticated_context(cfg: SupermanConfig) -> tuple:
    """Return (playwright_manager, browser, context) — caller must close."""
    state = ensure_session(cfg)
    p = sync_playwright().start()
    browser = p.chromium.launch(headless=cfg.headless, slow_mo=cfg.slow_mo_ms)
    context: BrowserContext = browser.new_context(storage_state=state)
    return p, browser, context