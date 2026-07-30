"""Verify progress.py tidak deadlock saat file jobs sudah ada."""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from pathlib import Path


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        jobs_path = Path(tmp) / "superman_jobs.json"
        jobs_path.write_text(
            json.dumps(
                {
                    "11111111-1111-1111-1111-111111111111": {
                        "job_id": "11111111-1111-1111-1111-111111111111",
                        "no_invoice": "TEST/INV",
                        "status": "running",
                        "percent": 0,
                        "stage": "Memulai proses...",
                        "created_at": time.time(),
                        "updated_at": time.time(),
                    }
                }
            ),
            encoding="utf-8",
        )
        os.environ["SUPERMAN_JOBS_PATH"] = str(jobs_path)

        import importlib
        import services.superman.progress as progress

        importlib.reload(progress)

        errors: list[str] = []

        def worker(name: str, fn) -> None:
            try:
                fn()
            except Exception as exc:
                errors.append(f"{name}: {exc}")

        threads = [
            threading.Thread(
                target=worker,
                args=("get_job", lambda: progress.get_job("11111111-1111-1111-1111-111111111111")),
            ),
            threading.Thread(
                target=worker,
                args=(
                    "find_active",
                    lambda: progress.find_active_job_for_invoice("TEST/INV"),
                ),
            ),
            threading.Thread(
                target=worker,
                args=(
                    "create",
                    lambda: progress.create_job("OTHER/INV"),
                ),
            ),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
            if t.is_alive():
                errors.append(f"{t.name} timeout (deadlock?)")

        if errors:
            print("FAIL", errors)
            return 1

        job = progress.get_job("11111111-1111-1111-1111-111111111111")
        print(
            "OK",
            job.status if job else None,
            job.percent if job else None,
            job.error[:40] if job and job.error else None,
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())