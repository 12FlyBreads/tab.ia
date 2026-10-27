"""Guitar note positioning and text tablature rendering."""
from __future__ import annotations

STRINGS = [("E", 40), ("A", 45), ("D", 50), ("G", 55), ("B", 59), ("e", 64)]
MAX_FRET = 22


def note_to_position(pitch: int) -> tuple[str, int] | None:
    """Choose the first standard-tuned string/fret position for a MIDI pitch."""
    for name, open_pitch in STRINGS:
        fret = pitch - open_pitch
        if 0 <= fret <= MAX_FRET:
            return name, fret
    return None


def make_tab(notes: list[tuple[float, int]], duration: float) -> str:
    """Render a compact monospaced tab timeline, one column per detected note."""
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
