#!/usr/bin/env python
"""Login ke Superman dan simpan session Playwright."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from services.superman.auth import SupermanCaptchaError, _save_session, is_session_valid
from services.superman.config import SupermanConfig


def main() -> int:
    parser = argparse.ArgumentParser(description="Login Superman dan simpan session Playwright")
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Buka browser — isi captcha sendiri (disarankan jika OCR gagal)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Buat session baru meski file session sudah ada",
    )
    args = parser.parse_args()

    cfg = SupermanConfig.from_env()
    state_path = Path(cfg.state_path)

    if state_path.exists() and not args.force and not args.manual:
        if is_session_valid(cfg, state_path):
            print(f"Session masih valid: {state_path}")
            return 0
        print(f"Session kedaluwarsa, login ulang...")

    try:
        path = _save_session(cfg, manual=args.manual)
    except SupermanCaptchaError as exc:
        print(str(exc), file=sys.stderr)
        print(
            "\nCoba lagi dengan captcha manual:\n"
            "  python scripts/superman_login.py --manual --force",
            file=sys.stderr,
        )
        return 1

    print(f"Session Superman tersimpan: {path}")
    if args.manual:
        print(
            "\nUntuk Railway: salin file ini ke volume di SUPERMAN_STATE_PATH "
            "(mis. /app/data/.superman_state.json) agar tidak perlu OCR lagi."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())