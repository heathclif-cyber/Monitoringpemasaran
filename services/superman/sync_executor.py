"""Jalankan Playwright sync API di thread terpisah (tanpa asyncio loop).

FastAPI menjalankan endpoint sync lewat anyio worker thread yang masih
terikat event loop asyncio — Playwright sync API menolak itu. Semua operasi
browser yang dipanggil dari request HTTP harus melalui executor ini.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable, TypeVar

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="superman-pw")

T = TypeVar("T")


def run_playwright_sync(fn: Callable[..., T], /, *args, **kwargs) -> T:
    future = _executor.submit(lambda: fn(*args, **kwargs))
    return future.result()