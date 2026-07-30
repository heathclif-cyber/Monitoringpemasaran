"""E2E Superman lewat UI browser (Playwright) — buat SPPn + verifikasi status."""
from __future__ import annotations

import json
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://monitoringpemasaran-production.up.railway.app"
NO_DO = "0002/SPPB/GKP-PTPN24/KKB/SG36/20226"
POLL_JOB_MS = 1500
JOB_TIMEOUT_S = 600


def api_login() -> tuple[str, dict]:
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
    return login["access_token"], login.get("user", {"username": "admin", "role": "admin"})


def api_superman(token: str) -> str | None:
    rows = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                BASE + "/api/laporan?fresh=1",
                headers={"Authorization": f"Bearer {token}"},
            )
        ).read()
    )
    for row in rows:
        if row.get("No_DO") == NO_DO:
            val = (row.get("Superman") or "").strip()
            return val or None
    return None


def main() -> int:
    no_do = sys.argv[1] if len(sys.argv) > 1 else NO_DO
    print(f"=== Browser E2E Superman: {no_do} ===")

    token, user = api_login()
    before = api_superman(token)
    print(f"superman_before: {before!r}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Login app
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.evaluate(
            """([t, u]) => {
                localStorage.setItem('auth_token', t);
                localStorage.setItem('auth_user', JSON.stringify(u));
            }""",
            [token, user],
        )
        page.goto(f"{BASE}/laporan", wait_until="networkidle")
        page.wait_for_timeout(2000)

        # Reset filter bulan agar DO Mei 2026 terlihat
        reset_btn = page.locator("button", has_text="Reset")
        if reset_btn.count():
            reset_btn.first.click()
            page.wait_for_timeout(1500)

        # Cari baris DO
        row = page.locator("tr", has_text=no_do)
        if row.count() == 0:
            page.screenshot(path="scripts/_browser_e2e_fail.png", full_page=True)
            print(f"FAIL: baris {no_do} tidak terlihat di tabel (screenshot: scripts/_browser_e2e_fail.png)")
            browser.close()
            return 1

        print("OK: baris DO terlihat di tabel")

        target_row = row.first
        status_before = target_row.locator("td").filter(has_text="SPPn Superman").count()
        saved_before = target_row.locator("svg.lucide-check-circle-2, .lucide-check-circle-2").count()

        if before:
            print(f"SKIP submit: sudah ada Superman={before}")
            browser.close()
            return 0

        # Klik tombol SPPn Superman
        btn = target_row.locator("button", has_text="SPPn Superman")
        if btn.count() == 0:
            page.screenshot(path="scripts/_browser_e2e_no_btn.png", full_page=True)
            print("FAIL: tombol SPPn Superman tidak ditemukan")
            browser.close()
            return 1

        btn.first.click()
        page.wait_for_timeout(800)

        # Konfirmasi dialog
        confirm = page.locator("button", has_text="Buat di Superman")
        if confirm.count() == 0:
            print("FAIL: dialog konfirmasi tidak muncul")
            browser.close()
            return 1
        confirm.first.click()
        print("Klik konfirmasi — menunggu job Superman...")

        # Tunggu progress dialog selesai atau status berubah
        deadline = time.time() + JOB_TIMEOUT_S
        job_done = False
        while time.time() < deadline:
            page.wait_for_timeout(POLL_JOB_MS)

            # Cek notifikasi sukses
            notif = page.locator("text=Superman:")
            if notif.count() > 0:
                print("notif:", notif.first.inner_text()[:120])
                job_done = True
                break

            # Progress dialog hilang = selesai/gagal
            progress = page.locator("text=Memverifikasi To Do List")
            selesai = page.locator("text=Selesai")
            if selesai.count() and progress.count() == 0:
                job_done = True
                break

            # Status hijau muncul di baris
            if target_row.locator("text=/R\\d+\\/R\\d+D\\/SPPn/").count():
                job_done = True
                break

        page.wait_for_timeout(2000)

        # Verifikasi UI: status hijau, tombol hilang
        ui_text = target_row.inner_text()
        has_sppn = "SPPn" in ui_text and "SPPn Superman" not in ui_text
        btn_after = target_row.locator("button", has_text="SPPn Superman").count()

        page.screenshot(path="scripts/_browser_e2e_result.png", full_page=True)
        print(f"UI setelah job: tombol={btn_after} teks_mengandung_SPPn={has_sppn}")
        print(f"screenshot: scripts/_browser_e2e_result.png")

        browser.close()

    after = api_superman(token)
    print(f"superman_after_api: {after!r}")

    if after:
        print(f"OK: Superman tersimpan di DB -> {after}")
        return 0

    if job_done:
        print("WARN: job UI selesai tapi DB masih kosong — coba recover")
        import urllib.parse

        req = urllib.request.Request(
            BASE + "/api/superman/recover?no_do=" + urllib.parse.quote(no_do),
            data=b"{}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        rec = json.loads(urllib.request.urlopen(req, timeout=180).read())
        print("recover:", rec.get("message"), rec.get("superman_saved"))
        after2 = api_superman(token)
        if after2:
            print(f"OK after recover: {after2}")
            return 0

    print("FAIL: Superman tidak tersimpan")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())