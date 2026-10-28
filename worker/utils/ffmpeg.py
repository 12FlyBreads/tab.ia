"""FFmpeg command wrappers used by audio pipeline stages."""
from __future__ import annotations

import subprocess
from pathlib import Path


def trim_audio(source: Path, destination: Path, start_seconds: float, end_seconds: float | None) -> None:
    command = ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-ss", str(start_seconds)]
    if end_seconds is not None:
        command.extend(["-t", str(end_seconds - start_seconds)])
    command.extend(["-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(destination)])
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode or not destination.is_file() or destination.stat().st_size <= 44:
        destination.unlink(missing_ok=True)
        details = (completed.stderr or completed.stdout).strip() or "FFmpeg não conseguiu recortar o intervalo selecionado."
        raise RuntimeError(f"Falha ao recortar o áudio: {details[-1200:]}")


def convert_to_mp3(source: Path, destination: Path) -> None:
    command = ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-vn", "-codec:a", "libmp3lame", "-b:a", "160k", "-ar", "44100", "-ac", "2", str(destination)]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode or not destination.is_file():
        destination.unlink(missing_ok=True)
        details = (completed.stderr or completed.stdout).strip() or "FFmpeg não gerou a prévia de áudio."
        raise RuntimeError(f"Falha ao preparar prévia MP3: {details[-1200:]}")
