"""Resolve a YouTube link/search and pass its audio to the normal pipeline."""
from __future__ import annotations

import logging
import threading
import uuid
from pathlib import Path
from time import time
from urllib.parse import urlparse

import yt_dlp

from core.config import MAX_UPLOAD_BYTES
from core.state import jobs, jobs_lock
from pipeline.orchestrator import process_job
from utils.file_manager import cleanup_upload, upload_path

LOG = logging.getLogger("tab-ia-api")
PREVIEW_TTL_SECONDS = 1800
youtube_previews: dict[str, dict] = {}
youtube_previews_lock = threading.Lock()


def search_youtube(query: str) -> list[dict]:
    """Return a small set of selectable YouTube search results without downloading."""
    if not query.strip() or len(query) > 200:
        raise ValueError("Digite pelo menos um termo de busca válido.")
    options = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    with yt_dlp.YoutubeDL(options) as downloader:
        result = downloader.extract_info(f"ytsearch5:{query.strip()}", download=False)
    entries = result.get("entries") or []
    return [
        {
            "id": entry.get("id"),
            "url": f"https://www.youtube.com/watch?v={entry.get('id')}",
            "title": entry.get("title") or "Vídeo sem título",
            "duration": entry.get("duration"),
            "thumbnail": entry.get("thumbnail"),
        }
        for entry in entries if entry and entry.get("id")
    ]


def download_youtube_source(source: str, destination: Path) -> Path:
    parsed = urlparse(source)
    if parsed.scheme or parsed.netloc:
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in {"http", "https"} or host not in {
            "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
        }:
            raise ValueError("Use um link válido do YouTube.")
        target = source
    else:
        target = f"ytsearch1:{source}"
    options = {
        "format": "bestaudio/best", "outtmpl": str(destination.with_suffix(".%(ext)s")),
        "noplaylist": True, "quiet": True, "no_warnings": True,
        "max_filesize": MAX_UPLOAD_BYTES,
        "match_filter": yt_dlp.utils.match_filter_func("!is_live & duration < 1200"),
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        downloader.extract_info(target, download=True)
    downloaded = destination.with_suffix(".mp3")
    if not downloaded.is_file() or downloaded.stat().st_size == 0:
        raise ValueError("Não foi possível baixar o áudio deste vídeo.")
    return downloaded


def create_youtube_preview(source: str) -> str:
    cleanup_expired_youtube_previews()
    preview_id = str(uuid.uuid4())
    destination = upload_path(preview_id, ".mp3")
    try:
        download_youtube_source(source, destination)
        with youtube_previews_lock:
            youtube_previews[preview_id] = {"path": destination.with_suffix(".mp3"), "created_at": time()}
        return preview_id
    except Exception:
        cleanup_upload(destination)
        raise


def get_youtube_preview(preview_id: str) -> Path | None:
    cleanup_expired_youtube_previews()
    with youtube_previews_lock:
        preview = youtube_previews.get(preview_id)
        path = Path(preview["path"]) if preview else None
    return path if path and path.is_file() else None


def consume_youtube_preview(preview_id: str) -> Path | None:
    with youtube_previews_lock:
        preview = youtube_previews.pop(preview_id, None)
    if not preview:
        return None
    path = Path(preview["path"])
    return path if path.is_file() else None


def discard_youtube_preview(preview_id: str) -> None:
    with youtube_previews_lock:
        preview = youtube_previews.pop(preview_id, None)
    if preview:
        cleanup_upload(preview["path"])


def cleanup_expired_youtube_previews() -> None:
    now = time()
    with youtube_previews_lock:
        expired = [key for key, item in youtube_previews.items() if now - item["created_at"] > PREVIEW_TTL_SECONDS]
        items = [youtube_previews.pop(key) for key in expired]
    for item in items:
        cleanup_upload(item["path"])


def process_youtube_job(job_id: str, source: str, start_seconds: float,
                        end_seconds: float | None, settings: dict) -> None:
    """Download a bounded YouTube audio file, then use the existing pipeline."""
    parsed = urlparse(source)
    if parsed.scheme or parsed.netloc:
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in {"http", "https"} or host not in {
            "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
        }:
            _fail(job_id, "Use um link válido do YouTube.")
            return
        target = source
    else:
        target = f"ytsearch1:{source}"

    destination = upload_path(job_id, ".mp3")
    try:
        with jobs_lock:
            if job_id not in jobs:
                return
            jobs[job_id].update(status="processing", updated_at=time())
        options = {
            "format": "bestaudio/best",
            "outtmpl": str(destination.with_suffix(".%(ext)s")),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "max_filesize": MAX_UPLOAD_BYTES,
            "match_filter": yt_dlp.utils.match_filter_func("!is_live & duration < 1200"),
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
        }
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(target, download=True)
            if info.get("_type") == "playlist":
                info = (info.get("entries") or [None])[0]
            if not info:
                raise ValueError("Nenhum vídeo foi encontrado.")
        downloaded = destination.with_suffix(".mp3")
        if not downloaded.is_file() or downloaded.stat().st_size == 0:
            raise ValueError("Não foi possível baixar o áudio deste vídeo.")
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["source_path"] = str(downloaded)
        process_job(job_id, str(downloaded), start_seconds, end_seconds, settings)
    except Exception as exc:
        cleanup_upload(destination)
        LOG.exception("Falha ao obter áudio do YouTube para o job %s", job_id)
        _fail(job_id, str(exc)[-2000:])


def _fail(job_id: str, error: str) -> None:
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(status="failed", error=error, updated_at=time())
