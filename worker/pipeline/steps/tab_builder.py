"""Convert direct guitar string/fret predictions to alphaTex."""
from __future__ import annotations

from dataclasses import dataclass

import librosa


@dataclass(frozen=True)
class TabNote:
    onset: float
    string: int  # alphaTab: 1 is high e, 6 is low E
    fret: int
    frequency: float | None = None
    articulation: str | None = None  # "bend" or "slide", when supplied by a model


def estimate_bpm(audio_path: str) -> float:
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    value = float(tempo[0] if getattr(tempo, "ndim", 0) else tempo)
    return value if value > 0 else 120.0


def _articulations(notes: list[TabNote]) -> list[TabNote]:
    """Infer likely bends/slides only when adjacent same-string predictions support it."""
    ordered = sorted(notes, key=lambda n: (n.onset, n.string, n.fret))
    result = list(ordered)
    for index, first in enumerate(ordered):
        second = next((candidate for candidate in ordered[index + 1:]
                       if candidate.string == first.string), None)
        if second is None or second.onset - first.onset >= 0.1:
            continue
        if first.articulation or second.articulation:
            kind = first.articulation or second.articulation
        elif first.frequency and second.frequency:
            # A rising pitch between fret positions suggests a bend; without
            # continuous pitch evidence, fret movement is represented as a slide.
            kind = "bend" if second.frequency > first.frequency * 1.015 else "slide"
        else:
            kind = "slide"
        result[index] = TabNote(first.onset, first.string, first.fret, first.frequency, kind)
    return result


def make_alphatex(notes: list[TabNote], audio_path: str, bpm: float | None = None) -> str:
    """Quantize to sixteenths and render a playable alphaTex score."""
    tempo = bpm or estimate_bpm(audio_path)
    tempo = min(300.0, max(30.0, float(tempo)))
    sixteenth = 60.0 / tempo / 4
    ordered = _articulations(notes)
    paired: dict[int, tuple[int, str]] = {}
    consumed: set[int] = set()
    for index, first in enumerate(ordered[:-1]):
        second = next((j for j in range(index + 1, len(ordered))
                       if ordered[j].onset - first.onset >= 0), None)
        if second is None:
            continue
        target = ordered[second]
        if first.string == target.string and 0 <= target.onset - first.onset < 0.1:
            kind = first.articulation or ('bend' if first.frequency and target.frequency
                    and target.frequency > first.frequency * 1.015 else 'slide')
            paired[index] = (second, kind)
            consumed.add(second)

    events: dict[int, list[tuple[int, TabNote]]] = {}
    for index, note in enumerate(ordered):
        if 1 <= note.string <= 6 and 0 <= note.fret <= 24:
            step = max(0, round(note.onset / sixteenth))
            if index not in consumed:
                events.setdefault(step, []).append((index, note))
    if not events:
        return ''

    # alphaTex :16 sets the duration; barlines every 16 sixteenths make 4/4 bars.
    last_step = max(events)
    tokens: list[str] = []
    for step in range(last_step + 1):
        at_step = sorted(events.get(step, []), key=lambda item: item[1].string)
        if not at_step:
            tokens.append('r')
            continue
        parts = []
        consumed: set[int] = set()
        for index, note in at_step:
            if note.string in consumed:
                continue
            token = f'{note.fret}.{note.string}'
            pair = paired.get(index)
            if pair and pair[1] == 'bend':
                later = ordered[pair[0]]
                token += f'{{b {later.fret}.{later.string}}}'
            elif pair and pair[1] == 'slide':
                token += '{sl}'
            parts.append(token)
            if pair and pair[1] == 'slide':
                later = ordered[pair[0]]
                parts.append(f'{later.fret}.{later.string}')
        tokens.append(parts[0] if len(parts) == 1 else '(' + ' '.join(parts) + ')')

    bars = [' '.join(tokens[i:i + 16]) for i in range(0, len(tokens), 16)]
    return (f'\\track "Guitarra Solo" \\tuning e4 b3 g3 d3 a2 e2 '
            f'\\tempo {tempo:.0f} :16 ' + ' | '.join(bars))
