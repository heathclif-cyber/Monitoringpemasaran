"""Diagnostik jaringan mentah (bukan lewat Playwright/browser) ke server Superman.

Dipakai untuk mengisolasi apakah masalah koneksi (ERR_ALPN_NEGOTIATION_FAILED /
NS_BINDING_ABORTED yang terlihat di Chromium/Firefox) juga terjadi di level
HTTP client Python biasa, dan mencari ambang ukuran payload yang memicunya —
tanpa noise dari mesin browser.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

from services.superman.config import SupermanConfig

_SIZES_KB = [1, 20, 100, 300, 600, 1200, 2500]

_WAF_HEADER_HINTS = (
    "cf-ray",
    "cf-cache-status",
    "x-sucuri-id",
    "x-sucuri-cache",
    "server",
    "x-powered-by",
    "x-mod-security",
    "x-waf-status",
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
)


def _load_cookies(state_path: str) -> dict[str, str]:
    path = Path(state_path)
    if not path.is_file():
        return {}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {c["name"]: c["value"] for c in state.get("cookies", []) if c.get("name")}


def _inspect_headers(headers: httpx.Headers) -> dict[str, str]:
    found = {}
    for key in _WAF_HEADER_HINTS:
        val = headers.get(key)
        if val:
            found[key] = val
    return found


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
            "waf_headers": _inspect_headers(resp.headers),
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


def run_network_probe(
    target_path: str = "/__netdiag_probe_tidak_ada__",
    *,
    authenticated: bool = False,
) -> dict[str, object]:
    """Kirim POST dengan berbagai ukuran payload dari proses Python murni
    (bukan browser) ke server Superman — cari ambang ukuran yang gagal.

    Sengaja pakai path yang TIDAK ADA (bukan /spp/store) supaya tidak memicu
    efek samping bisnis apa pun (mis. konsumsi nomor urut SPPb/SPPn) di server
    Superman — yang diuji di sini murni lapisan koneksi TCP/TLS, terjadi
    sebelum request sampai ke handler rute manapun.
    """
    cfg = SupermanConfig.from_env()
    url = cfg.base_url.rstrip("/") + target_path

    cookies = _load_cookies(cfg.state_path) if authenticated else {}

    results: list[dict[str, object]] = []
    with httpx.Client(http2=False, verify=True, cookies=cookies) as client:
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
        "authenticated": authenticated,
        "cookies_loaded": list(cookies.keys()),
        "results": results,
        "last_success_size_kb": last_success["size_kb"] if last_success else None,
        "first_failure_size_kb": first_failure["size_kb"] if first_failure else None,
    }


def check_waf_signature() -> dict[str, object]:
    """GET halaman dashboard Superman (aman, cuma load halaman) dan periksa
    header respons untuk tanda-tanda WAF/anti-bot/rate-limit (Cloudflare,
    Sucuri, ModSecurity, dll) — untuk mengecek apakah traffic kita dikenali
    sebagai bot/DDoS oleh infrastruktur Superman."""
    cfg = SupermanConfig.from_env()
    cookies = _load_cookies(cfg.state_path)
    url = cfg.base_url.rstrip("/") + "/sppd"

    started = time.monotonic()
    try:
        with httpx.Client(http2=False, verify=True, cookies=cookies) as client:
            resp = client.get(url, timeout=25.0)
        elapsed = time.monotonic() - started
        body_lower = resp.text.lower()
        challenge_markers = [
            m
            for m in (
                "checking your browser",
                "captcha",
                "ddos protection",
                "cloudflare",
                "access denied",
                "blocked",
                "just a moment",
                "sucuri",
            )
            if m in body_lower
        ]
        return {
            "ok": True,
            "status_code": resp.status_code,
            "elapsed_s": round(elapsed, 2),
            "all_headers": dict(resp.headers),
            "waf_headers": _inspect_headers(resp.headers),
            "challenge_markers_in_body": challenge_markers,
            "is_login_page": "signin-username" in body_lower,
        }
    except Exception as exc:  # noqa: BLE001
        elapsed = time.monotonic() - started
        return {
            "ok": False,
            "error_type": type(exc).__name__,
            "error": str(exc)[:300],
            "elapsed_s": round(elapsed, 2),
        }
