"""Lumina — Agentic Penetration Testing System — FastAPI backend."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.scan_router import router as scan_router

app = FastAPI(title="Lumina Pentest API")

_origins_env = os.getenv(
    "CORS_ALLOW_ORIGINS", "http://localhost:3000,http://frontend:3000"
)
ALLOWED_ORIGINS = [origin.strip() for origin in _origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/hello")
def hello():
    """Health check — kept for backwards compatibility."""
    return {"message": "Lumina Pentest API is running"}


app.include_router(scan_router)
