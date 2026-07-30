"""Log error Superman otomatis (JSONL) untuk investigasi / AI agent lain.

Setiap baris = 1 event JSON. Persist di volume (default: sibling SUPERMAN_STATE_PATH).

Baca terbaru:
  GET /api/superman/error-log?limit=50
  atau file: SUPERMAN_ERROR_LOG_PATH / /data/superman_error_log.jsonl

Jangan taruh secret (password, full cookie, token) di context.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger("superman.error_log")

_lock = threading.Lock()
_MAX_FILE_BYTES = 8 * 1024 * 1024  # rotate soft cap ~8MB
_KEEP_RECENT_LINES = 2000


def _default_log_path() -> Path:
    state_path = os.getenv(
        "SUPERMAN_STATE_PATH",
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "scripts",
            ".superman_state.json",
        ),
    )
    return Path(state_path).resolve().parent / "superman_error_log.jsonl"


def log_path() -> Path:
    return Path(os.getenv("SUPERMAN_ERROR_LOG_PATH", str(_default_log_path())))


def _classify(message: str, kind: str | None = None) -> str:
    if kind:
        return kind
    lower = (message or "").lower()
    if "captcha" in lower and ("timeout" in lower or "jaringan" in lower or "3x"):
        return "captcha_network_timeout"
    if "captcha" in lower:
        return "captcha_error"
    if "ns_binding" in lower or "alpn" in lower or "/spp/store" in lower:
        return "store_network_abort"
    if "gettodo" in lower or "to do" in lower:
        return "todo_fetch_error"
    if "melebihi" in lower and "menit" in lower:
        return "job_wall_timeout"
    if "session" in lower or "428" in lower:
        return "session_invalid"
    if "timeout" in lower:
        return "timeout"
    return "unknown"


def _rotate_if_needed(path: Path) -> None:
    try:
        if not path.is_file() or path.stat().st_size < _MAX_FILE_BYTES:
            return
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        keep = lines[-_KEEP_RECENT_LINES:]
        bak = path.with_suffix(path.suffix + ".bak")
        try:
            path.replace(bak)
        except OSError:
            pass
        path.write_text("\n".join(keep) + ("\n" if keep else ""), encoding="utf-8")
    except Exception as exc:
        logger.warning("rotate error log gagal: %s", exc)


def _safe_context(context: dict[str, Any] | None) -> dict[str, Any]:
    if not context:
        return {}
    out: dict[str, Any] = {}
    blocked = ("password", "cookie", "token", "authorization", "secret", "image_base64")
    for key, val in context.items():
        lk = str(key).lower()
        if any(b in lk for b in blocked):
            continue
        try:
            json.dumps(val, default=str)
            out[key] = val
        except Exception:
            out[key] = str(val)[:2000]
    # Truncate huge nested blobs
    raw = json.dumps(out, ensure_ascii=False, default=str)
    if len(raw) > 12000:
        return {"_truncated": True, "preview": raw[:12000]}
    return out


def log_superman_error(
    *,
    source: str,
    message: str,
    kind: str | None = None,
    severity: str = "error",
    no_invoice: str = "",
    job_id: str = "",
    executor: str = "",
    http_status: int | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Tulis 1 baris error. Return event (untuk response/debug). Gagal tulis = no-op aman."""
    event = {
        "id": str(uuid.uuid4()),
        "ts": time.time(),
        "ts_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "severity": severity,
        "kind": _classify(message, kind),
        "source": source,
        "message": (message or "")[:2000],
        "no_invoice": (no_invoice or "")[:300],
        "job_id": (job_id or "")[:80],
        "executor": (executor or "")[:40],
        "http_status": http_status,
        "context": _safe_context(context),
    }
    path = log_path()
    line = json.dumps(event, ensure_ascii=False, default=str) + "\n"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with _lock:
            _rotate_if_needed(path)
            with path.open("a", encoding="utf-8") as fh:
                fh.write(line)
        logger.error(
            "superman_error kind=%s source=%s invoice=%s msg=%s",
            event["kind"],
            source,
            event["no_invoice"] or "-",
            event["message"][:200],
        )
    except Exception as exc:
        logger.warning("gagal tulis superman error log: %s", exc)
    return event


def read_recent_errors(limit: int = 50) -> list[dict[str, Any]]:
    """Baca N event terbaru (dari akhir file)."""
    limit = max(1, min(int(limit or 50), 500))
    path = log_path()
    if not path.is_file():
        return []
    try:
        # Baca tail sederhana
        with path.open("rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            chunk = min(size, 512_000)
            fh.seek(max(0, size - chunk))
            data = fh.read().decode("utf-8", errors="replace")
        lines = [ln for ln in data.splitlines() if ln.strip()]
        # Jika seek di tengah baris, buang baris pertama rusak
        if size > chunk and lines:
            lines = lines[1:]
        rows: list[dict[str, Any]] = []
        for ln in lines[-limit:]:
            try:
                rows.append(json.loads(ln))
            except json.JSONDecodeError:
                continue
        return list(reversed(rows))  # newest first
    except Exception as exc:
        logger.warning("gagal baca superman error log: %s", exc)
        return []
