"""Conditional source audio trimming."""
import logging
from pathlib import Path

from utils.ffmpeg import trim_audio

LOG = logging.getLogger("tab-ia-api")


def trim_selected_audio(source: Path, work_dir: Path, start_seconds: float = 0.0,
                        end_seconds: float | None = None) -> Path:
    if start_seconds < 0 or (end_seconds is not None and end_seconds <= start_seconds):
        raise ValueError("O intervalo selecionado para o áudio é inválido.")
    if start_seconds == 0 and end_seconds is None:
        return source
    trimmed = work_dir / "selected-audio.wav"
    trim_audio(source, trimmed, start_seconds, end_seconds)
    LOG.info("Intervalo %.2fs–%s aplicado ao upload", start_seconds, end_seconds or "fim")
    return trimmed
