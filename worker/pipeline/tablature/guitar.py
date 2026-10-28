"""Backward-compatible imports for guitar tablature generation."""
from pipeline.steps.tab_builder import MAX_FRET, STRINGS, make_tab, note_to_position

__all__ = ["STRINGS", "MAX_FRET", "note_to_position", "make_tab"]
