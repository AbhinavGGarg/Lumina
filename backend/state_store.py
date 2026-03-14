from backend.models import ScanState

# In-memory scan store — sufficient for hackathon demo
scans: dict[str, ScanState] = {}
