"""Repository-local temporary storage for worker audio artifacts."""
from __future__ import annotations

import shutil
from pathlib import Path

TEMP_ROOT = Path(__file__).resolve().parent.parent / "temp"
UPLOADS_DIR = TEMP_ROOT / "uploads"
SEPARATION_DIR = TEMP_ROOT / "separation"
PREVIEWS_DIR = TEMP_ROOT / "previews"


def reset_temp_root() -> None:
    """Remove leftovers from previous runs and create the working folders."""
    shutil.rmtree(TEMP_ROOT, ignore_errors=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    SEPARATION_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)


def clear_temp_root() -> None:
    """Clear all temporary artifacts while leaving an empty /temp directory."""
    shutil.rmtree(TEMP_ROOT, ignore_errors=True)
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)


def upload_path(job_id: str, extension: str) -> Path:
    job_dir = UPLOADS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir / f"source{extension}"


def preview_path(job_id: str) -> Path:
    job_dir = PREVIEWS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir / "guitar.mp3"


def cleanup_upload(path: str | Path | None) -> None:
    _remove_file_and_empty_parent(path, UPLOADS_DIR)


def cleanup_preview(path: str | Path | None) -> None:
    _remove_file_and_empty_parent(path, PREVIEWS_DIR)


def _remove_file_and_empty_parent(path: str | Path | None, allowed_root: Path) -> None:
    if not path:
        return
    target = Path(path)
    try:
        target.resolve().relative_to(allowed_root.resolve())
    except ValueError:
        return
    target.unlink(missing_ok=True)
    try:
        target.parent.rmdir()
    except OSError:
        pass
