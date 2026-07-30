"""Test filling GL select2 on SPPn Isi tab."""
from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

STATE = Path(__file__).resolve().parents[3] / "var" / "superman" / ".superman_state.json"


def wait_loaded(page) -> None:
    page.wait_for_function("() => !document.body.innerText.includes('LOADING')", timeout=90000)
    page.wait_for_timeout(1000)


def setup_sppn(page) -> None:
    page.goto("https://superman.ptpn1.co.id/spp/tambah", wait_until="networkidle")
    wait_loaded(page)
    page.select_option('select[name="flow_id"]', "32")
    page.select_option("#jenis_spp", "vendor")
    page.select_option("#jenis_form", "sppn")
    page.select_option("#sumber_dana", "1")
    page.wait_for_timeout(1000)
    page.locator('a[href="#tab-isi-sppn"]').click(force=True)
    page.wait_for_timeout(800)
    page.select_option("#jenis_sap_sppn_1", "gl")
    page.wait_for_timeout(1500)


def try_select2_search(page, container_id: str, query: str) -> None:
    page.locator(f"#{container_id}").click()
    page.wait_for_timeout(500)
    search = page.locator(".select2-container--open .select2-search__field")
    if search.count():
        search.fill(query)
        page.wait_for_timeout(1200)
        page.locator(".select2-results__option").first.click()
        page.wait_for_timeout(800)


def main() -> int:
    with sync_playwright() as p:
        page = p.chromium.launch(headless=True).new_context(storage_state=str(STATE)).new_page()
        setup_sppn(page)
        try_select2_search(page, "select2-sap_gl_sppn_1-container", "11000998")
        page.select_option("#jenis_center_sppn_1", "profit_center")
        page.wait_for_timeout(1000)
        try_select2_search(page, "select2-select_profit_center_sppn_1-container", "A0101")
        page.select_option("#cash_flow_sppn", "1")
        page.fill("#ckeditors_1_1", "Test uraian pendapatan")
        page.select_option("#pilih_pajak_sppn_1_1", "tanpa_pajak_sppn_1_1")
        page.wait_for_timeout(500)
        page.fill("#nominal_sppn_1_1", "3360000000")
        val = page.input_value("#sap_gl_sppn_id_1")
        print("sap_gl hidden", val)
        page.screenshot(path=str(Path(__file__).resolve().parents[3] / "var" / "superman" / "probes" / "select2_filled.png"), full_page=True)
        page.context.browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
