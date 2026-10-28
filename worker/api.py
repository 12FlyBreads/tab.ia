"""FastAPI entry point for the Tab IA worker."""
from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path
from time import time

from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response

from jobs import jobs, jobs_lock, remove_expired_jobs
from pipeline.separation.audio import audio_response, remove_preview
from pipeline.workflow import process_job

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
app = FastAPI(title="Tab IA API", version="1.0.0")


@app.post("/jobs", status_code=202)
async def create_job(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    remove_expired_jobs()
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".mp3", ".wav"}:
        raise HTTPException(status_code=400, detail="Formato inválido. Use .mp3 ou .wav.")

    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload or len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="O arquivo deve ter entre 1 byte e 50 MB.")

    job_id = str(uuid.uuid4())
    descriptor, source_path = tempfile.mkstemp(prefix=f"tab-ia-{job_id}-", suffix=extension)
    try:
        with os.fdopen(descriptor, "wb") as audio_file:
            audio_file.write(payload)
    except Exception:
        Path(source_path).unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    with jobs_lock:
        jobs[job_id] = {"id": job_id, "status": "queued", "created_at": time(), "updated_at": time()}
    background_tasks.add_task(process_job, job_id, source_path)
    return {"id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    remove_expired_jobs()
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job inexistente ou expirado.")
        return {key: value for key, value in job.items() if key not in {"created_at", "updated_at", "instrumental_path"}}


@app.get("/jobs/{job_id}/instrumental")
def get_instrumental(job_id: str, range: str | None = Header(default=None, alias="Range")):
    remove_expired_jobs()
    with jobs_lock:
        job = jobs.get(job_id)
        audio_path = job.get("instrumental_path") if job else None
        if job is None:
            raise HTTPException(status_code=404, detail="Job inexistente ou expirado.")
        if job.get("status") != "completed" or not audio_path:
            raise HTTPException(status_code=409, detail="Instrumental ainda não está disponível.")
        path = Path(audio_path)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Áudio instrumental expirado.")

    return audio_response(path, range)


@app.delete("/jobs/{job_id}", status_code=204)
def discard_job(job_id: str):
    with jobs_lock:
        job = jobs.pop(job_id, None)
    if job is not None:
        remove_preview(job.get("instrumental_path"))
    return Response(status_code=204)
