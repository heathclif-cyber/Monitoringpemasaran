from pathlib import Path
from playwright.sync_api import sync_playwright

STATE = Path(__file__).resolve().parents[3] / "var" / "superman" / ".superman_state.json"
CODES = ["11000998", "11001676", "11010421", "11021617", "21060008"]


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
        page.wait_for_timeout(500)
    page.locator('a[href="#tab-isi-sppn"]').click(force=True)
    page.wait_for_timeout(1000)
    page.select_option("#jenis_sap_sppn_1", "gl", force=True)
    page.wait_for_timeout(1500)


with sync_playwright() as p:
    page = p.chromium.launch(headless=True).new_context(storage_state=str(STATE)).new_page()
    setup(page)
    page.locator("#select2-sap_gl_sppn_1-container").click(force=True)
    page.wait_for_timeout(2500)
    texts = page.eval_on_selector_all(
        ".select2-results__option", "els => els.map(e => e.innerText)"
    )
    print("total opts", len(texts))
    for code in CODES:
        hits = [t for t in texts if code in t]
        print(code, "->", hits[:3])

    for code in CODES:
        page.locator("#select2-sap_gl_sppn_1-container").click(force=True)
        page.wait_for_timeout(400)
        page.locator(".select2-container--open .select2-search__field").fill(code)
        page.wait_for_timeout(2500)
        opts = page.locator(".select2-results__option")
        txt = opts.first.inner_text() if opts.count() else ""
        print("search", code, opts.count(), txt[:80])
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

    page.context.browser.close()
