"""Test Superman deklarasi for invoice 26.035 on production."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://monitoringpemasaran-production.up.railway.app"
NO_INV = "26.035/GKP-N1/BO/KKB/V/2026"


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

    print("=== STATUS ===")
    print(json.dumps(req("/api/superman/status", token=token), indent=2))

    print("=== DOC REQUIREMENTS ===")
    print(json.dumps(req(f"/api/superman/doc-requirements?no_invoice={q}", token=token), indent=2))

    print("=== PREVIEW ===")
    prev = req(f"/api/superman/preview?no_invoice={q}", token=token)
    print("jenis_form:", prev.get("jenis_form"))
    print("dpp_pokok:", prev.get("dpp_pokok"))
    print("referensi:", prev.get("referensi"))
    print("line_items:", prev.get("line_items"))
    print("support_docs:", prev.get("support_docs"))

    print("=== TODO INSPECT ===")
    try:
        todo = req(f"/api/superman/todo-inspect?no_invoice={q}", token=token)
        print(json.dumps(todo, indent=2, ensure_ascii=False)[:5000])
    except Exception as exc:
        print("todo-inspect error:", exc)

    print("=== START DEKLARASI ===")
    start = req(f"/api/superman/deklarasi/start?no_invoice={q}", "POST", token=token)
    job_id = start["job_id"]
    print("job_id:", job_id)

    for i in range(120):
        time.sleep(3)
        try:
            prog = req(f"/api/superman/deklarasi/progress?job_id={job_id}", token=token)
        except urllib.error.HTTPError as exc:
            print("poll HTTP", exc.code, "- retry")
            continue
        pct = prog.get("percent")
        status = prog.get("status")
        stage = prog.get("stage")
        elapsed = i * 3
        print("[%ss] %s%% %s - %s" % (elapsed, pct, status, stage))
        if status in ("completed", "failed"):
            if prog.get("error"):
                print("ERROR:", prog["error"])
            if prog.get("result"):
                print("RESULT:", json.dumps(prog["result"], indent=2, ensure_ascii=False)[:4000])
            return 0 if status == "completed" else 1

    print("TIMEOUT")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())