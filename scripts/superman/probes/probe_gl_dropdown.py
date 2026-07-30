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
    page.wait_for_timeout(2000)


with sync_playwright() as p:
    page = p.chromium.launch(headless=True).new_context(storage_state=str(STATE)).new_page()
    reqs: list[str] = []

    def on_req(r):
        u = r.url.lower()
        if any(k in u for k in ("gl", "sap", "rekening", "kbb", "select2")):
            reqs.append(r.url)

    page.on("request", on_req)
    setup(page)
    page.locator("#select2-sap_gl_sppn_1-container").click(force=True)
    page.wait_for_timeout(4000)
    opts = page.locator(".select2-results__option")
    print("opts", opts.count())
    for i in range(min(15, opts.count())):
        print("-", opts.nth(i).inner_text()[:100])
    print("requests:")
    for u in reqs[:20]:
        print(u)
    page.context.browser.close()
