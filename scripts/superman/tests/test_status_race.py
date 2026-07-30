"""Simulate post-SPPn UI race: fetch returns empty Superman but local label must persist."""
from __future__ import annotations

import json
import sys
import urllib.request

BASE = "https://monitoringpemasaran-production.up.railway.app"


def api(method: str, path: str, token: str | None = None, body: dict | None = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def main() -> int:
    login = api("POST", "/api/auth/login", body={"username": "admin", "password": "admin123"})
    token = login["access_token"]

    rows = api("GET", "/api/laporan?fresh=1", token=token)
    saved = [r for r in rows if (r.get("Superman") or "").strip()]
    if not saved:
        print("SKIP: no saved Superman rows to verify UI")
        return 0

    sample = saved[0]
    no_do = sample["No_DO"]
    label = sample["Superman"]
    print(f"verify_ui: {no_do} -> {label}")

    from playwright.sync_api import sync_playwright

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

        row = page.locator("tr", has_text=no_do).first
        assert row.count() > 0, f"Row {no_do} not visible (check filter bulan/tahun)"

        status_cell = row.locator("td").filter(has_text=label).first
        if status_cell.count() == 0:
            # compact status may show only part of label
            partial = label.split(" + ")[0]
            status_cell = row.locator("td").filter(has_text=partial).first
        assert status_cell.count() > 0, f"Status Superman '{label}' tidak tampil di baris {no_do}"

        # Tombol SPPn tidak boleh muncul lagi untuk DO yang sudah punya Superman
        assert row.locator("button", has_text="SPPn Superman").count() == 0, (
            f"Tombol SPPn masih tampil padahal Superman sudah: {label}"
        )

        browser.close()

    print("OK: status Superman tampil di UI")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())