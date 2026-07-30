"""Check gula DO rows visible on Laporan page."""
from __future__ import annotations

import json
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://monitoringpemasaran-production.up.railway.app"


def main() -> int:
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
    gula_ready = [
        r
        for r in rows
        if "GKP" in (r.get("No_DO") or "")
        and r.get("Dokumen_Superman_Siap")
        and not (r.get("Superman") or "").strip()
    ]
    print(f"gula_ready={len(gula_ready)}")
    for r in gula_ready[:5]:
        print(" ", r["No_DO"])
    if not gula_ready:
        return 0

    no_do = gula_ready[0]["No_DO"]
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
        page.wait_for_timeout(3000)
        row = page.locator("tr", has_text=no_do)
        print(f"{no_do}: visible={row.count() > 0} button={row.locator('button', has_text='SPPn Superman').count()}")
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())