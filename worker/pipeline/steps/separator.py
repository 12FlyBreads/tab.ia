"""Demucs based guitar stem separation stage."""
from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

LOG = logging.getLogger("tab-ia-api")


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
