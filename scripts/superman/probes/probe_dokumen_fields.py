"""Read-only probe: inspect real upload fields on Superman's Buat PP > SPPn form.

Purpose: discover the actual HTML `id`/`name` of the "Kontrak Perjanjian /
Dokumen Sejenis", "Invoice / Nota Pembayaran", "E-Faktur" and "Dokumen
Pendukung" upload fields, since services/superman/filler.py currently only
knows about a single combined `#dokumen_pendukung_sppn` input.

Does NOT submit or save anything — only logs in (or reuses a cached
session), selects the SPPn form, opens the dokumen tab, and dumps the DOM.
"""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

from services.superman.auth import ensure_session
from services.superman.config import SupermanConfig

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "var" / "superman" / "probes"


def wait_loaded(page) -> None:
    page.wait_for_function(
        "() => !document.body.innerText.includes('LOADING')",
        timeout=90000,
    )
    page.wait_for_timeout(1500)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cfg = SupermanConfig.from_env()
    state = ensure_session(cfg, auto_login=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--disable-http2"])
        page = browser.new_context(storage_state=state).new_page()
        page.goto(cfg.base_url.rstrip("/") + "/spp/tambah", wait_until="networkidle", timeout=90000)
        wait_loaded(page)

        page.select_option('select[name="flow_id"]', cfg.flow_id)
        page.wait_for_timeout(800)
        page.select_option("#jenis_spp", "vendor")
        page.wait_for_timeout(800)
        page.select_option("#jenis_form", "sppn")
        page.wait_for_timeout(800)
        page.select_option("#sumber_dana", "1")
        page.wait_for_timeout(1500)

        page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
        page.wait_for_timeout(1200)

        page.screenshot(path=str(OUT / "dokumen_tab.png"), full_page=True)

        file_fields = page.eval_on_selector_all(
            "input[type=file]",
            """els => els.map(e => {
                const group = e.closest('.form-group') || e.closest('.col-md-6') || e.parentElement;
                return {
                    name: e.name || '',
                    id: e.id || '',
                    multiple: e.multiple,
                    accept: e.accept || '',
                    required: e.required,
                    outerHTML: e.outerHTML,
                    context_text: group ? group.innerText.trim().slice(0, 300) : ''
                };
            })""",
        )
        (OUT / "dokumen_fields.json").write_text(
            json.dumps(file_fields, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"found {len(file_fields)} file input(s)")
        for f in file_fields:
            print(f"- id={f['id']!r} name={f['name']!r} multiple={f['multiple']} "
                  f"context={f['context_text'][:150]!r}")

        for panel_selector, fname in [
            ("#tab-informasi-sppn", "dokumen_tab_panel.html"),
            ("#tab-informasi-sppb", "dokumen_tab_panel_sppb.html"),
        ]:
            if page.locator(panel_selector).count():
                panel_html = page.eval_on_selector(panel_selector, "el => el.outerHTML")
                (OUT / fname).write_text(panel_html, encoding="utf-8")
                print(f"saved panel HTML ({len(panel_html)} chars) -> {OUT / fname}")

        jenis_form_options = page.eval_on_selector_all(
            "#jenis_form option",
            "els => els.map(e => ({value: e.value, text: e.textContent.trim()}))",
        )
        print("jenis_form options:", jenis_form_options)

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
