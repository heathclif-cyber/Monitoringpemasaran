from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SupermanConfig:
    base_url: str
    username: str
    password: str
    flow_id: str
    bagian: str
    gl_pendapatan: str
    gl_ppn: str
    profit_center: str
    profit_center_ppn: str
    cash_flow: str
    state_path: str
    headless: bool
    slow_mo_ms: int

    @classmethod
    def from_env(cls) -> "SupermanConfig":
        base = os.getenv("SUPERMAN_URL", "https://superman.ptpn1.co.id/").rstrip("/") + "/"
        return cls(
            base_url=base,
            username=os.getenv("SUPERMAN_USER", ""),
            password=os.getenv("SUPERMAN_PASSWORD", ""),
            flow_id=os.getenv("SUPERMAN_FLOW_ID", "32"),
            bagian=os.getenv("SUPERMAN_BAGIAN", "223"),
            gl_pendapatan=os.getenv("SUPERMAN_GL_PENDAPATAN", "11000998"),
            gl_ppn=os.getenv("SUPERMAN_GL_PPN", "21060008"),
            profit_center=os.getenv("SUPERMAN_PROFIT_CENTER", "A0101"),
            profit_center_ppn=os.getenv("SUPERMAN_PROFIT_CENTER_PPN", "A0102"),
            cash_flow=os.getenv("SUPERMAN_CASH_FLOW", "1"),
            state_path=os.getenv(
                "SUPERMAN_STATE_PATH",
                os.path.join(os.path.dirname(__file__), "..", "..", "scripts", ".superman_state.json"),
            ),
            headless=os.getenv("SUPERMAN_HEADLESS", "true").lower() == "true",
            slow_mo_ms=int(os.getenv("SUPERMAN_SLOW_MO", "150")),
        )