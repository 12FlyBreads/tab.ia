"""Shared worker configuration and filesystem locations."""
import os
from pathlib import Path

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
JOB_TTL_SECONDS = 3600
PYTHON_API_URL = os.getenv("PYTHON_API_URL", "http://127.0.0.1:8000")
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8000"))
TEMP_ROOT = Path(__file__).resolve().parents[2] / "temp"
UPLOADS_DIR = TEMP_ROOT / "uploads"
SEPARATION_DIR = TEMP_ROOT / "separation"
PREVIEWS_DIR = TEMP_ROOT / "previews"
