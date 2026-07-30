from pathlib import Path
from playwright.sync_api import sync_playwright

STATE = Path(__file__).resolve().parents[3] / "var" / "superman" / ".superman_state.json"
OUT = Path(__file__).resolve().parents[3] / "var" / "superman" / "probes"


def main() -> int:
    with sync_playwright() as p:
        page = p.chromium.launch(headless=True).new_context(storage_state=str(STATE)).new_page()
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
        page.wait_for_timeout(800)
        page.select_option("#jenis_sap_sppn_1", "gl")
        page.wait_for_timeout(1000)
        page.evaluate(
            """() => {
                const el = document.querySelector('#sap_gl_sppn_id_1');
                if (el) {
                    el.style.display = 'block';
                    el.value = '11000998';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }"""
        )
        page.select_option("#jenis_center_sppn_1", "profit_center")
        page.wait_for_timeout(1000)
        page.evaluate(
            """() => {
                const sel = document.querySelector('#select_profit_center_sppn_1');
                if (sel) {
                    const opt = Array.from(sel.options).find(o => o.text.includes('A0101'));
                    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
                }
            }"""
        )
        page.select_option("#cash_flow_sppn", "1")
        page.fill("#ckeditors_1_1", "Uraian test")
        page.select_option("#pilih_pajak_sppn_1_1", "tanpa_pajak_sppn_1_1")
        page.fill("#nominal_sppn_1_1", "1000000")
        print("gl", page.input_value("#sap_gl_sppn_id_1"))
        print("pc", page.evaluate("() => document.querySelector('#select_profit_center_sppn_1')?.value"))
        page.screenshot(path=str(OUT / "hidden_sap.png"), full_page=True)
        page.context.browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
