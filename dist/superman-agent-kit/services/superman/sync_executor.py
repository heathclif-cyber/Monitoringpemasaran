"""Jalankan Playwright sync API di thread terpisah (tanpa asyncio loop).

FastAPI menjalankan endpoint sync lewat anyio worker thread yang masih
terikat event loop asyncio — Playwright sync API menolak itu. Semua operasi
browser yang dipanggil dari request HTTP harus melalui executor ini.

Catatan: max_workers=2 agar captcha tetap bisa jalan saat job deklarasi
masih memegang 1 worker (sebelumnya captcha ngantri → UI loading lalu 500).
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import Callable, TypeVar

# 2 worker: 1 untuk job deklarasi panjang, 1 cadangan captcha/login/status.
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="superman-pw")

T = TypeVar("T")


def _call_without_running_loop(fn: Callable[..., T], *args, **kwargs) -> T:
    """Playwright Sync menolak thread yang punya running asyncio loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # Tidak ada loop di thread ini — jalur normal.
        return fn(*args, **kwargs)

    # Ada loop (jarang di worker ThreadPool): isolasi ke thread baru.
    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="superman-pw-nest") as nested:
        return nested.submit(fn, *args, **kwargs).result(timeout=120)


def run_playwright_sync(
    fn: Callable[..., T],
    /,
    *args,
    timeout: float | None = None,
    **kwargs,
) -> T:
    """Jalankan fn di thread Playwright.

    timeout=None (default): tanpa batas — untuk job deklarasi panjang.
    timeout=...: captcha/login agar UI tidak loading tanpa akhir.
    """
    future = _executor.submit(_call_without_running_loop, fn, *args, **kwargs)
    try:
        if timeout is None:
            return future.result()
        return future.result(timeout=timeout)
    except FuturesTimeout as exc:
        future.cancel()
        raise RuntimeError(
            "Timeout menunggu browser Superman di server (Railway). "
            "Coba captcha lagi, atau gunakan agent lokal di PC."
        ) from exc
