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

ProgressCallback = Callable[[int, str], None]

TTL_SECONDS = 3600
STALE_RUNNING_SECONDS = 420
STALE_ZERO_PERCENT_SECONDS = 90
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
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


_jobs: dict[str, SupermanJob] = {}
_lock = threading.RLock()
_loaded = False
_last_disk_sync = 0.0
_persist_scheduled = False
_persist_dirty = False


def _job_from_dict(data: dict[str, Any]) -> SupermanJob:
    return SupermanJob(
        job_id=str(data.get("job_id") or ""),
        no_invoice=str(data.get("no_invoice") or ""),
        no_pembayaran=str(data.get("no_pembayaran") or ""),
        status=data.get("status") or "pending",
        percent=int(data.get("percent") or 0),
        stage=str(data.get("stage") or "Menunggu..."),
        result=data.get("result"),
        error=data.get("error"),
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


def create_job(no_invoice: str, no_pembayaran: str = "") -> str:
    _cleanup_expired()
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = SupermanJob(
            job_id=job_id,
            no_invoice=no_invoice.strip(),
            no_pembayaran=no_pembayaran.strip(),
        )
    _schedule_persist()
    return job_id


def update_job(job_id: str, percent: int, stage: str) -> None:
    _ensure_loaded()
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
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
    if job.percent <= 0 and age > STALE_ZERO_PERCENT_SECONDS:
        return True
    return age > STALE_RUNNING_SECONDS


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