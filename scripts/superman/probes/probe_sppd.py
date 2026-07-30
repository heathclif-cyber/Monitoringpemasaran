"""Explore SPPb/SPPn pages after authenticated session."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")
OUT = ROOT / "var" / "superman" / "probes"
STATE = ROOT / "var" / "superman" / ".superman_state.json"
BASE = os.getenv("SUPERMAN_URL", "https://superman.ptpn1.co.id/").rstrip("/") + "/"

PATHS = [
    "/sppd",
    "/sppd/create",
    "/sppd/new",
    "/laporan",
    "/dashboard",
]


def dump_page(page, name: str) -> None:
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    (OUT / f"{name}.html").write_text(page.content(), encoding="utf-8")
    inputs = page.eval_on_selector_all(
        "input, select, textarea",
        """els => els.map(e => ({
            tag: e.tagName.toLowerCase(),
            name: e.name || '',
            id: e.id || '',
            type: e.type || '',
            placeholder: e.placeholder || ''
        }))""",
    )
    (OUT / f"{name}_inputs.json").write_text(json.dumps(inputs, indent=2), encoding="utf-8")
    links = page.eval_on_selector_all(
        "a, button",
        """els => els.map(e => ({
            tag: e.tagName.toLowerCase(),
            text: (e.innerText||'').trim().slice(0,80),
            href: e.href || '',
            id: e.id || '',
            class: e.className || ''
        })).filter(x => x.text)""",
    )
    (OUT / f"{name}_actions.json").write_text(
        json.dumps(links[:80], indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(name, "url=", page.url, "inputs=", len(inputs), "actions=", len(links))


def main() -> int:
    if not STATE.exists():
        print("Run commands/login.py first")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(storage_state=str(STATE))
        page = context.new_page()

        page.goto(BASE + "dashboard", wait_until="networkidle")
        dump_page(page, "dash")

        page.goto(BASE + "sppd", wait_until="networkidle")
        dump_page(page, "sppd")

        # click first actionable row/button if list page
        for sel in [
            "table tbody tr a",
            "table tbody tr button",
            ".btn-primary",
            "a:has-text('Proses')",
            "a:has-text('Input')",
            "a:has-text('Buat')",
            "a:has-text('Tambah')",
        ]:
            loc = page.locator(sel)
            if loc.count():
                print("clicking", sel, "count", loc.count())
                try:
                    loc.first.click(timeout=5000)
                    page.wait_for_load_state("networkidle", timeout=15000)
                    dump_page(page, f"sppd_click_{sel.replace(' ', '_')[:30]}")
                except Exception as exc:
                    print("  skip", sel, exc)
                break

        for path in PATHS[1:]:
            url = BASE.rstrip("/") + path
            resp = page.goto(url, wait_until="networkidle")
            if resp and resp.status < 400:
                dump_page(page, path.strip("/").replace("/", "_"))

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
