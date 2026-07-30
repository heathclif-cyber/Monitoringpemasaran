"""Step through Buat PP form selections and capture SPPn panel."""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "var" / "superman" / "probes"
STATE = ROOT / "var" / "superman" / ".superman_state.json"
URL = "https://superman.ptpn1.co.id/spp/tambah"


def wait_loaded(page) -> None:
    page.wait_for_function(
        "() => !document.body.innerText.includes('LOADING')",
        timeout=90000,
    )
    page.wait_for_timeout(1500)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(storage_state=str(STATE)).new_page()
        page.goto(URL, wait_until="networkidle", timeout=90000)
        wait_loaded(page)

        page.select_option('select[name="flow_id"]', "32")
        page.wait_for_timeout(800)
        page.select_option("#jenis_spp", "vendor")
        page.wait_for_timeout(800)
        page.select_option("#jenis_form", "sppn")
        page.wait_for_timeout(800)
        page.select_option("#sumber_dana", "1")  # RKAP
        page.wait_for_timeout(1500)

        page.screenshot(path=str(OUT / "tambah_sppn_panel.png"), full_page=True)

        visible = page.eval_on_selector_all(
            "input, select, textarea",
            """els => els.filter(e => {
                const r = e.getBoundingClientRect();
                const style = window.getComputedStyle(e);
                return r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            }).map(e => ({
                tag: e.tagName.toLowerCase(),
                name: e.name || '',
                id: e.id || '',
                type: e.type || '',
                placeholder: e.placeholder || ''
            }))""",
        )
        (OUT / "tambah_sppn_visible.json").write_text(
            json.dumps(visible, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print("visible fields", len(visible))
        for v in visible[:50]:
            print(v)
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
