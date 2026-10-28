"""Backward-compatible exports for the in-memory job state."""
from core.state import JOB_TTL_SECONDS, jobs, jobs_lock, remove_expired_jobs

__all__ = ["JOB_TTL_SECONDS", "jobs", "jobs_lock", "remove_expired_jobs"]
