"""Guitar note positioning and text tablature rendering stage."""
from __future__ import annotations

STRINGS = [("E", 40), ("A", 45), ("D", 50), ("G", 55), ("B", 59), ("e", 64)]
MAX_FRET = 22


def note_to_position(pitch: int) -> tuple[str, int] | None:
    for name, open_pitch in STRINGS:
        fret = pitch - open_pitch
        if 0 <= fret <= MAX_FRET:
            return name, fret
    return None


def make_tab(notes: list[tuple[float, int]], duration: float) -> str:
    rows = {name: [] for name, _ in reversed(STRINGS)}
    placed_notes = 0
    for _note_time, pitch in notes:
        position = note_to_position(pitch)
        if position is None:
            continue
        string_name, fret = position
        placed_notes += 1
        width = max(2, len(str(fret)))
        for row in rows:
            rows[row].append(str(fret).rjust(width) if row == string_name else "-" * width)
    if not placed_notes:
        return "Nenhuma nota de guitarra foi identificada com confiança suficiente."
    lines = [f"{name}|" + " ".join(cells) + "|" for name, cells in rows.items()]
    lines.append(f"\nNotas detectadas: {len(notes)} · duração analisada: {duration:.1f}s")
    return "\n".join(lines)


def make_alphatex(notes: list[tuple[float, int]], duration: float) -> str:
    """Convert detected guitar notes to alphaTex for alphaTab rendering/playback.

    Basic Pitch's MIDI objects are in-memory only. alphaTab imports score formats,
    so expose a score representation instead of trying to load a MIDI file.
    Onsets are quantized to sixteenths at 120 BPM (125 ms per step).
    """
    events: dict[int, list[str]] = {}
    for onset, pitch in notes:
        position = note_to_position(pitch)
        if position is None:
            continue
        string_name, fret = position
        string_number = next(index for index, (name, _) in enumerate(reversed(STRINGS), 1)
                             if name == string_name)
        step = max(0, round(onset / 0.125))
        events.setdefault(step, []).append(f"{fret}.{string_number}")

    if not events:
        return ""

    last_step = max(max(events), round(max(0.0, duration) / 0.125) - 1)
    beats: list[str] = []
    for step in range(last_step + 1):
        notes_at_step = events.get(step)
        if not notes_at_step:
            beats.append("r")
        elif len(notes_at_step) == 1:
            beats.append(notes_at_step[0])
        else:
            beats.append("(" + " ".join(notes_at_step) + ")")
    bars = [" ".join(beats[index:index + 16]) + " |"
            for index in range(0, len(beats), 16)]
    # alphaTex infers the guitar staff from fretted notes (fret.string). The
    # default guitar tuning is used, matching note_to_position above.
    return "\\title 'Tab IA' \\tempo 120 :16 " + " ".join(bars)
