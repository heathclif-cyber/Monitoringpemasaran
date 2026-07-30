"""One-off explorer for Superman login + navigation (dev only)."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")

BASE_URL = os.getenv("SUPERMAN_URL", "https://superman.ptpn1.co.id/").rstrip("/") + "/"
USER = os.getenv("SUPERMAN_USER", "")
PASSWORD = os.getenv("SUPERMAN_PASSWORD", "")
OUT_DIR = ROOT / "var" / "superman" / "probes"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def solve_math_captcha(page) -> str | None:
    """Try OCR-like parse from captcha img alt/title or nearby text."""
    img = page.locator('img[src*="captcha"]').first
    if not img.count():
        return None
    src = img.get_attribute("src") or ""
    # Some apps embed equation in URL query — unlikely
    text = page.locator('label:has-text("Captcha"), .captcha, #captcha').first.inner_text(timeout=2000)
    if text:
        m = re.search(r"(\d+)\s*([+\-x×*])\s*(\d+)", text, re.I)
        if m:
            a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
            if op in ("+",):
                return str(a + b)
            if op in ("-",):
                return str(a - b)
            if op in ("x", "×", "*"):
                return str(a * b)
    return None


def main() -> int:
    if not USER or not PASSWORD:
        print("Set SUPERMAN_USER and SUPERMAN_PASSWORD in .env", file=sys.stderr)
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL, wait_until="networkidle", timeout=60000)
        page.screenshot(path=str(OUT_DIR / "01_login.png"), full_page=True)

        html = page.content()
        (OUT_DIR / "01_login.html").write_text(html, encoding="utf-8")

        # Collect input names
        inputs = page.eval_on_selector_all(
            "input",
            """els => els.map(e => ({
                name: e.name, id: e.id, type: e.type, placeholder: e.placeholder
            }))""",
        )
        (OUT_DIR / "inputs.json").write_text(json.dumps(inputs, indent=2), encoding="utf-8")

        links = page.eval_on_selector_all(
            "a",
            """els => els.map(e => ({href: e.href, text: (e.innerText||'').trim()})).filter(x => x.text)""",
        )
        (OUT_DIR / "links_login.json").write_text(json.dumps(links[:50], indent=2), encoding="utf-8")

        # Fill credentials — captcha requires manual or solver
        user_sel = 'input[name="username"], input#username, input[type="text"]'
        pass_sel = 'input[name="password"], input#password, input[type="password"]'
        page.locator(user_sel).first.fill(USER)
        page.locator(pass_sel).first.fill(PASSWORD)

        captcha_inputs = page.eval_on_selector_all(
            'input[type="text"]',
            """els => els.map(e => ({name: e.name, id: e.id}))""",
        )
        (OUT_DIR / "text_inputs.json").write_text(json.dumps(captcha_inputs, indent=2), encoding="utf-8")

        answer = solve_math_captcha(page)
        if answer:
            # guess captcha field — often last text input or name=captcha
            cap = page.locator('input[name*="captcha" i], input[id*="captcha" i]').first
            if cap.count():
                cap.fill(answer)
            else:
                page.locator('input[type="text"]').nth(1).fill(answer)

        page.screenshot(path=str(OUT_DIR / "02_filled.png"), full_page=True)
        print(f"Probe saved to {OUT_DIR}")
        print("inputs:", json.dumps(inputs, indent=2))
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
