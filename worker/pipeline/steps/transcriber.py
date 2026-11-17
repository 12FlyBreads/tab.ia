"""Official Daniele Morotti Guitab inference adapter."""
from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import librosa

from guitab.inference import transcribe_file
from guitab.paths import DEFAULT_CHECKPOINT
from pipeline.steps.tab_builder import TabNote


@dataclass(frozen=True)
class DanmonSettings:
    onset: float = 0.45
    frame: float = 0.6
    min_frames: int = 3
    legato: int = 8
    orphan: bool = False
    fret_frames: int = 3
    dedup: int = 4
    reattack: float = 0.75

    def to_dict(self) -> dict[str, float | int | bool]:
        return asdict(self)


def parse_danmon_settings(value: str | None) -> DanmonSettings:
    if value is None:
        return DanmonSettings()
    try:
        payload: Any = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError("As configurações do DanmoN não estão em um formato válido.") from exc
    if not isinstance(payload, dict) or set(payload) != set(DanmonSettings.__dataclass_fields__):
        raise ValueError("As configurações do DanmoN estão incompletas ou contêm campos desconhecidos.")

    ranges = {
        "onset": (0.3, 0.8),
        "frame": (0.0, 1.0),
        "min_frames": (1, 30),
        "legato": (1, 60),
        "fret_frames": (1, 30),
        "dedup": (0, 30),
        "reattack": (0.0, 1.0),
    }
    values: dict[str, float | int | bool] = {}
    for name, (minimum, maximum) in ranges.items():
        number = payload[name]
        if (isinstance(number, bool) or not isinstance(number, (int, float))
                or isinstance(number, float) and not math.isfinite(number)
                or not minimum <= number <= maximum):
            raise ValueError(f"O parâmetro '{name}' do DanmoN está fora do intervalo permitido.")
        if name in {"min_frames", "legato", "fret_frames", "dedup"} and not isinstance(number, int):
            raise ValueError(f"O parâmetro '{name}' do DanmoN deve ser um número inteiro.")
        values[name] = number
    if not isinstance(payload["orphan"], bool):
        raise ValueError("O parâmetro 'orphan' do DanmoN deve ser verdadeiro ou falso.")
    values["orphan"] = payload["orphan"]
    return DanmonSettings(**values)


def transcribe(audio: Path, settings: DanmonSettings | None = None) -> tuple[list[TabNote], float]:
    """Return the Guitab model's direct onset/string/fret predictions.

    Guitab publishes its own CNN/Transformer checkpoints, not a Transformers
    model. Its inference module handles the CQT preprocessing and fetches the
    E25 safetensors checkpoint from danmor/guitab on first use.
    """
    duration = float(librosa.get_duration(path=str(audio)))
    predictions = transcribe_file(
        str(DEFAULT_CHECKPOINT),
        str(audio),
        device="cpu",
        params=(settings or DanmonSettings()).to_dict(),
    )
    notes = [
        TabNote(
            onset=float(prediction["onset"]),
            string=int(prediction["string"]),
            fret=int(prediction["fret"]),
        )
        for prediction in predictions
    ]
    return notes, duration
