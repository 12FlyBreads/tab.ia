"""Job creation, status, preview, and discard endpoints."""
from __future__ import annotations

import uuid
import json
import math
import shutil
from pathlib import Path
from time import time

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from core.config import (
    BASIC_PITCH_FRAME_THRESHOLD,
    BASIC_PITCH_MAXIMUM_FREQUENCY,
    BASIC_PITCH_MELODIA_TRICK,
    BASIC_PITCH_MINIMUM_FREQUENCY,
    BASIC_PITCH_MINIMUM_NOTE_LENGTH_MS,
    BASIC_PITCH_MIDI_TEMPO,
    BASIC_PITCH_MULTIPLE_PITCH_BENDS,
    BASIC_PITCH_ONSET_THRESHOLD,
    MAX_UPLOAD_BYTES,
)
from core.state import jobs, jobs_lock, remove_expired_jobs
from pipeline.orchestrator import process_job
from pipeline.steps.separator import audio_response, remove_preview
from utils.file_manager import cleanup_upload, upload_path
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


def parse_basic_pitch_settings(raw_settings: str | None) -> dict:
    defaults = {
        "onset_threshold": BASIC_PITCH_ONSET_THRESHOLD,
        "frame_threshold": BASIC_PITCH_FRAME_THRESHOLD,
        "minimum_note_length": BASIC_PITCH_MINIMUM_NOTE_LENGTH_MS,
        "minimum_frequency": BASIC_PITCH_MINIMUM_FREQUENCY,
        "maximum_frequency": BASIC_PITCH_MAXIMUM_FREQUENCY,
        "melodia_trick": BASIC_PITCH_MELODIA_TRICK,
        "multiple_pitch_bends": BASIC_PITCH_MULTIPLE_PITCH_BENDS,
        "midi_tempo": BASIC_PITCH_MIDI_TEMPO,
    }
    if raw_settings is None:
        return defaults
    try:
        values = json.loads(raw_settings)
        if not isinstance(values, dict):
            raise ValueError
        numeric_fields = {
            "onsetThreshold": ("onset_threshold", 0, 1),
            "frameThreshold": ("frame_threshold", 0, 1),
            "minimumNoteLengthMs": ("minimum_note_length", 1, 10000),
            "midiTempo": ("midi_tempo", 1, 600),
        }
        for client_key, (key, minimum, maximum) in numeric_fields.items():
            value = values.get(client_key, defaults[key])
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= maximum:
                raise ValueError
            defaults[key] = value
        for client_key, key in (("minimumFrequency", "minimum_frequency"), ("maximumFrequency", "maximum_frequency")):
            value = values.get(client_key, defaults[key])
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 1 <= value <= 20000):
                raise ValueError
            defaults[key] = value
        for client_key, key in (("melodiaTrick", "melodia_trick"), ("multiplePitchBends", "multiple_pitch_bends")):
            value = values.get(client_key, defaults[key])
            if not isinstance(value, bool):
                raise ValueError
            defaults[key] = value
        low, high = defaults["minimum_frequency"], defaults["maximum_frequency"]
        if low is not None and high is not None and low > high:
            raise ValueError
        return defaults
    except (TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="As configurações do Basic Pitch são inválidas.")


@router.post("/jobs", status_code=202)
async def create_job(background_tasks: BackgroundTasks, file: UploadFile | None = File(None),
                     youtube_source: str | None = Form(None),
                     youtube_preview_id: str | None = Form(None),
                     start_seconds: float = Form(0.0), end_seconds: float | None = Form(None),
                     basic_pitch_settings: str | None = Form(None)):
    remove_expired_jobs()
    transcription_settings = parse_basic_pitch_settings(basic_pitch_settings)
    if sum(bool(value) for value in (file, youtube_source, youtube_preview_id)) != 1:
        raise HTTPException(status_code=400, detail="Envie um arquivo, link ou prévia selecionada do YouTube.")
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
                        "basic_pitch_settings": transcription_settings,
                        "created_at": time(), "updated_at": time()}
    if youtube_source:
        background_tasks.add_task(process_youtube_job, job_id, youtube_source.strip(), start_seconds, end_seconds, transcription_settings)
    else:
        background_tasks.add_task(process_job, job_id, str(source), start_seconds, end_seconds, transcription_settings)
    return {"id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    remove_expired_jobs()
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job inexistente ou expirado.")
        return {key: value for key, value in job.items()
                if key not in {"created_at", "updated_at", "instrumental_path", "source_path", "basic_pitch_settings"}}


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
