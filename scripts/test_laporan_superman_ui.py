"""Smoke test UI Laporan + status Superman di production."""
from __future__ import annotations

import json
import sys
import urllib.error
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
    with_superman = [r for r in rows if (r.get("Superman") or "").strip()]
    ready_no_superman = [
        r for r in rows
        if r.get("Dokumen_Superman_Siap") and not (r.get("Superman") or "").strip()
    ]

    print(f"rows={len(rows)} with_superman={len(with_superman)} ready_pending={len(ready_no_superman)}")
    if with_superman:
        sample = with_superman[0]
        print(f"sample_saved: {sample['No_DO']} -> {sample['Superman']}")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — API checks only")
        return 0

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
        page.wait_for_timeout(4000)

        content = page.content()
        has_status_col = "Status Deklarasi Superman" in content
        has_saved = "R8/R08D/SPPn" in content or "SPPb" in content
        print(f"browser_laporan: status_col={has_status_col} shows_saved_number={has_saved}")

        if ready_no_superman:
            no_do = ready_no_superman[0]["No_DO"]
            print(f"pending_do: {no_do}")
            assert page.locator(f"text={no_do}").count() > 0, f"DO {no_do} tidak terlihat di tabel"

        browser.close()

    print("OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read().decode()}", file=sys.stderr)
        raise SystemExit(1)