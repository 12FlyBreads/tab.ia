"""Run the audio processing stages and update the in-memory job state."""
from __future__ import annotations

import logging
import tempfile
import shutil
from pathlib import Path
from time import time

from core.config import SEPARATION_DIR, TEMP_ROOT
from core.state import jobs, jobs_lock
from pipeline.steps.separator import create_preview, prepare_source, remove_preview, separate_guitar
from pipeline.steps.tab_builder import estimate_bpm, make_alphatex
from pipeline.steps.transcriber import DanmonSettings, transcribe
from utils.file_manager import cleanup_upload

LOG = logging.getLogger("tab-ia-api")


def process_job(job_id: str, source_path: str, start_seconds: float = 0.0,
                end_seconds: float | None = None, danmon_settings: DanmonSettings | None = None) -> None:
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
            LOG.info("Job %s: enviando a stem %s para danmor/guitab", job_id, guitar)
            notes, duration = transcribe(guitar, danmon_settings)
            bpm = estimate_bpm(str(guitar))
            alpha_tex = make_alphatex(notes, str(guitar), bpm)
            guitar_artifact = TEMP_ROOT / f"{job_id}_guitar.wav"
            tex_artifact = TEMP_ROOT / f"{job_id}.tex"
            shutil.copyfile(guitar, guitar_artifact)
            tex_artifact.write_text(alpha_tex, encoding="utf-8")
            preview = create_preview(guitar, job_id)
            with jobs_lock:
                if job_id in jobs:
                    jobs[job_id].update(status="completed", tab=alpha_tex, alpha_tex=alpha_tex,
                                        guitar_path=str(guitar_artifact), tex_path=str(tex_artifact),
                                        instrumental_path=str(preview), updated_at=time())
                else:
                    remove_preview(preview)
                    preview = None
                    guitar_artifact.unlink(missing_ok=True)
                    tex_artifact.unlink(missing_ok=True)
        result = None
    except Exception as exc:
        remove_preview(preview)
        for artifact in (locals().get("guitar_artifact"), locals().get("tex_artifact")):
            if artifact:
                Path(artifact).unlink(missing_ok=True)
        LOG.exception("Job %s falhou", job_id)
        result = {"status": "failed", "error": str(exc)[-2000:]}
    finally:
        cleanup_upload(source)

    if result is not None:
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].update(result, updated_at=time())
