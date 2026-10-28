"""Temporary preview audio creation and byte-range delivery."""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

from fastapi.responses import Response, StreamingResponse

LOG = logging.getLogger("tab-ia-api")


def create_preview(source: Path, job_id: str) -> Path:
    """Create a compact MP3 preview from the separated guitar stem."""
    preview = Path(tempfile.gettempdir()) / f"tab-ia-{job_id}-guitar.mp3"
    command = [
        "ffmpeg", "-y", "-v", "error", "-i", str(source), "-vn",
        "-codec:a", "libmp3lame", "-b:a", "160k", "-ar", "44100", "-ac", "2",
        str(preview),
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode or not preview.is_file():
        preview.unlink(missing_ok=True)
        details = (completed.stderr or completed.stdout).strip() or "FFmpeg não gerou a prévia de áudio."
        raise RuntimeError(f"Falha ao preparar prévia MP3: {details[-1200:]}")
    LOG.info("Prévia MP3 temporária criada: %s (%s bytes)", preview, preview.stat().st_size)
    return preview


def remove_preview(path: str | Path | None) -> None:
    if path:
        Path(path).unlink(missing_ok=True)


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
