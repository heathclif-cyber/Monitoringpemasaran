from pathlib import Path
import json
from playwright.sync_api import sync_playwright

STATE = Path(__file__).resolve().parents[3] / "var" / "superman" / ".superman_state.json"
TARGET = "11000998"


with sync_playwright() as p:
    ctx = p.chromium.launch(headless=True).new_context(storage_state=str(STATE))
    page = ctx.new_page()
    page.goto("https://superman.ptpn1.co.id/sppd", wait_until="networkidle")

    for page_no in range(1, 6):
        url = f"https://superman.ptpn1.co.id/spp/master_gl_tambah_v2?page={page_no}"
        resp = page.request.get(url)
        data = resp.json()
        items = data if isinstance(data, list) else data.get("data", data.get("results", []))
        if not items:
            print("page", page_no, "empty")
            break
        for it in items:
            blob = json.dumps(it, ensure_ascii=False)
            if TARGET in blob:
                print("FOUND page", page_no, it)
        print("page", page_no, "count", len(items))

    # try select2 search terms
    page.goto("https://superman.ptpn1.co.id/spp/tambah", wait_until="networkidle")
    page.wait_for_function("() => !document.body.innerText.includes('LOADING')", timeout=90000)
    for sel, val in [
        ('select[name="flow_id"]', "32"),
        ("#jenis_spp", "vendor"),
        ("#jenis_form", "sppn"),
        ("#sumber_dana", "1"),
    ]:
        page.select_option(sel, val)
    page.locator('a[href="#tab-isi-sppn"]').click(force=True)
    page.select_option("#jenis_sap_sppn_1", "gl")
    page.wait_for_timeout(1500)

    for term in [TARGET, "110009", "Pendapatan", "penjualan"]:
        page.locator("#select2-sap_gl_sppn_1-container").click(force=True)
        page.wait_for_timeout(400)
        s = page.locator(".select2-container--open .select2-search__field")
        s.fill(term)
        page.wait_for_timeout(2500)
        opts = page.locator(".select2-results__option")
        print("search", term, "->", opts.count(), opts.first.inner_text() if opts.count() else "")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

    ctx.browser.close()
