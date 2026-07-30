"""Cek halaman React untuk layar putih / error JS."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
PATHS = ["/", "/pembayaran", "/laporan", "/delivery-order"]


def login(page) -> None:
    import json
    import urllib.request

    req = urllib.request.Request(
        "http://localhost:8000/api/auth/login",
        data=json.dumps({"username": "admin", "password": "admin123"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    token = data["access_token"]
    user = json.dumps(data["user"])
    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=30000)
    page.evaluate(
        """([token, user]) => {
            localStorage.setItem('auth_token', token)
            localStorage.setItem('auth_user', user)
        }""",
        [token, user],
    )


def check_path(page, path: str) -> None:
    errors: list[str] = []
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.on(
        "console",
        lambda msg: errors.append(f"CONSOLE {msg.type}: {msg.text}")
        if msg.type == "error"
        else None,
    )
    page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2500)
    root_text = page.locator("#root").inner_text().strip()
    print(f"PATH {path}")
    print(f"  root_len={len(root_text)}")
    print(f"  preview={root_text[:250]!r}")
    if len(root_text) < 20:
        print("  WARNING: root hampir kosong (kemungkinan layar putih)")
    if errors:
        print("  ERRORS:")
        for err in errors[:20]:
            print(f"    {err}")
    else:
        print("  no js errors")


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        login(page)
        for path in PATHS:
            check_path(page, path)
            print("---")
        browser.close()


if __name__ == "__main__":
    main()