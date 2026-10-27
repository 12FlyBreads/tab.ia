"""Basic Pitch audio-to-MIDI inference."""
from __future__ import annotations

from pathlib import Path

from basic_pitch.inference import predict


def transcribe(audio: Path) -> tuple[list[tuple[float, int]], float]:
    """Return note onset/pitch events and the MIDI duration."""
    _model_output, midi, _annotation = predict(str(audio))
    events = [(note.start, note.pitch) for instrument in midi.instruments for note in instrument.notes]
    events.sort(key=lambda event: event[0])
    return events, midi.get_end_time()
