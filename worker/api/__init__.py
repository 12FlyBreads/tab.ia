"""FastAPI application entry point (``uvicorn api:app`` from worker/)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.routes.jobs import router as jobs_router
from utils.file_manager import clear_temp_root, reset_temp_root


@asynccontextmanager
async def lifespan(_app: FastAPI):
    reset_temp_root()
    try:
        yield
    finally:
        clear_temp_root()


app = FastAPI(title="Tab IA API", version="1.0.0", lifespan=lifespan)
app.include_router(jobs_router)

__all__ = ["app"]
