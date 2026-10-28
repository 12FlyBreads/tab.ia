"""Job creation, status, preview, and discard endpoints."""
from __future__ import annotations

import uuid
from pathlib import Path
from time import time

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

from core.config import MAX_UPLOAD_BYTES
from core.state import jobs, jobs_lock, remove_expired_jobs
from pipeline.orchestrator import process_job
from pipeline.separation.audio import audio_response, remove_preview
from utils.file_manager import cleanup_upload, upload_path

router = APIRouter()


@router.post("/jobs", status_code=202)
async def create_job(background_tasks: BackgroundTasks, file: UploadFile = File(...),
                     start_seconds: float = Form(0.0), end_seconds: float | None = Form(None)):
    remove_expired_jobs()
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".mp3", ".wav"}:
        raise HTTPException(status_code=400, detail="Formato inválido. Use .mp3 ou .wav.")
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload or len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="O arquivo deve ter entre 1 byte e 50 MB.")
    if start_seconds < 0 or (end_seconds is not None and end_seconds <= start_seconds):
        raise HTTPException(status_code=400, detail="O intervalo selecionado para o áudio é inválido.")

    job_id = str(uuid.uuid4())
    source = upload_path(job_id, extension)
    try:
        source.write_bytes(payload)
    except Exception:
        cleanup_upload(source)
        raise
    finally:
        await file.close()

    with jobs_lock:
        jobs[job_id] = {"id": job_id, "status": "queued", "source_path": str(source),
                        "start_seconds": start_seconds, "end_seconds": end_seconds,
                        "created_at": time(), "updated_at": time()}
    background_tasks.add_task(process_job, job_id, str(source), start_seconds, end_seconds)
    return {"id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    remove_expired_jobs()
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job inexistente ou expirado.")
        return {key: value for key, value in job.items()
                if key not in {"created_at", "updated_at", "instrumental_path", "source_path"}}


@router.get("/jobs/{job_id}/instrumental")
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


@router.delete("/jobs/{job_id}", status_code=204)
def discard_job(job_id: str):
    with jobs_lock:
        job = jobs.pop(job_id, None)
    if job is not None:
        remove_preview(job.get("instrumental_path"))
        if job.get("status") == "queued":
            cleanup_upload(job.get("source_path"))
    return Response(status_code=204)
