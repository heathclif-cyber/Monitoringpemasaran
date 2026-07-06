"""Diagnostik jaringan mentah (bukan lewat Playwright/browser) ke server Superman.

Dipakai untuk mengisolasi apakah masalah koneksi (ERR_ALPN_NEGOTIATION_FAILED /
NS_BINDING_ABORTED yang terlihat di Chromium/Firefox) juga terjadi di level
HTTP client Python biasa, dan mencari ambang ukuran payload yang memicunya —
tanpa noise dari mesin browser.
"""

from __future__ import annotations

import time

import httpx

from services.superman.config import SupermanConfig

_SIZES_KB = [1, 20, 100, 300, 600, 1200, 2500]


def _post_probe(client: httpx.Client, url: str, size_kb: int) -> dict[str, object]:
    body = b"x" * (size_kb * 1024)
    files = {"dummy_file": ("probe.bin", body, "application/octet-stream")}
    data = {"status_btn": "0"}
    started = time.monotonic()
    try:
        resp = client.post(url, data=data, files=files, timeout=25.0)
        elapsed = time.monotonic() - started
        return {
            "size_kb": size_kb,
            "ok": True,
            "status_code": resp.status_code,
            "elapsed_s": round(elapsed, 2),
            "response_len": len(resp.content),
        }
    except Exception as exc:  # noqa: BLE001 - kita ingin catat semua jenis exception
        elapsed = time.monotonic() - started
        return {
            "size_kb": size_kb,
            "ok": False,
            "error_type": type(exc).__name__,
            "error": str(exc)[:300],
            "elapsed_s": round(elapsed, 2),
        }


def run_network_probe(target_path: str = "/__netdiag_probe_tidak_ada__") -> dict[str, object]:
    """Kirim POST dengan berbagai ukuran payload dari proses Python murni
    (bukan browser) ke server Superman — cari ambang ukuran yang gagal.

    Sengaja pakai path yang TIDAK ADA (bukan /spp/store) supaya tidak memicu
    efek samping bisnis apa pun (mis. konsumsi nomor urut SPPb/SPPn) di server
    Superman — yang diuji di sini murni lapisan koneksi TCP/TLS, terjadi
    sebelum request sampai ke handler rute manapun.
    """
    cfg = SupermanConfig.from_env()
    url = cfg.base_url.rstrip("/") + target_path

    results: list[dict[str, object]] = []
    with httpx.Client(http2=False, verify=True) as client:
        for size_kb in _SIZES_KB:
            results.append(_post_probe(client, url, size_kb))

    first_failure = next((r for r in results if not r.get("ok")), None)
    last_success = None
    for r in results:
        if r.get("ok"):
            last_success = r
        else:
            break

    return {
        "target": url,
        "results": results,
        "last_success_size_kb": last_success["size_kb"] if last_success else None,
        "first_failure_size_kb": first_failure["size_kb"] if first_failure else None,
    }
