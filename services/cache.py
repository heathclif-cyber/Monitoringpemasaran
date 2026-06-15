"""In-memory TTL cache for read-heavy API endpoints."""
import time
from threading import Lock
from typing import Any

_DEFAULT_TTL = 120  # seconds


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires, value = entry
            if time.monotonic() > expires:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: int = _DEFAULT_TTL) -> None:
        with self._lock:
            self._store[key] = (time.monotonic() + ttl, value)

    def invalidate_prefix(self, prefix: str) -> None:
        with self._lock:
            for key in [k for k in self._store if k.startswith(prefix)]:
                del self._store[key]

    def invalidate_reporting(self) -> None:
        self.invalidate_prefix("laporan:")
        self.invalidate_prefix("dashboard:")


api_cache = TTLCache()