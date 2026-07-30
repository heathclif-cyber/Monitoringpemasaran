"""Probe Buat PP form at /spp/tambah."""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "var" / "superman" / "probes"
STATE = ROOT / "var" / "superman" / ".superman_state.json"
URL = "https://superman.ptpn1.co.id/spp/tambah"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(storage_state=str(STATE)).new_page()
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.screenshot(path=str(OUT / "tambah_pp.png"), full_page=True)
        (OUT / "tambah_pp.html").write_text(page.content(), encoding="utf-8")

        fields = page.eval_on_selector_all(
            "input, select, textarea, label",
            """els => els.map(e => {
                const tag = e.tagName.toLowerCase();
                if (tag === 'label') {
                    return { tag, text: (e.innerText||'').trim(), for: e.htmlFor || '' };
                }
                return {
                    tag,
                    name: e.name || '',
                    id: e.id || '',
                    type: e.type || '',
                    placeholder: e.placeholder || '',
                    value: e.value || ''
                };
            })""",
        )
        (OUT / "tambah_pp_fields.json").write_text(
            json.dumps(fields, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        labels = [f for f in fields if f.get("tag") == "label" and f.get("text")]
        print("labels:", len(labels))
        for lb in labels[:40]:
            print(" ", lb)
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
