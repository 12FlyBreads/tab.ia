"""Audio preparation, guitar separation, and instrumental preview helpers."""
from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

from fastapi.responses import Response, StreamingResponse
from utils.file_manager import cleanup_preview, preview_path
from utils.ffmpeg import convert_to_mp3

LOG = logging.getLogger("tab-ia-api")


def create_preview(source: Path, job_id: str) -> Path:
    """Create a compact MP3 preview from the separated guitar stem."""
    preview = preview_path(job_id)
    try:
        convert_to_mp3(source, preview)
    except RuntimeError:
        cleanup_preview(preview)
        raise
    LOG.info("Prévia MP3 temporária criada: %s (%s bytes)", preview, preview.stat().st_size)
    return preview


def prepare_source(
    source: Path,
    work_dir: Path,
    start_seconds: float = 0.0,
    end_seconds: float | None = None,
) -> Path:
    """Trim an uploaded track when the user selected a time interval."""
    from pipeline.steps.trimmer import trim_selected_audio
    return trim_selected_audio(source, work_dir, start_seconds, end_seconds)


def remove_preview(path: str | Path | None) -> None:
    cleanup_preview(path)


def audio_response(path: Path, byte_range: str | None = None):
    """Serve an MP3 with range requests so media players can seek efficiently."""
    size = path.stat().st_size
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": 'inline; filename="guitarra.mp3"',
    }

    if byte_range:
        try:
            unit, value = byte_range.strip().split("=", 1)
            if unit != "bytes" or "," in value:
                raise ValueError
            start_text, end_text = value.split("-", 1)
            if start_text:
                start = int(start_text)
                end = min(int(end_text), size - 1) if end_text else size - 1
            else:
                suffix_length = int(end_text)
                if suffix_length <= 0:
                    raise ValueError
                start, end = max(0, size - suffix_length), size - 1
            if start < 0 or start >= size or end < start:
                raise ValueError
        except ValueError:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}", **headers})

        length = end - start + 1
        headers.update({"Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(length)})

        def chunks():
            with path.open("rb") as audio:
                audio.seek(start)
                remaining = length
                while remaining:
                    chunk = audio.read(min(256 * 1024, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(chunks(), status_code=206, media_type="audio/mpeg", headers=headers)

    headers["Content-Length"] = str(size)
    return StreamingResponse(path.open("rb"), media_type="audio/mpeg", headers=headers)


def separate_guitar(source: Path, output_dir: Path) -> Path:
    """Extract the guitar stem with Demucs' experimental six-source model."""
    command = [sys.executable, "-m", "demucs", "--two-stems", "guitar",
               "-n", "htdemucs_6s", "-o", str(output_dir), str(source)]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode:
        details = (completed.stderr or completed.stdout).strip()
        if not details:
            details = "O Demucs terminou sem informar detalhes."
        raise RuntimeError(f"Demucs falhou (código {completed.returncode}): {details[-2000:]}")
    stem = output_dir / "htdemucs_6s" / source.stem / "guitar.wav"
    if not stem.is_file():
        raise RuntimeError("O Demucs terminou sem criar a faixa guitar.wav.")
    LOG.info("Demucs selecionou a stem de guitarra: %s", stem)
    return stem
