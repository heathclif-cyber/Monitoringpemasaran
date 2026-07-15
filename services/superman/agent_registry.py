"""Registry agent desktop lokal (heartbeat + online status)."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger("superman.agent")

# Agent dianggap online jika heartbeat < TTL detik.
AGENT_TTL_SECONDS = int(os.getenv("SUPERMAN_AGENT_TTL", "45"))
_SYNC_INTERVAL_SECONDS = 1.0
_PERSIST_DEBOUNCE_SECONDS = 0.3


def _default_agents_path() -> Path:
    state_path = os.getenv(
        "SUPERMAN_STATE_PATH",
        os.path.join(os.path.dirname(__file__), "..", "..", "scripts", ".superman_state.json"),
    )
    return Path(state_path).resolve().parent / "superman_agents.json"


_AGENTS_FILE = Path(os.getenv("SUPERMAN_AGENTS_PATH", str(_default_agents_path())))


@dataclass
class AgentInfo:
    agent_id: str
    name: str = ""
    username: str = ""
    user_id: int = 0  # user app yang login di agent — job hanya untuk user ini
    last_seen: float = field(default_factory=time.time)
    hostname: str = ""
    version: str = "1"


_agents: dict[str, AgentInfo] = {}
_lock = threading.RLock()
_loaded = False
_last_disk_sync = 0.0
_persist_scheduled = False
_persist_dirty = False


def _agent_from_dict(data: dict[str, Any]) -> AgentInfo:
    try:
        uid = int(data.get("user_id") or 0)
    except (TypeError, ValueError):
        uid = 0
    return AgentInfo(
        agent_id=str(data.get("agent_id") or ""),
        name=str(data.get("name") or ""),
        username=str(data.get("username") or ""),
        user_id=uid,
        last_seen=float(data.get("last_seen") or time.time()),
        hostname=str(data.get("hostname") or ""),
        version=str(data.get("version") or "1"),
    )


def _read_file() -> dict[str, Any] | None:
    if not _AGENTS_FILE.exists():
        return None
    try:
        raw = json.loads(_AGENTS_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("gagal baca superman agents: %s", exc)
        return None
    return raw if isinstance(raw, dict) else None


def _write_file(payload: dict[str, Any]) -> None:
    try:
        _AGENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _AGENTS_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(_AGENTS_FILE)
    except Exception as exc:
        logger.warning("gagal persist superman agents: %s", exc)


def _persist_now() -> None:
    global _persist_dirty
    with _lock:
        payload = {aid: asdict(info) for aid, info in _agents.items()}
        _persist_dirty = False
    _write_file(payload)


def _schedule_persist() -> None:
    global _persist_scheduled, _persist_dirty
    _persist_dirty = True
    with _lock:
        if _persist_scheduled:
            return
        _persist_scheduled = True

    def _flush() -> None:
        global _persist_scheduled
        time.sleep(_PERSIST_DEBOUNCE_SECONDS)
        with _lock:
            dirty = _persist_dirty
            _persist_scheduled = False
        if dirty:
            _persist_now()

    threading.Thread(target=_flush, daemon=True, name="superman-agents-persist").start()


def _sync_from_disk(*, force: bool = False) -> None:
    global _last_disk_sync
    now = time.time()
    if not force and now - _last_disk_sync < _SYNC_INTERVAL_SECONDS:
        return
    raw = _read_file()
    if raw is None:
        with _lock:
            _last_disk_sync = now
        return
    with _lock:
        for aid, data in raw.items():
            if not isinstance(data, dict):
                continue
            agent = _agent_from_dict({**data, "agent_id": data.get("agent_id") or aid})
            existing = _agents.get(agent.agent_id)
            if existing and existing.last_seen >= agent.last_seen:
                continue
            _agents[agent.agent_id] = agent
        _last_disk_sync = now


def _ensure_loaded() -> None:
    global _loaded
    if _loaded:
        return
    with _lock:
        if _loaded:
            return
        raw = _read_file()
        if raw is not None:
            for aid, data in raw.items():
                if isinstance(data, dict):
                    agent = _agent_from_dict({**data, "agent_id": data.get("agent_id") or aid})
                    _agents[agent.agent_id] = agent
        _loaded = True
        _last_disk_sync = time.time()


def _is_online(info: AgentInfo, now: float | None = None) -> bool:
    now = now if now is not None else time.time()
    return (now - info.last_seen) <= AGENT_TTL_SECONDS


def heartbeat(
    *,
    agent_id: str | None = None,
    name: str = "",
    username: str = "",
    user_id: int = 0,
    hostname: str = "",
    version: str = "1",
) -> dict[str, Any]:
    """Daftarkan / perbarui agent milik user login. Kembalikan agent_id + status user."""
    _ensure_loaded()
    _sync_from_disk()
    aid = (agent_id or "").strip() or str(uuid.uuid4())
    now = time.time()
    try:
        uid = int(user_id or 0)
    except (TypeError, ValueError):
        uid = 0
    with _lock:
        existing = _agents.get(aid)
        info = AgentInfo(
            agent_id=aid,
            name=(name or (existing.name if existing else "") or hostname or aid[:8]).strip(),
            username=(username or (existing.username if existing else "")).strip(),
            user_id=uid or (existing.user_id if existing else 0),
            last_seen=now,
            hostname=(hostname or (existing.hostname if existing else "")).strip(),
            version=(version or "1").strip(),
        )
        _agents[aid] = info
    _schedule_persist()
    mine = list_online(user_id=info.user_id) if info.user_id else list_online()
    return {
        "ok": True,
        "agent_id": aid,
        "name": info.name,
        "user_id": info.user_id,
        "username": info.username,
        "ttl_seconds": AGENT_TTL_SECONDS,
        "online_count": len(mine),
        "mine_online": len(mine) > 0,
        "agents": mine,
    }


def get_agent(agent_id: str) -> AgentInfo | None:
    _ensure_loaded()
    _sync_from_disk()
    aid = (agent_id or "").strip()
    if not aid:
        return None
    with _lock:
        return _agents.get(aid)


def list_online(*, user_id: int | None = None) -> list[dict[str, Any]]:
    """Daftar agent online. Filter user_id → hanya agent milik user itu."""
    _ensure_loaded()
    _sync_from_disk()
    now = time.time()
    want_uid: int | None = None
    if user_id is not None:
        try:
            want_uid = int(user_id)
        except (TypeError, ValueError):
            want_uid = None
    with _lock:
        rows = []
        for a in _agents.values():
            if not _is_online(a, now):
                continue
            if want_uid is not None and int(a.user_id or 0) != want_uid:
                continue
            rows.append(
                {
                    "agent_id": a.agent_id,
                    "name": a.name,
                    "username": a.username,
                    "user_id": int(a.user_id or 0),
                    "hostname": a.hostname,
                    "last_seen": a.last_seen,
                    "age_seconds": round(now - a.last_seen, 1),
                    "version": a.version,
                }
            )
    rows.sort(key=lambda r: r["last_seen"], reverse=True)
    return rows


def any_online(*, user_id: int | None = None) -> bool:
    return len(list_online(user_id=user_id)) > 0


def get_status(*, user_id: int | None = None, username: str = "") -> dict[str, Any]:
    """Status agent. Jika user_id diisi: online = agent milik user itu saja."""
    mine = list_online(user_id=user_id) if user_id is not None else list_online()
    all_online = list_online() if user_id is not None else mine
    online = len(mine) > 0
    who = (username or "").strip() or (f"user_id={user_id}" if user_id else "user")
    return {
        "online": online,
        "online_count": len(mine),
        "mine_online": online,
        "user_id": user_id,
        "ttl_seconds": AGENT_TTL_SECONDS,
        "agents": mine,
        "all_online_count": len(all_online),
        "hint": (
            f"Agent lokal Anda online ({who}) — Superman dijalankan di PC agent Anda."
            if online
            else (
                f"Agent lokal Anda offline. Di PC yang dipakai login, jalankan: "
                f"python scripts/superman_agent.py watch --api <URL_RAILWAY> "
                f"--username <user_app> --password <pass>"
            )
        ),
    }
