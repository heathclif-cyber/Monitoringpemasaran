#!/usr/bin/env python3
"""Probe cepat ke portal Superman (HTTP). Jalankan lokal atau via railway run."""
from __future__ import annotations

import time

import httpx

URL = "https://superman.ptpn1.co.id/"


def main() -> int:
    t0 = time.time()
    try:
        with httpx.Client(http2=False, timeout=40.0, follow_redirects=True) as client:
            r = client.get(URL)
        body = r.text or ""
        print(
            "status",
            r.status_code,
            "t",
            round(time.time() - t0, 1),
            "len",
            len(body),
            "login",
            "signin-username" in body,
            "captcha",
            "captcha" in body.lower(),
        )
        return 0
    except Exception as exc:
        print("ERR", type(exc).__name__, exc, "t", round(time.time() - t0, 1))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
