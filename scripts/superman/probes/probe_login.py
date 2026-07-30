"""Try login + post-login navigation probe."""
from __future__ import annotations

import json
import os
import re
import sys
from io import BytesIO
from pathlib import Path

import ddddocr
from dotenv import load_dotenv
from PIL import Image, ImageEnhance, ImageOps
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")
OUT = ROOT / "var" / "superman" / "probes"
OUT.mkdir(parents=True, exist_ok=True)

BASE = os.getenv("SUPERMAN_URL", "https://superman.ptpn1.co.id/").rstrip("/") + "/"
USER = os.getenv("SUPERMAN_USER", "")
PASSWORD = os.getenv("SUPERMAN_PASSWORD", "")
STATE_PATH = ROOT / "var" / "superman" / ".superman_state.json"

_OCR = ddddocr.DdddOcr(show_ad=False)


def _eval_math(text: str) -> str | None:
    text = re.sub(r"\s+", "", text).replace("=", "").replace("?", "")
    text = text.replace("×", "x").replace("*", "x").replace("X", "x")
    m = re.search(r"(\d+)([+\-x])(\d+)", text)
    if not m:
        return None
    a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
    if op == "+":
        return str(a + b)
    if op == "-":
        return str(a - b)
    return str(a * b)


def _captcha_variants(img_bytes: bytes) -> list[bytes]:
    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    variants = [img_bytes]
    gray = ImageOps.grayscale(img)
    for threshold in (120, 140, 160):
        bw = gray.point(lambda p, t=threshold: 255 if p > t else 0)
        buf = BytesIO()
        bw.save(buf, format="PNG")
        variants.append(buf.getvalue())
    sharp = ImageEnhance.Sharpness(gray).enhance(2.5)
    buf = BytesIO()
    sharp.save(buf, format="PNG")
    variants.append(buf.getvalue())
    return variants


def solve_captcha(page) -> tuple[str | None, str | None]:
    img_el = page.locator('img[src*="captcha"]').first
    src = img_el.get_attribute("src") or ""
    if src.startswith("/"):
        src = BASE.rstrip("/") + src
    body = page.request.get(src).body()
    (OUT / "captcha.png").write_bytes(body)
    for variant in _captcha_variants(body):
        raw = _OCR.classification(variant)
        ans = _eval_math(raw)
        if ans:
            return ans, raw
    return None, None


def is_login_page(page) -> bool:
    return page.locator("#signin-username").count() > 0


def login(page, max_attempts: int = 20) -> bool:
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    for attempt in range(max_attempts):
        page.fill("#signin-username", USER)
        page.fill("#signin-password", PASSWORD)
        ans, raw = solve_captcha(page)
        print(f"attempt {attempt + 1}: ocr={raw!r} answer={ans}")
        if not ans:
            page.click("#reload")
            page.wait_for_timeout(600)
            continue
        page.fill("#captcha", ans)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle", timeout=15000)
        page.wait_for_timeout(1500)
        if not is_login_page(page):
            return True
        err = page.locator(".text-danger, .alert-danger, strong").first
        if err.count():
            print("  error:", err.inner_text(timeout=1000))
        page.goto(BASE, wait_until="networkidle")
    return False


def collect_links(page) -> list[dict]:
    return page.eval_on_selector_all(
        "a",
        """els => els.map(e => ({href: e.href, text: (e.innerText||'').trim()}))
            .filter(x => x.text && x.href)""",
    )


def main() -> int:
    if not USER or not PASSWORD:
        print("Missing SUPERMAN_USER/PASSWORD in .env", file=sys.stderr)
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        if not login(page):
            page.screenshot(path=str(OUT / "03_login_failed.png"), full_page=True)
            print("Login failed after retries", file=sys.stderr)
            browser.close()
            return 1

        page.screenshot(path=str(OUT / "03_after_login.png"), full_page=True)
        (OUT / "03_after_login.html").write_text(page.content(), encoding="utf-8")
        print("Logged in. URL:", page.url)

        links = collect_links(page)
        (OUT / "links_after_login.json").write_text(
            json.dumps(links, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        keywords = ("deklar", "penerima", "cash", "bayar", "terima", "input", "transaksi")
        for l in links:
            blob = f"{l['text']} {l['href']}".lower()
            if any(k in blob for k in keywords):
                print("menu:", l)

        # Try sidebar / nav text dump
        nav_text = page.locator("nav, .sidebar, #sidebar, .main-menu, ul.menu").all_inner_texts()
        (OUT / "nav_text.txt").write_text("\n---\n".join(nav_text), encoding="utf-8")
        print("nav blocks:", len(nav_text))

        context.storage_state(path=str(STATE_PATH))
        print("Saved session:", STATE_PATH)
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
