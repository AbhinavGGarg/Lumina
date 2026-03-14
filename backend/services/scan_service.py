"""Background scan executor."""

import asyncio

from ..core.data_models import ScanStatus
from ..db.scans import scans
from .graph_service import SCAN_GRAPH, GraphState


async def run_scan_background(scan_id: str, target: str) -> None:
    """Execute the scan graph in a background thread."""
    state = scans[scan_id]
    state.status = ScanStatus.running
    state.log.append(f"Scan started for target: {target}")
    try:
        await asyncio.to_thread(
            SCAN_GRAPH.invoke,
            GraphState(scan_id=scan_id, target=target),
        )
        # report + status are set inside graph_service.py report_node
    except Exception as e:
        state.status = ScanStatus.failed
        state.log.append(f"Scan failed: {e!r}")
