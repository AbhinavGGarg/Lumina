"""Pulse — Agentic Penetration Testing System — FastAPI backend."""

import asyncio
import uuid
from urllib.parse import urlparse

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from backend.graph import SCAN_GRAPH, GraphState
from backend.models import ScanRequest, ScanResponse, ScanState, ScanStatus
from backend.state_store import scans

app = FastAPI(title="Pulse Pentest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Allowlist enforcement ─────────────────────────────────────────────────────

import os
ALLOWED_TARGETS = os.getenv("ALLOWED_TARGETS", "target,localhost,127.0.0.1").split(",")

def _validate_target(target: str) -> None:
    if target.startswith("/repos/") or target.startswith("/tmp/"):
        return
    host = urlparse(target).hostname or ""
    if not host:
        raise HTTPException(status_code=400, detail="Could not parse target host")
    if not any(host == t or host.endswith(f".{t}") for t in ALLOWED_TARGETS):
        raise HTTPException(
            status_code=400,
            detail=f"Target '{host}' is not in the allowlist. Allowed: {ALLOWED_TARGETS}"
        )


# ── Background scan task ──────────────────────────────────────────────────────

async def _run_scan(scan_id: str, target: str) -> None:
    state = scans[scan_id]
    state.status = ScanStatus.running
    state.log.append(f"Scan started for target: {target}")
    try:
        await asyncio.to_thread(
            SCAN_GRAPH.invoke,
            GraphState(scan_id=scan_id, target=target),
        )
        # report + status are set inside graph.py report_node
    except Exception as e:
        state.status = ScanStatus.failed
        state.log.append(f"Scan failed: {e!r}")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/hello")
def hello():
    """Health check — kept for backwards compatibility."""
    return {"message": "Pulse Pentest API is running"}


@app.post("/api/scan")
async def start_scan(body: ScanRequest, background_tasks: BackgroundTasks) -> ScanResponse:
    """Start a new automated penetration test scan."""
    _validate_target(body.target)
    scan_id = str(uuid.uuid4())
    scans[scan_id] = ScanState(scan_id=scan_id, target=body.target)
    background_tasks.add_task(_run_scan, scan_id, body.target)
    return ScanResponse(scan_id=scan_id)


@app.get("/api/scan/{scan_id}")
async def get_scan(scan_id: str) -> ScanState:
    """Get current scan state including findings so far."""
    if scan_id not in scans:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scans[scan_id]


@app.get("/api/scan/{scan_id}/stream")
async def stream_scan(scan_id: str):
    """Server-Sent Events stream — pushes scan state updates every second."""
    if scan_id not in scans:
        raise HTTPException(status_code=404, detail="Scan not found")

    async def generator():
        while True:
            state = scans.get(scan_id)
            if state is None:
                break
            yield {"data": state.model_dump_json()}
            if state.status in (ScanStatus.complete, ScanStatus.failed):
                break
            await asyncio.sleep(1)

    return EventSourceResponse(generator())


@app.get("/api/scan/{scan_id}/report")
async def get_report(scan_id: str) -> dict:
    """Get the final Markdown vulnerability report."""
    if scan_id not in scans:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {"report": scans[scan_id].report, "status": scans[scan_id].status}


@app.get("/api/scans")
async def list_scans() -> list[dict]:
    """List all scans (summary only)."""
    return [
        {
            "scan_id": s.scan_id,
            "target": s.target,
            "status": s.status,
            "findings_count": len(s.findings),
        }
        for s in scans.values()
    ]
