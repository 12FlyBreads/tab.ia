"""Demucs based source separation."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def separate_instrumental(source: Path, output_dir: Path) -> Path:
    """Use Demucs' no-vocals stem as an instrumental proxy for guitar."""
    command = [
        sys.executable, "-m", "demucs", "--two-stems", "other",
        "-n", "htdemucs", "-o", str(output_dir), str(source),
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode:
        details = (completed.stderr or completed.stdout).strip()
        if not details:
            details = "O Demucs terminou sem informar detalhes."
        raise RuntimeError(f"Demucs falhou (código {completed.returncode}): {details[-2000:]}")

    stem = output_dir / "htdemucs" / source.stem / "no_other.wav"
    if not stem.is_file():
        raise RuntimeError("O Demucs terminou sem criar a faixa no_other.wav.")
    return stem
