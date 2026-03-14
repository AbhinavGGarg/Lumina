"""Pydantic models for Pulse scan state and API contracts."""

from enum import Enum

from pydantic import BaseModel


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
    scan_id:              str
    target:               str
    target_type:          str = ""
    architecture_summary: str = ""
    threat_model:         str = ""
    status:               ScanStatus = ScanStatus.pending
    current_agent:        str = ""
    agents_plan:          list[str] = []
    findings:             list[Finding] = []
    log:                  list[str] = []
    # Raw LLM token stream -- each entry is one token or a control sentinel.
    # Sentinels: "\x00START:<agent>" opens a block, "\x00END" closes it.
    llm_log:       list[str] = []
    report:        str = ""


class ScanRequest(BaseModel):
    target: str


class ScanResponse(BaseModel):
    scan_id: str
