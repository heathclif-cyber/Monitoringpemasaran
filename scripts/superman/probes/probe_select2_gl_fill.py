"""Test select2 GL fill strategies."""
from pathlib import Path
from playwright.sync_api import sync_playwright

STATE = Path(__file__).resolve().parents[3] / "var" / "superman" / ".superman_state.json"


def setup(page):
    page.goto("https://superman.ptpn1.co.id/spp/tambah", wait_until="networkidle")
    page.wait_for_function("() => !document.body.innerText.includes('LOADING')", timeout=90000)
    for sel, val in [
        ('select[name="flow_id"]', "32"),
        ("#jenis_spp", "vendor"),
        ("#jenis_form", "sppn"),
        ("#sumber_dana", "1"),
    ]:
        page.select_option(sel, val)
        page.wait_for_timeout(400)
    page.locator('a[href="#tab-isi-sppn"]').click(force=True)
    page.wait_for_timeout(800)
    page.select_option("#jenis_sap_sppn_1", "gl")
    page.wait_for_timeout(1500)


def try_search(page, gl: str):
    page.locator("#select2-sap_gl_sppn_1-container").click(force=True)
    page.wait_for_timeout(500)
    search = page.locator(".select2-container--open .select2-search__field")
    if search.count():
        search.fill(gl)
        page.wait_for_timeout(2000)
        opts = page.locator(".select2-results__option")
        print("options", opts.count())
        for i in range(min(5, opts.count())):
            print(i, opts.nth(i).inner_text())
        opts.first.click()
        page.wait_for_timeout(1000)
    hidden = page.input_value("#sap_gl_sppn_id_1")
    rendered = page.locator("#select2-sap_gl_sppn_1-container").inner_text()
    print("hidden", hidden, "rendered", rendered)


with sync_playwright() as p:
    page = p.chromium.launch(headless=True).new_context(storage_state=str(STATE)).new_page()
    setup(page)
    try_search(page, "11000998")
    page.context.browser.close()
