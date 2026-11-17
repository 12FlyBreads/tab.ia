"""Job creation, status, preview, and discard endpoints."""
from __future__ import annotations

import uuid
import shutil
from pathlib import Path
from time import time

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from core.config import MAX_UPLOAD_BYTES
from core.state import jobs, jobs_lock, remove_expired_jobs
from pipeline.orchestrator import process_job
from pipeline.steps.separator import audio_response, remove_preview
from pipeline.steps.transcriber import parse_danmon_settings
from utils.file_manager import cleanup_job_artifacts, cleanup_upload, upload_path
from utils.youtube import (
    create_youtube_preview, discard_youtube_preview,
    get_youtube_preview, process_youtube_job, search_youtube,
)

router = APIRouter()


@router.post("/youtube/previews")
def create_youtube_audio_preview(youtube_source: str = Form(...)):
    if not youtube_source.strip() or len(youtube_source) > 500:
        raise HTTPException(status_code=400, detail="Informe um link válido do YouTube.")
    try:
        preview_id = create_youtube_preview(youtube_source.strip())
        return {"id": preview_id, "audio_url": f"/youtube/previews/{preview_id}"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)[-1000:]) from exc


@router.get("/youtube/previews/{preview_id}")
def get_youtube_audio_preview(preview_id: str):
    path = get_youtube_preview(preview_id)
    if not path:
        raise HTTPException(status_code=404, detail="Prévia inexistente ou expirada.")
    return FileResponse(path, media_type="audio/mpeg")


@router.delete("/youtube/previews/{preview_id}", status_code=204)
def delete_youtube_audio_preview(preview_id: str):
    discard_youtube_preview(preview_id)
    return Response(status_code=204)


@router.get("/youtube/search")
def youtube_search(q: str):
    try:
        return {"results": search_youtube(q)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Não foi possível pesquisar no YouTube agora.") from exc


@router.post("/jobs", status_code=202)
async def create_job(background_tasks: BackgroundTasks, file: UploadFile | None = File(None),
                     youtube_source: str | None = Form(None),
                     youtube_preview_id: str | None = Form(None),
                     start_seconds: float = Form(0.0), end_seconds: float | None = Form(None),
                     danmon_settings: str | None = Form(None)):
    remove_expired_jobs()
    if sum(bool(value) for value in (file, youtube_source, youtube_preview_id)) != 1:
        raise HTTPException(status_code=400, detail="Envie um arquivo, link ou prévia selecionada do YouTube.")
    try:
        settings = parse_danmon_settings(danmon_settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = None
    extension = ".mp3"
    if file:
        extension = Path(file.filename or "").suffix.lower()
        if extension not in {".mp3", ".wav"}:
            raise HTTPException(status_code=400, detail="Formato inválido. Use .mp3 ou .wav.")
        payload = await file.read(MAX_UPLOAD_BYTES + 1)
        if not payload or len(payload) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="O arquivo deve ter entre 1 byte e 50 MB.")
    if start_seconds < 0 or (end_seconds is not None and end_seconds <= start_seconds):
        raise HTTPException(status_code=400, detail="O intervalo selecionado para o áudio é inválido.")

    if youtube_source and len(youtube_source.strip()) > 500:
        raise HTTPException(status_code=400, detail="Informe um link ou termo de busca válido.")
    job_id = str(uuid.uuid4())
    youtube_preview_path = get_youtube_preview(youtube_preview_id) if youtube_preview_id else None
    if youtube_preview_id and not youtube_preview_path:
        raise HTTPException(status_code=404, detail="A prévia do YouTube expirou. Selecione o vídeo novamente.")
    source = upload_path(job_id, extension) if file else upload_path(job_id, ".mp3") if youtube_preview_id else None
    try:
        if file and source and payload:
            source.write_bytes(payload)
        elif source and youtube_preview_path:
            shutil.copyfile(youtube_preview_path, source)
    except Exception:
        cleanup_upload(source)
        raise
    finally:
        if file:
            await file.close()

    with jobs_lock:
        jobs[job_id] = {"id": job_id, "status": "queued", "source_path": str(source) if source else None,
                        "youtube_source": youtube_source.strip() if youtube_source else None,
                        "start_seconds": start_seconds, "end_seconds": end_seconds,
                        "created_at": time(), "updated_at": time()}
    if youtube_source:
        background_tasks.add_task(process_youtube_job, job_id, youtube_source.strip(), start_seconds, end_seconds,
                                  settings)
    else:
        background_tasks.add_task(process_job, job_id, str(source), start_seconds, end_seconds, settings)
    return {"id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    remove_expired_jobs()
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job inexistente ou expirado.")
        return {key: value for key, value in job.items()
                if key not in {"created_at", "updated_at", "instrumental_path", "source_path", "guitar_path", "tex_path"}}


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
        cleanup_job_artifacts(job)
        if job.get("status") == "queued":
            cleanup_upload(job.get("source_path"))
    return Response(status_code=204)
