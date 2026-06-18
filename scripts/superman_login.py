#!/usr/bin/env python
"""Login ke Superman dan simpan session Playwright."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from services.superman.auth import ensure_session
from services.superman.config import SupermanConfig


def main() -> int:
    cfg = SupermanConfig.from_env()
    path = ensure_session(cfg)
    print(f"Session Superman tersimpan: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())