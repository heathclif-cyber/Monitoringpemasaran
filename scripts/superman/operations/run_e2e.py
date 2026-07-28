"""Jalankan deklarasi Superman end-to-end via API production, verifikasi DB."""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://monitoringpemasaran-production.up.railway.app"
DEFAULT_NO_DO = "0004/SPPB/GKP-PTPN24/KKB/SG35/2026"
POLL_MS = 2000
TIMEOUT_S = 600


def api(method: str, path: str, token: str | None = None, body: dict | None = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def get_superman(no_do: str, token: str) -> str | None:
    rows = api("GET", "/api/laporan?fresh=1", token=token)
    for row in rows:
        if row.get("No_DO") == no_do:
            val = (row.get("Superman") or "").strip()
            return val or None
    return None


def main() -> int:
    no_do = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_NO_DO
    print(f"=== E2E Superman: {no_do} ===")

    login = api("POST", "/api/auth/login", body={"username": "admin", "password": "admin123"})
    token = login["access_token"]
    print("login: OK")

    before = get_superman(no_do, token)
    print(f"superman_before: {before!r}")

    status = api("GET", "/api/superman/status", token=token)
    print(f"superman_status: configured={status.get('configured')} session_valid={status.get('session_valid')}")

    if not status.get("configured"):
        print("FAIL: Superman belum dikonfigurasi di Railway")
        return 1
    if not status.get("session_valid"):
        print("WARN: session belum valid — job akan coba auto-login (SUPERMAN_AUTO_LOGIN)")

    preview = api("GET", f"/api/superman/preview?no_do={urllib.parse.quote(no_do)}", token=token)
    print(f"preview: jenis_form={preview.get('jenis_form')} pph={preview.get('pph_nominal')} support={preview.get('support_doc', {}).get('source')}")

    if before:
        print(f"SKIP start: DO sudah punya Superman={before}")
        return 0

    try:
        start = api("POST", f"/api/superman/deklarasi/start?no_do={urllib.parse.quote(no_do)}", token=token)
    except urllib.error.HTTPError as exc:
        print(f"FAIL start: HTTP {exc.code}: {exc.read().decode()}")
        return 1

    job_id = start["job_id"]
    print(f"job_started: {job_id}")

    deadline = time.time() + TIMEOUT_S
    result = None
    while time.time() < deadline:
        time.sleep(POLL_MS / 1000)
        prog = api("GET", f"/api/superman/deklarasi/progress?job_id={urllib.parse.quote(job_id)}", token=token)
        print(f"  [{prog.get('percent')}%] {prog.get('stage')}")
        if prog.get("status") == "completed":
            result = prog.get("result")
            break
        if prog.get("status") == "failed":
            print(f"FAIL job: {prog.get('error')}")
            return 1

    if not result:
        print("FAIL: timeout menunggu job")
        return 1

    print("job_result:")
    for k in ("sppb_no", "sppn_no", "superman_saved", "todo_matched", "message"):
        print(f"  {k}: {result.get(k)}")
    if result.get("extract_debug"):
        print("  extract_debug:", json.dumps(result["extract_debug"], ensure_ascii=False)[:1500])

    after = get_superman(no_do, token)
    print(f"superman_after_api: {after!r}")

    label = result.get("superman_saved") or " + ".join(
        p for p in [result.get("sppb_no"), result.get("sppn_no")] if p
    )
    if after:
        print(f"OK: Superman tersimpan -> {after}")
        return 0
    if label:
        print(f"WARN: Job punya nomor ({label}) tapi kolom Superman di laporan masih kosong")
        return 2
    print("FAIL: Job selesai tanpa nomor SPPn/SPPb")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())