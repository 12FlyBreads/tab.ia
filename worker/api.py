"""FastAPI API and in-process background processing for Tab IA."""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path
from time import time

from basic_pitch.inference import predict
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile

LOG = logging.getLogger("tab-ia-api")
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
JOB_TTL_SECONDS = 3600

# This registry belongs to this Python process. Run a single Uvicorn process locally.
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()
app = FastAPI(title="Tab IA API", version="1.0.0")

# Standard guitar tuning, low to high. First valid string/fret is selected.
STRINGS = [("E", 40), ("A", 45), ("D", 50), ("G", 55), ("B", 59), ("e", 64)]
MAX_FRET = 22


def remove_expired_jobs() -> None:
    now = time()
    with jobs_lock:
        expired = [
            job_id for job_id, job in jobs.items()
            if job["status"] in {"completed", "failed"}
            and now - job["updated_at"] > JOB_TTL_SECONDS
        ]
        for job_id in expired:
            del jobs[job_id]


def note_to_position(pitch: int) -> tuple[str, int] | None:
    for name, open_pitch in STRINGS:
        fret = pitch - open_pitch
        if 0 <= fret <= MAX_FRET:
            return name, fret
    return None


def make_tab(notes: list[tuple[float, int]], duration: float) -> str:
    """Render a compact monospaced tab timeline, one column per detected note."""
    rows = {name: [] for name, _ in reversed(STRINGS)}
    for _note_time, pitch in notes:
        position = note_to_position(pitch)
        if position is None:
            continue
        string_name, fret = position
        width = max(2, len(str(fret)))
        for row in rows:
            rows[row].append(str(fret).rjust(width) if row == string_name else "-" * width)
    if not notes or not any(rows.values()):
        return "Nenhuma nota de guitarra foi identificada com confiança suficiente."
    lines = [f"{name}|" + " ".join(cells) + "|" for name, cells in rows.items()]
    lines.append(f"\nNotas detectadas: {len(notes)} · duração analisada: {duration:.1f}s")
    return "\n".join(lines)


def separate_guitar(source: Path, output_dir: Path) -> Path:
    """Demucs has no dedicated guitar stem; use its instrumental stem as a proxy."""
    command = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems",
        "other",
        "-n",
        "htdemucs",
        "-o",
        str(output_dir),
        str(source),
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode:
        details = (completed.stderr or completed.stdout).strip()
        if not details:
            details = "O Demucs terminou sem informar detalhes."
        raise RuntimeError(f"Demucs falhou (código {completed.returncode}): {details[-2000:]}")

    candidates = list(output_dir.glob(f"htdemucs/{source.stem}/no_other.wav"))
    if not candidates:
        raise RuntimeError("O Demucs terminou sem criar a faixa no_other.wav.")
    return candidates[0]


def transcribe(audio: Path) -> tuple[list[tuple[float, int]], float]:
    _model_output, midi, _annotation = predict(str(audio))
    events = [(note.start, note.pitch) for instrument in midi.instruments for note in instrument.notes]
    events.sort(key=lambda event: event[0])
    return events, midi.get_end_time()


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
            guitar_proxy = separate_guitar(source, Path(temp))
            notes, duration = transcribe(guitar_proxy)
        result = {"status": "completed", "tab": make_tab(notes, duration)}
    except Exception as exc:
        LOG.exception("Job %s falhou", job_id)
        result = {"status": "failed", "error": str(exc)[-2000:]}
    finally:
        source.unlink(missing_ok=True)

    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(result, updated_at=time())


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
        return {key: value for key, value in job.items() if key not in {"created_at", "updated_at"}}
