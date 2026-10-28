"""Backward-compatible exports for temporary file helpers."""
from core.config import PREVIEWS_DIR, SEPARATION_DIR, TEMP_ROOT, UPLOADS_DIR
from utils.file_manager import clear_temp_root, cleanup_preview, cleanup_upload, preview_path, reset_temp_root, upload_path

__all__ = ["TEMP_ROOT", "UPLOADS_DIR", "SEPARATION_DIR", "PREVIEWS_DIR", "reset_temp_root", "clear_temp_root", "upload_path", "preview_path", "cleanup_upload", "cleanup_preview"]
