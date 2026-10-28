"""Run the audio processing stages and update the in-memory job state."""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from time import time

from core.config import SEPARATION_DIR
from core.state import jobs, jobs_lock
from pipeline.separation.audio import create_preview, prepare_source, remove_preview
from pipeline.steps.separator import separate_guitar
from pipeline.steps.tab_builder import make_tab
from pipeline.steps.transcriber import transcribe
from utils.file_manager import cleanup_upload

LOG = logging.getLogger("tab-ia-api")


def process_job(job_id: str, source_path: str, start_seconds: float = 0.0,
                end_seconds: float | None = None) -> None:
    source = Path(source_path)
    preview: Path | None = None
    with jobs_lock:
        if job_id not in jobs:
            cleanup_upload(source)
            return
        jobs[job_id].update(status="processing", updated_at=time())

    try:
        if not source.is_file():
            raise FileNotFoundError("Arquivo temporário não encontrado pela API.")
        with tempfile.TemporaryDirectory(prefix=f"{job_id}-", dir=SEPARATION_DIR) as temp:
            work_dir = Path(temp)
            selected_source = prepare_source(source, work_dir, start_seconds, end_seconds)
            guitar = separate_guitar(selected_source, work_dir)
            LOG.info("Job %s: enviando a stem %s para Basic Pitch", job_id, guitar)
            notes, duration = transcribe(guitar)
            tab = make_tab(notes, duration)
            preview = create_preview(guitar, job_id)
            with jobs_lock:
                if job_id in jobs:
                    jobs[job_id].update(status="completed", tab=tab,
                                        instrumental_path=str(preview), updated_at=time())
                else:
                    remove_preview(preview)
                    preview = None
        result = None
    except Exception as exc:
        remove_preview(preview)
        LOG.exception("Job %s falhou", job_id)
        result = {"status": "failed", "error": str(exc)[-2000:]}
    finally:
        cleanup_upload(source)

    if result is not None:
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].update(result, updated_at=time())
