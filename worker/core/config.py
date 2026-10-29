"""Shared worker configuration and filesystem locations."""
import os
from pathlib import Path

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
JOB_TTL_SECONDS = 3600

# Basic Pitch note decoding. Thresholds are probabilities between 0.0 and 1.0.
# Lower thresholds detect quieter notes but can add false positives.
BASIC_PITCH_ONSET_THRESHOLD = 0.5
BASIC_PITCH_FRAME_THRESHOLD = 0.3
# Minimum duration of a detected note, in milliseconds.
BASIC_PITCH_MINIMUM_NOTE_LENGTH_MS = 127.7
# Frequency limits in Hz; None keeps Basic Pitch's full supported range.
BASIC_PITCH_MINIMUM_FREQUENCY = 82
BASIC_PITCH_MAXIMUM_FREQUENCY = 1320
# Post-processing and MIDI options.
BASIC_PITCH_MELODIA_TRICK = True
BASIC_PITCH_MULTIPLE_PITCH_BENDS = False
BASIC_PITCH_MIDI_TEMPO = 120

PYTHON_API_URL = os.getenv("PYTHON_API_URL", "http://127.0.0.1:8000")
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8000"))
TEMP_ROOT = Path(__file__).resolve().parents[2] / "temp"
UPLOADS_DIR = TEMP_ROOT / "uploads"
SEPARATION_DIR = TEMP_ROOT / "separation"
PREVIEWS_DIR = TEMP_ROOT / "previews"
