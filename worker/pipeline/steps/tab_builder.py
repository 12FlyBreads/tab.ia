"""Guitar note positioning and text tablature rendering stage."""
from __future__ import annotations

from dataclasses import dataclass
from itertools import product

STRINGS = [("E", 40), ("A", 45), ("D", 50), ("G", 55), ("B", 59), ("e", 64)]
MAX_FRET = 22

# E standard, numbered in alphaTab order (1 = high e, 6 = low E).
_TUNING = tuple(reversed(STRINGS))


@dataclass(frozen=True)
class _Position:
    string: int  # alphaTab string number: 1=e ... 6=E
    fret: int


def _candidates(pitch: int) -> list[_Position]:
    return [_Position(number, pitch - opened)
            for number, (_name, opened) in enumerate(_TUNING, 1)
            if 0 <= pitch - opened <= MAX_FRET]


def _group_notes(notes: list[tuple[float, int]], tolerance: float = 0.04):
    """Group notes whose onsets are within 40 ms, preserving MIDI pitch order."""
    groups: list[tuple[float, list[int]]] = []
    for onset, pitch in sorted(notes):
        if groups and onset - groups[-1][0] <= tolerance:
            groups[-1][1].append(pitch)
        else:
            groups.append((onset, [pitch]))
    # Duplicate detections of the same pitch at one onset do not form a chord.
    return [(onset, list(dict.fromkeys(pitches))) for onset, pitches in groups]


def _chord_states(pitches: list[int]) -> list[tuple[_Position, ...]]:
    choices = [_candidates(pitch) for pitch in pitches]
    if any(not choice for choice in choices):
        return []
    states = [state for state in product(*choices)
              if len({position.string for position in state}) == len(state)]
    # Prefer compact chord shapes. Bass-string high frets are intrinsically costly.
    def shape_cost(state: tuple[_Position, ...]) -> float:
        frets = [p.fret for p in state]
        positive = [f for f in frets if f > 0]
        span = max(positive, default=0) - min(positive, default=0)
        string_span = max(p.string for p in state) - min(p.string for p in state)
        return (span * 1.2 + string_span * 0.35
                + sum(max(0, p.fret - 12) * (p.string - 1) * 0.18 for p in state))
    return sorted(states, key=shape_cost)


def map_notes(notes: list[tuple[float, int]]) -> list[tuple[float, int, _Position]]:
    """Choose playable string/fret positions with a Viterbi pass over chord states."""
    groups = _group_notes(notes)
    layers = [(onset, pitches, _chord_states(pitches))
              for onset, pitches in groups]
    layers = [layer for layer in layers if layer[2]]
    if not layers:
        return []

    costs: list[list[float]] = []
    parents: list[list[int]] = []
    for layer_index, (onset, _pitches, states) in enumerate(layers):
        current_costs, current_parents = [], []
        for state in states:
            frets = [p.fret for p in state if p.fret > 0]
            fret_span = max(frets, default=0) - min(frets, default=0)
            string_span = max(p.string for p in state) - min(p.string for p in state)
            intrinsic = (fret_span * 1.2 + string_span * 0.35
                         + sum(max(0, p.fret - 12) * (p.string - 1) * 0.18
                               for p in state))
            if layer_index == 0:
                current_costs.append(intrinsic)
                current_parents.append(-1)
                continue
            previous_onset, _previous_pitches, previous_states = layers[layer_index - 1]
            rapid = onset - previous_onset < 0.35
            best_cost, best_parent = float("inf"), 0
            for parent_index, previous in enumerate(previous_states):
                # Compare hand positions using the active fret span/center.
                old_frets = [p.fret for p in previous if p.fret > 0]
                new_frets = [p.fret for p in state if p.fret > 0]
                old_center = sum(old_frets) / len(old_frets) if old_frets else 0
                new_center = sum(new_frets) / len(new_frets) if new_frets else 0
                shift = abs(new_center - old_center)
                transition = shift + (shift - 4) ** 2 * 1.5 if shift > 4 else shift
                if rapid:
                    old_strings = {p.string for p in previous}
                    new_strings = {p.string for p in state}
                    transition += 1.4 * len(old_strings.symmetric_difference(new_strings))
                total = costs[-1][parent_index] + intrinsic + transition
                if total < best_cost:
                    best_cost, best_parent = total, parent_index
            current_costs.append(best_cost)
            current_parents.append(best_parent)
        costs.append(current_costs)
        parents.append(current_parents)

    chosen = [0] * len(layers)
    chosen[-1] = min(range(len(costs[-1])), key=costs[-1].__getitem__)
    for index in range(len(layers) - 1, 0, -1):
        chosen[index - 1] = parents[index][chosen[index]]
    mapped = []
    for layer_index, state_index in enumerate(chosen):
        onset, pitches, states = layers[layer_index]
        mapped.extend((onset, pitch, position)
                      for pitch, position in zip(pitches, states[state_index]))
    return mapped


def note_to_position(pitch: int) -> tuple[str, int] | None:
    positions = _candidates(pitch)
    if not positions:
        return None
    position = min(positions, key=lambda p: (p.fret + max(0, p.fret - 12) * (p.string - 1), p.string))
    return _TUNING[position.string - 1][0], position.fret


def make_tab(notes: list[tuple[float, int]], duration: float) -> str:
    rows = {name: [] for name, _ in reversed(STRINGS)}
    placed_notes = 0
    for _note_time, _pitch, position in map_notes(notes):
        string_name = _TUNING[position.string - 1][0]
        fret = position.fret
        placed_notes += 1
        width = max(2, len(str(fret)))
        for row in rows:
            rows[row].append(str(fret).rjust(width) if row == string_name else "-" * width)
    if not placed_notes:
        return "Nenhuma nota de guitarra foi identificada com confiança suficiente."
    lines = [f"{name}|" + " ".join(cells) + "|" for name, cells in rows.items()]
    lines.append(f"\nNotas detectadas: {len(notes)} · duração analisada: {duration:.1f}s")
    return "\n".join(lines)


def make_alphatex(notes: list[tuple[float, int]], duration: float, tempo: float = 120) -> str:
    """Convert detected guitar notes to alphaTex for alphaTab rendering/playback.

    Basic Pitch's MIDI objects are in-memory only. alphaTab imports score formats,
    so expose a score representation instead of trying to load a MIDI file.
    Onsets are quantized to sixteenths using the configured Basic Pitch tempo.
    """
    tempo = max(1, tempo)
    step_duration = 60 / tempo / 4
    events: dict[int, list[str]] = {}
    mapped = map_notes(notes)
    for onset, _pitch, position in mapped:
        fret, string_number = position.fret, position.string
        step = max(0, round(onset / step_duration))
        events.setdefault(step, []).append(f"{fret}.{string_number}")

    if not events:
        return ""

    last_step = max(max(events), round(max(0.0, duration) / step_duration) - 1)
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
    return f"\\title 'Tab IA' \\tempo {tempo:g} :16 " + " ".join(bars)
