"""Open Isi tab and list line-item fields."""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "var" / "superman" / "probes"
STATE = ROOT / "var" / "superman" / ".superman_state.json"


def wait_loaded(page) -> None:
    page.wait_for_function("() => !document.body.innerText.includes('LOADING')", timeout=90000)
    page.wait_for_timeout(1000)


def main() -> int:
    with sync_playwright() as p:
        page = p.chromium.launch(headless=True).new_context(storage_state=str(STATE)).new_page()
        page.goto("https://superman.ptpn1.co.id/spp/tambah", wait_until="networkidle")
        wait_loaded(page)
        page.select_option('select[name="flow_id"]', "32")
        page.select_option("#jenis_spp", "vendor")
        page.select_option("#jenis_form", "sppn")
        page.select_option("#sumber_dana", "1")
        page.wait_for_timeout(1200)

        # switch to Isi tab
        page.locator('a[href="#tab-isi-sppn"]').click(force=True)
        page.wait_for_timeout(2000)
        page.screenshot(path=str(OUT / "tambah_isi_tab.png"), full_page=True)

        fields = page.eval_on_selector_all(
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
        (OUT / "tambah_isi_visible.json").write_text(json.dumps(fields, indent=2), encoding="utf-8")
        print("fields", len(fields))
        for f in fields:
            print(f)
        page.context.browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
