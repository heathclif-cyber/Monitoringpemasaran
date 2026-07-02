"""Pelacakan progres job deklarasi Superman (in-memory)."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

logger = logging.getLogger("superman.job")

JobStatus = Literal["pending", "running", "completed", "failed"]

ProgressCallback = Callable[[int, str], None]

TTL_SECONDS = 3600


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


def _cleanup_expired() -> None:
    now = time.time()
    with _lock:
        expired = [job_id for job_id, job in _jobs.items() if now - job.updated_at > TTL_SECONDS]
        for job_id in expired:
            _jobs.pop(job_id, None)


def create_job(no_invoice: str, no_pembayaran: str = "") -> str:
    _cleanup_expired()
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = SupermanJob(
            job_id=job_id,
            no_invoice=no_invoice.strip(),
            no_pembayaran=no_pembayaran.strip(),
        )
    return job_id


def update_job(job_id: str, percent: int, stage: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "running"
        job.percent = max(0, min(100, percent))
        job.stage = stage
        job.updated_at = time.time()


def complete_job(job_id: str, result: dict[str, Any]) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "completed"
        job.percent = 100
        job.stage = "Selesai"
        job.result = result
        job.updated_at = time.time()


def fail_job(
    job_id: str,
    error: str,
    *,
    debug: dict[str, Any] | None = None,
) -> None:
    invoice_ref = "?"
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        invoice_ref = job.no_invoice
        job.status = "failed"
        job.error = error
        job.updated_at = time.time()
    logger.error(
        "deklarasi failed job_id=%s invoice=%s error=%s debug=%s",
        job_id,
        invoice_ref,
        error,
        debug or {},
    )


def find_active_job_for_invoice(no_invoice: str) -> SupermanJob | None:
    ref = no_invoice.strip()
    if not ref:
        return None
    _cleanup_expired()
    with _lock:
        for job in _jobs.values():
            if job.no_invoice == ref and job.status in ("pending", "running"):
                return job
    return None


def get_job(job_id: str) -> SupermanJob | None:
    _cleanup_expired()
    with _lock:
        return _jobs.get(job_id)


def make_progress_callback(job_id: str) -> ProgressCallback:
    def _report(percent: int, stage: str) -> None:
        update_job(job_id, percent, stage)

    return _report