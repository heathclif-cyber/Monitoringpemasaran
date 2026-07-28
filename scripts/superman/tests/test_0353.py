"""Test Superman deklarasi for tender invoice 0353 on production."""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://monitoringpemasaran-production.up.railway.app"
NO_INV = "ADD-TENDER/0353/HO-SUPCO/WASTE-L/N-I/II/2026"


def req(
    path: str,
    method: str = "GET",
    data: dict | None = None,
    token: str | None = None,
    retries: int = 5,
):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data is not None else None
    for attempt in range(retries):
        try:
            r = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
            with urllib.request.urlopen(r, timeout=180) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (502, 503, 504) and attempt < retries - 1:
                time.sleep(3)
                continue
            raise


def main() -> int:
    login = req("/api/auth/login", "POST", {"username": "admin", "password": "admin123"})
    token = login["access_token"]
    q = urllib.parse.quote(NO_INV)

    print("=== PREVIEW ===")
    prev = req(f"/api/superman/preview?no_invoice={q}", token=token)
    print("jenis_form:", prev.get("jenis_form"))
    print("dpp_pokok:", prev.get("dpp_pokok"), "pph:", prev.get("pph_nominal"))
    print("referensi:", prev.get("referensi"))

    inv_before = req(f"/api/invoice/{q}", token=token)
    print("superman before:", inv_before.get("superman"))

    print("=== TODO INSPECT (before) ===")
    try:
        todo = req(f"/api/superman/todo-inspect?no_invoice={q}", token=token)
        print("rows:", todo.get("todo_rows"), "top:", len(todo.get("top_scores") or []))
        if todo.get("row_samples"):
            print("samples:", json.dumps(todo["row_samples"][:3], ensure_ascii=False))
    except Exception as exc:
        print("todo-inspect error:", exc)

    print("=== START DEKLARASI ===")
    try:
        start = req(f"/api/superman/deklarasi/start?no_invoice={q}", "POST", token=token)
    except urllib.error.HTTPError as exc:
        if exc.code == 409:
            detail = json.loads(exc.read()).get("detail", "")
            print("ACTIVE JOB:", detail)
            return 2
        raise
    job_id = start["job_id"]
    print("job_id:", job_id)

    result = None
    for i in range(250):
        time.sleep(3)
        try:
            prog = req(f"/api/superman/deklarasi/progress?job_id={job_id}", token=token)
        except urllib.error.HTTPError as exc:
            print("poll HTTP", exc.code)
            continue
        pct = prog.get("percent")
        status = prog.get("status")
        stage = prog.get("stage")
        print("[%ss] %s%% %s - %s" % (i * 3, pct, status, stage))
        if status in ("completed", "failed"):
            if prog.get("error"):
                print("ERROR:", prog["error"])
            result = prog.get("result")
            break

    if not result:
        print("TIMEOUT")
        return 1

    print("=== RESULT ===")
    print(json.dumps(result, indent=2, ensure_ascii=False)[:6000])

    inv_after = req(f"/api/invoice/{q}", token=token)
    print("superman after:", inv_after.get("superman"))

    ok = bool(result.get("ok") and inv_after.get("superman"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())