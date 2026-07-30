"""One-shot: start Superman deklarasi via local agent for a fixed invoice."""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://monitoringpemasaran-production.up.railway.app"
NO_INV = "R08D-RO/INV/2026.07.15-1"
USER = "admin"
PASSWORD = "admin123"


def req(path: str, method: str = "GET", data: dict | None = None, token: str | None = None, timeout: int = 180):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            j = json.loads(raw)
        except Exception:
            j = {"raw": raw}
        return e.code, j


def main() -> int:
    code, login = req("/api/auth/login", "POST", {"username": USER, "password": PASSWORD})
    if code != 200 or not login.get("access_token"):
        print("login failed", code, login)
        return 1
    token = login["access_token"]
    q = urllib.parse.quote(NO_INV, safe="")

    c, st = req("/api/superman/agent/status", token=token)
    print("agent status", c, json.dumps(st, ensure_ascii=False)[:800])
    if not st.get("online") and not st.get("mine_online"):
        print("Agent offline — jalankan commands/agent.py watch dulu")
        return 2

    c, start = req(
        f"/api/superman/deklarasi/start?no_invoice={q}&executor=agent",
        "POST",
        token=token,
    )
    print("start", c, json.dumps(start, ensure_ascii=False))
    if c != 200:
        return 1
    job_id = start["job_id"]
    print("job_id", job_id)

    for i in range(220):
        time.sleep(3)
        c, prog = req(f"/api/superman/deklarasi/progress?job_id={job_id}", token=token)
        pct = prog.get("percent")
        status = prog.get("status")
        stage = prog.get("stage")
        print(f"[{i * 3}s] {pct}% {status} - {stage}")
        if prog.get("error"):
            print("ERROR:", prog.get("error"))
        if status in ("completed", "failed"):
            if prog.get("result"):
                print("RESULT:", json.dumps(prog.get("result"), ensure_ascii=False, indent=2)[:6000])
            break
    else:
        print("TIMEOUT")
        return 1

    c, inv = req(f"/api/invoice/{q}", token=token)
    print("superman after:", inv.get("superman") if c == 200 else inv)
    return 0 if prog.get("status") == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
