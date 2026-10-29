"""Basic Pitch audio-to-MIDI inference stage."""
from __future__ import annotations

from pathlib import Path

from basic_pitch.inference import predict
from core.config import (
    BASIC_PITCH_FRAME_THRESHOLD,
    BASIC_PITCH_MAXIMUM_FREQUENCY,
    BASIC_PITCH_MELODIA_TRICK,
    BASIC_PITCH_MINIMUM_FREQUENCY,
    BASIC_PITCH_MINIMUM_NOTE_LENGTH_MS,
    BASIC_PITCH_MIDI_TEMPO,
    BASIC_PITCH_MULTIPLE_PITCH_BENDS,
    BASIC_PITCH_ONSET_THRESHOLD,
)


def transcribe(audio: Path, settings: dict | None = None) -> tuple[list[tuple[float, int]], float]:
    """Return note onset/pitch events and the MIDI duration."""
    options = settings or {
        "onset_threshold": BASIC_PITCH_ONSET_THRESHOLD,
        "frame_threshold": BASIC_PITCH_FRAME_THRESHOLD,
        "minimum_note_length": BASIC_PITCH_MINIMUM_NOTE_LENGTH_MS,
        "minimum_frequency": BASIC_PITCH_MINIMUM_FREQUENCY,
        "maximum_frequency": BASIC_PITCH_MAXIMUM_FREQUENCY,
        "melodia_trick": BASIC_PITCH_MELODIA_TRICK,
        "multiple_pitch_bends": BASIC_PITCH_MULTIPLE_PITCH_BENDS,
        "midi_tempo": BASIC_PITCH_MIDI_TEMPO,
    }
    _model_output, midi, _annotation = predict(str(audio), **options)
    events = [(note.start, note.pitch) for instrument in midi.instruments for note in instrument.notes]
    events.sort(key=lambda event: event[0])
    return events, midi.get_end_time()
