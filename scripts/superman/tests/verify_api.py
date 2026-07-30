"""Verifikasi kolom Superman via API (tanpa browser)."""
from __future__ import annotations

import json
import urllib.request

BASE = "https://monitoringpemasaran-production.up.railway.app"


def main() -> int:
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
    token = login["access_token"]
    rows = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                BASE + "/api/laporan?fresh=1",
                headers={"Authorization": f"Bearer {token}"},
            )
        ).read()
    )

    print("=== Verifikasi Superman (API) ===")
    targets = [
        "0003/SPPB/GKP-PTPN24/KKB/SG35/2026",
        "0004/SPPB/GKP-PTPN24/KKB/SG35/2026",
    ]
    ok = True
    for no_do in targets:
        row = next((r for r in rows if r.get("No_DO") == no_do), None)
        if not row:
            print(f"FAIL {no_do}: tidak ada di laporan")
            ok = False
            continue
        superman = (row.get("Superman") or "").strip()
        if superman:
            print(f"OK   {no_do} -> {superman}")
        else:
            print(f"FAIL {no_do}: Superman kosong")
            ok = False

    gula = [r for r in rows if "GKP" in (r.get("No_DO") or "")]
    with_sm = sum(1 for r in gula if (r.get("Superman") or "").strip())
    print(f"gula: {with_sm}/{len(gula)} punya Superman")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())