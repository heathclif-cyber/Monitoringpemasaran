"""Verifikasi status Superman tampil di UI browser."""
from __future__ import annotations

import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://monitoringpemasaran-production.up.railway.app"


def main() -> int:
    no_do = sys.argv[1] if len(sys.argv) > 1 else "0002/SPPB/GKP-PTPN24/KKB/SG36/20226"
    login = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                BASE + "/api/auth/login",
                data=json.dumps({"username": "admin", "password": "admin123"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
        ).read()
    )
    token = login["access_token"]
    rows = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                BASE + "/api/laporan?fresh=1",
                headers={"Authorization": f"Bearer {token}"},
            )
        ).read()
    )
    row = next((r for r in rows if r.get("No_DO") == no_do), None)
    expected = (row.get("Superman") or "").strip() if row else ""
    print(f"API Superman: {expected!r}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.evaluate(
            """([t, u]) => {
                localStorage.setItem('auth_token', t);
                localStorage.setItem('auth_user', JSON.stringify(u));
            }""",
            [token, login.get("user", {"username": "admin", "role": "admin"})],
        )
        page.goto(f"{BASE}/laporan", wait_until="networkidle")
        page.wait_for_timeout(2000)

        reset = page.locator("button", has_text="Reset")
        if reset.count():
            reset.first.click()
            page.wait_for_timeout(1500)

        tr = page.locator("tr", has_text=no_do)
        if tr.count() == 0:
            print("FAIL: baris tidak terlihat")
            browser.close()
            return 1

        row_el = tr.first
        text = row_el.inner_text()
        btn = row_el.locator("button", has_text="SPPn Superman").count()
        has_expected = expected and expected.split(" + ")[0] in text

        page.screenshot(path="scripts/_browser_status_check.png", full_page=True)
        print(f"UI tombol_SPPn={btn} status_tampil={has_expected}")
        print("screenshot: scripts/_browser_status_check.png")

        browser.close()

    if expected and has_expected and btn == 0:
        print("OK: status Superman tampil di browser, tombol hilang")
        return 0
    print("FAIL: status belum benar di UI")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())