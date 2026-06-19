"""Login Superman di Railway via captcha API + OCR lokal."""
from __future__ import annotations

import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services.superman.captcha import solve_math_captcha

BASE = "https://monitoringpemasaran-production.up.railway.app"
MAX_ROUNDS = 25


def api(method: str, path: str, token: str | None = None, body: dict | None = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def main() -> int:
    login = api("POST", "/api/auth/login", None, {"username": "admin", "password": "admin123"})
    token = login["access_token"]
    print("app login OK")

    challenge = api("GET", "/api/superman/captcha", token)
    challenge_id = challenge["challenge_id"]

    for attempt in range(1, MAX_ROUNDS + 1):
        img_b64 = challenge.get("image_base64") or ""
        answer, raw = solve_math_captcha(base64.b64decode(img_b64))
        print(f"attempt {attempt}: ocr={raw!r} answer={answer!r}")
        if not answer:
            challenge = api(
                "POST",
                f"/api/superman/captcha/refresh?challenge_id={challenge_id}",
                token,
            )
            challenge_id = challenge["challenge_id"]
            continue

        try:
            result = api(
                "POST",
                "/api/superman/captcha/verify",
                token,
                {"challenge_id": challenge_id, "answer": answer},
            )
        except urllib.error.HTTPError as exc:
            print(f"verify HTTP {exc.code}: {exc.read().decode()}")
            return 1

        if result.get("ok"):
            print("superman login OK on Railway")
            status = api("GET", "/api/superman/status", token)
            print(f"session_valid={status.get('session_valid')} path={status.get('session_path')}")
            return 0

        print(f"fail: {result.get('error')} kind={result.get('failure_kind')}")
        if result.get("failure_kind") in ("credentials", "lockout"):
            return 1
        challenge_id = result.get("challenge_id") or challenge_id
        challenge = result

    print("FAIL: captcha OCR exhausted")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())