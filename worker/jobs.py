"""In-memory job registry and expiration policy."""
from __future__ import annotations

import threading
from time import time

JOB_TTL_SECONDS = 3600
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def remove_expired_jobs() -> None:
    now = time()
    with jobs_lock:
        expired = [
            job_id for job_id, job in jobs.items()
            if job["status"] in {"completed", "failed"}
            and now - job["updated_at"] > JOB_TTL_SECONDS
        ]
        for job_id in expired:
            audio_path = jobs[job_id].get("instrumental_path")
            if audio_path:
                from pathlib import Path
                Path(audio_path).unlink(missing_ok=True)
            del jobs[job_id]
