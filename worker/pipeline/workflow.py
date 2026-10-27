"""Orchestration of the audio processing stages for a job."""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from time import time

from jobs import jobs, jobs_lock
from pipeline.inference.basic_pitch import transcribe
from pipeline.separation.demucs import separate_instrumental
from pipeline.tablature.guitar import make_tab

LOG = logging.getLogger("tab-ia-api")


def process_job(job_id: str, source_path: str) -> None:
    source = Path(source_path)
    with jobs_lock:
        if job_id not in jobs:
            source.unlink(missing_ok=True)
            return
        jobs[job_id].update(status="processing", updated_at=time())

    try:
        if not source.is_file():
            raise FileNotFoundError("Arquivo temporário não encontrado pela API.")
        with tempfile.TemporaryDirectory(prefix=f"tab-ia-{job_id}-") as temp:
            instrumental = separate_instrumental(source, Path(temp))
            notes, duration = transcribe(instrumental)
        result = {"status": "completed", "tab": make_tab(notes, duration)}
    except Exception as exc:
        LOG.exception("Job %s falhou", job_id)
        result = {"status": "failed", "error": str(exc)[-2000:]}
    finally:
        source.unlink(missing_ok=True)

    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(result, updated_at=time())
