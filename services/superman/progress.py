"""Pelacakan progres job deklarasi Superman (in-memory + persist ke disk)."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal

logger = logging.getLogger("superman.job")

JobStatus = Literal["pending", "running", "completed", "failed"]
JobExecutor = Literal["server", "agent"]

ProgressCallback = Callable[[int, str], None]

TTL_SECONDS = 3600
STALE_RUNNING_SECONDS = 420
STALE_ZERO_PERCENT_SECONDS = 90
# Job executor=agent menunggu claim: lebih longgar (agent bisa sebentar offline).
STALE_AGENT_PENDING_SECONDS = 600
STALE_AGENT_ZERO_PERCENT_SECONDS = 180
_SYNC_INTERVAL_SECONDS = 1.5
_PERSIST_DEBOUNCE_SECONDS = 0.35
_INTERRUPTED_MSG = (
    "Proses terputus (server restart). Tutup dialog ini, lalu klik "
    "'Buat Deklarasi Superman' lagi."
)


def _default_jobs_path() -> Path:
    state_path = os.getenv(
        "SUPERMAN_STATE_PATH",
        os.path.join(os.path.dirname(__file__), "..", "..", "scripts", ".superman_state.json"),
    )
    return Path(state_path).resolve().parent / "superman_jobs.json"


_JOBS_FILE = Path(os.getenv("SUPERMAN_JOBS_PATH", str(_default_jobs_path())))


@dataclass
class SupermanJob:
    job_id: str
    no_invoice: str
    no_pembayaran: str = ""
    status: JobStatus = "pending"
    percent: int = 0
    stage: str = "Menunggu..."
    result: dict[str, Any] | None = None
    error: str | None = None
    executor: str = "server"  # server | agent
    agent_id: str = ""
    # User app yang memulai job — agent claim harus user_id sama
    user_id: int = 0
    username: str = ""
    claimed_at: float | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


_jobs: dict[str, SupermanJob] = {}
_lock = threading.RLock()
_loaded = False
_last_disk_sync = 0.0
_persist_scheduled = False
_persist_dirty = False


def _job_from_dict(data: dict[str, Any]) -> SupermanJob:
    claimed = data.get("claimed_at")
    try:
        uid = int(data.get("user_id") or 0)
    except (TypeError, ValueError):
        uid = 0
    return SupermanJob(
        job_id=str(data.get("job_id") or ""),
        no_invoice=str(data.get("no_invoice") or ""),
        no_pembayaran=str(data.get("no_pembayaran") or ""),
        status=data.get("status") or "pending",
        percent=int(data.get("percent") or 0),
        stage=str(data.get("stage") or "Menunggu..."),
        result=data.get("result"),
        error=data.get("error"),
        executor=str(data.get("executor") or "server"),
        agent_id=str(data.get("agent_id") or ""),
        user_id=uid,
        username=str(data.get("username") or ""),
        claimed_at=float(claimed) if claimed is not None else None,
        created_at=float(data.get("created_at") or time.time()),
        updated_at=float(data.get("updated_at") or time.time()),
    )


def _read_jobs_file() -> dict[str, Any] | None:
    if not _JOBS_FILE.exists():
        return None
    try:
        raw = json.loads(_JOBS_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("gagal baca superman jobs: %s", exc)
        return None
    return raw if isinstance(raw, dict) else None


def _write_jobs_file(payload: dict[str, Any]) -> None:
    try:
        _JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _JOBS_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(_JOBS_FILE)
    except Exception as exc:
        logger.warning("gagal persist superman jobs: %s", exc)


def _merge_job_from_disk(data: dict[str, Any], job_id: str, *, mark_interrupted: bool) -> None:
    job = _job_from_dict({**data, "job_id": data.get("job_id") or job_id})
    if mark_interrupted and job.status in ("pending", "running"):
        job.status = "failed"
        job.error = _INTERRUPTED_MSG
        job.updated_at = time.time()
    existing = _jobs.get(job.job_id)
    if existing and existing.updated_at >= job.updated_at:
        return
    _jobs[job.job_id] = job


def _merge_jobs_from_raw(raw: dict[str, Any], *, mark_interrupted: bool = False) -> None:
    for job_id, data in raw.items():
        if isinstance(data, dict):
            _merge_job_from_disk(data, job_id, mark_interrupted=mark_interrupted)


def _persist_jobs_now() -> None:
    global _persist_dirty
    with _lock:
        payload = {job_id: asdict(job) for job_id, job in _jobs.items()}
        _persist_dirty = False
    _write_jobs_file(payload)


def _schedule_persist() -> None:
    global _persist_scheduled, _persist_dirty
    _persist_dirty = True
    with _lock:
        if _persist_scheduled:
            return
        _persist_scheduled = True

    def _flush_later() -> None:
        global _persist_scheduled
        time.sleep(_PERSIST_DEBOUNCE_SECONDS)
        with _lock:
            dirty = _persist_dirty
            _persist_scheduled = False
        if dirty:
            _persist_jobs_now()

    threading.Thread(target=_flush_later, daemon=True, name="superman-jobs-persist").start()


def _sync_from_disk(*, mark_interrupted: bool = False, force: bool = False) -> None:
    """Muat ulang job dari disk — penting untuk multi-instance Railway."""
    global _last_disk_sync
    now = time.time()
    if not force and now - _last_disk_sync < _SYNC_INTERVAL_SECONDS:
        return

    raw = _read_jobs_file()
    if raw is None:
        with _lock:
            _last_disk_sync = now
        return

    with _lock:
        _merge_jobs_from_raw(raw, mark_interrupted=mark_interrupted)
        _last_disk_sync = now


def _ensure_loaded() -> None:
    global _loaded
    if _loaded:
        return
    with _lock:
        if _loaded:
            return
        raw = _read_jobs_file()
        if raw is not None:
            _merge_jobs_from_raw(raw, mark_interrupted=True)
        _loaded = True
        _last_disk_sync = time.time()


def _cleanup_expired() -> None:
    _ensure_loaded()
    now = time.time()
    expired: list[str] = []
    with _lock:
        expired = [
            job_id
            for job_id, job in _jobs.items()
            if now - job.updated_at > TTL_SECONDS
        ]
        for job_id in expired:
            _jobs.pop(job_id, None)
    if expired:
        _schedule_persist()


def create_job(
    no_invoice: str,
    no_pembayaran: str = "",
    *,
    executor: str = "server",
    user_id: int = 0,
    username: str = "",
) -> str:
    _cleanup_expired()
    job_id = str(uuid.uuid4())
    exec_mode = (executor or "server").strip().lower()
    if exec_mode not in ("server", "agent"):
        exec_mode = "server"
    try:
        uid = int(user_id or 0)
    except (TypeError, ValueError):
        uid = 0
    uname = (username or "").strip()
    stage = (
        f"Menunggu agent lokal ({uname or 'user'}) di PC..."
        if exec_mode == "agent"
        else "Menunggu..."
    )
    with _lock:
        _jobs[job_id] = SupermanJob(
            job_id=job_id,
            no_invoice=no_invoice.strip(),
            no_pembayaran=no_pembayaran.strip(),
            executor=exec_mode,
            status="pending",
            stage=stage,
            user_id=uid,
            username=uname,
        )
    _schedule_persist()
    return job_id


def update_job(job_id: str, percent: int, stage: str) -> None:
    _ensure_loaded()
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if job.status not in ("completed", "failed"):
            job.status = "running"
        job.percent = max(0, min(100, percent))
        job.stage = stage
        job.updated_at = time.time()
    _schedule_persist()


def complete_job(job_id: str, result: dict[str, Any]) -> None:
    _ensure_loaded()
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "completed"
        job.percent = 100
        job.stage = "Selesai"
        job.result = result
        job.updated_at = time.time()
    _persist_jobs_now()


def fail_job(
    job_id: str,
    error: str,
    *,
    debug: dict[str, Any] | None = None,
) -> None:
    _ensure_loaded()
    invoice_ref = "?"
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        invoice_ref = job.no_invoice
        job.status = "failed"
        job.error = error
        job.updated_at = time.time()
    _persist_jobs_now()
    logger.error(
        "deklarasi failed job_id=%s invoice=%s error=%s debug=%s",
        job_id,
        invoice_ref,
        error,
        debug or {},
    )


def _fail_stale_job(job: SupermanJob) -> None:
    job.status = "failed"
    job.error = (
        "Proses Superman terlalu lama (kemungkinan macet di tahap simpan). "
        "Tutup dialog ini, lalu klik 'Buat Deklarasi Superman' lagi atau "
        "gunakan Pulihkan dari To Do List."
    )
    job.updated_at = time.time()
    logger.error(
        "deklarasi stale job_id=%s invoice=%s percent=%s stage=%s",
        job.job_id,
        job.no_invoice,
        job.percent,
        job.stage,
    )


def _is_stale_running(job: SupermanJob, now: float) -> bool:
    age = now - job.updated_at
    is_agent = (job.executor or "server") == "agent"
    # Menunggu claim agent — jangan gagal di 90 detik.
    if is_agent and job.status == "pending" and not (job.agent_id or "").strip():
        return age > STALE_AGENT_PENDING_SECONDS
    if job.percent <= 0 and age > (
        STALE_AGENT_ZERO_PERCENT_SECONDS if is_agent else STALE_ZERO_PERCENT_SECONDS
    ):
        return True
    return age > STALE_RUNNING_SECONDS


def claim_agent_job(
    agent_id: str,
    *,
    job_id: str | None = None,
    user_id: int = 0,
) -> SupermanJob | None:
    """Ambil 1 job executor=agent milik user_id yang sama (atau job_id spesifik)."""
    _cleanup_expired()
    _sync_from_disk(force=True)
    aid = (agent_id or "").strip()
    if not aid:
        return None
    try:
        uid = int(user_id or 0)
    except (TypeError, ValueError):
        uid = 0
    if uid <= 0:
        return None
    want = (job_id or "").strip() or None
    now = time.time()
    claimed: SupermanJob | None = None
    with _lock:
        candidates: list[SupermanJob] = []
        for job in _jobs.values():
            if (job.executor or "server") != "agent":
                continue
            if job.status != "pending":
                continue
            if (job.agent_id or "").strip():
                continue
            # Hanya job milik user yang sama (agent user A tidak ambil job user B)
            if int(job.user_id or 0) != uid:
                continue
            if want and job.job_id != want:
                continue
            if _is_stale_running(job, now):
                _fail_stale_job(job)
                continue
            candidates.append(job)
        if not candidates:
            if want:
                existing = _jobs.get(want)
                if (
                    existing
                    and (existing.executor or "") == "agent"
                    and existing.status in ("pending", "running")
                    and (existing.agent_id or "").strip() == aid
                    and int(existing.user_id or 0) == uid
                ):
                    return existing
            return None
        candidates.sort(key=lambda j: j.created_at)
        job = candidates[0]
        job.agent_id = aid
        job.claimed_at = now
        job.status = "running"
        job.percent = max(job.percent, 1)
        job.stage = f"Agent {aid[:8]} (user {uid}) mengambil job..."
        job.updated_at = now
        claimed = job
    _persist_jobs_now()
    return claimed


def list_waiting_agent_jobs(*, user_id: int | None = None) -> list[dict[str, Any]]:
    _cleanup_expired()
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
        for job in _jobs.values():
            if (job.executor or "server") != "agent":
                continue
            if job.status != "pending" or (job.agent_id or "").strip():
                continue
            if want_uid is not None and int(job.user_id or 0) != want_uid:
                continue
            if _is_stale_running(job, now):
                continue
            rows.append(
                {
                    "job_id": job.job_id,
                    "no_invoice": job.no_invoice,
                    "no_pembayaran": job.no_pembayaran,
                    "user_id": int(job.user_id or 0),
                    "username": job.username or "",
                    "created_at": job.created_at,
                    "stage": job.stage,
                }
            )
    rows.sort(key=lambda r: r["created_at"])
    return rows


def find_latest_job_for_invoice(no_invoice: str) -> SupermanJob | None:
    ref = no_invoice.strip()
    if not ref:
        return None
    _cleanup_expired()
    _sync_from_disk()
    with _lock:
        matches = [j for j in _jobs.values() if j.no_invoice == ref]
    if not matches:
        return None
    return max(matches, key=lambda j: j.updated_at)


def find_active_job_for_invoice(no_invoice: str) -> SupermanJob | None:
    ref = no_invoice.strip()
    if not ref:
        return None
    _cleanup_expired()
    _sync_from_disk()
    now = time.time()
    stale = False
    with _lock:
        for job in _jobs.values():
            if job.no_invoice != ref or job.status not in ("pending", "running"):
                continue
            if _is_stale_running(job, now):
                _fail_stale_job(job)
                stale = True
                continue
            return job
    if stale:
        _persist_jobs_now()
    return None


def get_job(job_id: str) -> SupermanJob | None:
    _cleanup_expired()
    _sync_from_disk()
    stale = False
    with _lock:
        job = _jobs.get(job_id.strip())
        if (
            job
            and job.status in ("pending", "running")
            and _is_stale_running(job, time.time())
        ):
            _fail_stale_job(job)
            stale = True
    if stale:
        _persist_jobs_now()
    with _lock:
        return _jobs.get(job_id.strip())


def make_progress_callback(job_id: str) -> ProgressCallback:
    def _report(percent: int, stage: str) -> None:
        update_job(job_id, percent, stage)

    return _report