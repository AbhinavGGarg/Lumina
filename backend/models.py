from pydantic import BaseModel
from enum import Enum


class ScanStatus(str, Enum):
    pending  = "pending"
    running  = "running"
    complete = "complete"
    failed   = "failed"


class Severity(str, Enum):
    critical = "critical"
    high     = "high"
    medium   = "medium"
    low      = "low"
    info     = "info"


class Finding(BaseModel):
    agent:       str
    tool:        str
    severity:    Severity = Severity.info
    title:       str
    description: str
    evidence:    str = ""
    remediation: str = ""


class ScanState(BaseModel):
    scan_id:       str
    target:        str
    target_type:   str = ""
    status:        ScanStatus = ScanStatus.pending
    current_agent: str = ""
    findings:      list[Finding] = []
    log:           list[str] = []
    report:        str = ""


class ScanRequest(BaseModel):
    target: str


class ScanResponse(BaseModel):
    scan_id: str
