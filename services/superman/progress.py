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
_lock = threading.Lock()
_loaded = False


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


def _persist_jobs_locked() -> None:
    try:
        _JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
        payload = {job_id: asdict(job) for job_id, job in _jobs.items()}
        tmp = _JOBS_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(_JOBS_FILE)
    except Exception as exc:
        logger.warning("gagal persist superman jobs: %s", exc)


def _ensure_loaded() -> None:
    global _loaded
    if _loaded:
        return
    with _lock:
        if _loaded:
            return
        if _JOBS_FILE.exists():
            try:
                raw = json.loads(_JOBS_FILE.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    for job_id, data in raw.items():
                        if not isinstance(data, dict):
                            continue
                        job = _job_from_dict({**data, "job_id": data.get("job_id") or job_id})
                        if job.status in ("pending", "running"):
                            job.status = "failed"
                            job.error = _INTERRUPTED_MSG
                            job.updated_at = time.time()
                        _jobs[job.job_id] = job
            except Exception as exc:
                logger.warning("gagal load superman jobs: %s", exc)
        _loaded = True


def _cleanup_expired() -> None:
    _ensure_loaded()
    now = time.time()
    with _lock:
        expired = [
            job_id
            for job_id, job in _jobs.items()
            if now - job.updated_at > TTL_SECONDS
        ]
        for job_id in expired:
            _jobs.pop(job_id, None)
        if expired:
            _persist_jobs_locked()


def create_job(no_invoice: str, no_pembayaran: str = "") -> str:
    _cleanup_expired()
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = SupermanJob(
            job_id=job_id,
            no_invoice=no_invoice.strip(),
            no_pembayaran=no_pembayaran.strip(),
        )
        _persist_jobs_locked()
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
        _persist_jobs_locked()


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
        _persist_jobs_locked()


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
        _persist_jobs_locked()
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


def find_active_job_for_invoice(no_invoice: str) -> SupermanJob | None:
    ref = no_invoice.strip()
    if not ref:
        return None
    _cleanup_expired()
    now = time.time()
    with _lock:
        for job in _jobs.values():
            if job.no_invoice != ref or job.status not in ("pending", "running"):
                continue
            if now - job.updated_at > STALE_RUNNING_SECONDS:
                _fail_stale_job(job)
                _persist_jobs_locked()
                continue
            return job
    return None


def get_job(job_id: str) -> SupermanJob | None:
    _cleanup_expired()
    with _lock:
        job = _jobs.get(job_id.strip())
        if (
            job
            and job.status in ("pending", "running")
            and time.time() - job.updated_at > STALE_RUNNING_SECONDS
        ):
            _fail_stale_job(job)
            _persist_jobs_locked()
        return job


def make_progress_callback(job_id: str) -> ProgressCallback:
    def _report(percent: int, stage: str) -> None:
        update_job(job_id, percent, stage)

    return _report