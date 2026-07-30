"""Open first PPn row detail for field reference."""
from __future__ import annotations

import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "var" / "superman" / "probes"
STATE = ROOT / "var" / "superman" / ".superman_state.json"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(storage_state=str(STATE)).new_page()
        page.goto("https://superman.ptpn1.co.id/sppd", wait_until="networkidle")
        page.wait_for_timeout(2000)

        # PPn number links in table
        links = page.locator("table a").all()
        print("table links", len(links))
        for i, link in enumerate(links[:15]):
            txt = link.inner_text().strip()
            href = link.get_attribute("href") or ""
            print(i, repr(txt[:60]), href[:80])

        # click first SPPn-looking link
        target = page.locator("a").filter(has_text=re.compile(r"SPPn", re.I)).first
        if target.count():
            href = target.get_attribute("href") or ""
            print("open", href)
            page.goto(href if href.startswith("http") else f"https://superman.ptpn1.co.id{href}")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)
            page.screenshot(path=str(OUT / "ppn_detail.png"), full_page=True)
            (OUT / "ppn_detail.html").write_text(page.content(), encoding="utf-8")
            inputs = page.eval_on_selector_all(
                "input, select, textarea",
                """els => els.map(e => ({
                    tag: e.tagName.toLowerCase(),
                    name: e.name || '',
                    id: e.id || '',
                    type: e.type || '',
                    value: e.value || '',
                    text: e.tagName==='SELECT' ? e.options[e.selectedIndex]?.text : ''
                }))""",
            )
            filled = [x for x in inputs if x.get("value") and x["type"] != "hidden"]
            (OUT / "ppn_detail_filled.json").write_text(
                json.dumps(filled, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            print("filled fields", len(filled))
            for f in filled[:40]:
                print(f)

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
