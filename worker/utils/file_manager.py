"""Create, locate, and clean up temporary job artifacts."""
from __future__ import annotations

import shutil
from pathlib import Path

from core.config import PREVIEWS_DIR, SEPARATION_DIR, TEMP_ROOT, UPLOADS_DIR


def reset_temp_root() -> None:
    shutil.rmtree(TEMP_ROOT, ignore_errors=True)
    for directory in (UPLOADS_DIR, SEPARATION_DIR, PREVIEWS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def clear_temp_root() -> None:
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
