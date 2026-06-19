"""Upload session Superman lokal ke volume Railway."""
from __future__ import annotations

import base64
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSION = ROOT / "scripts" / ".superman_state.json"


def main() -> int:
    if not SESSION.is_file():
        print(f"Session tidak ada: {SESSION}", file=sys.stderr)
        return 1

    b64 = base64.b64encode(SESSION.read_bytes()).decode("ascii")
    py = (
        "import base64, pathlib; "
        "p=pathlib.Path('/app/data'); p.mkdir(parents=True, exist_ok=True); "
        f"pathlib.Path('/app/data/.superman_state.json').write_bytes(base64.b64decode('{b64}')); "
        "print('session_written', pathlib.Path('/app/data/.superman_state.json').stat().st_size)"
    )
    railway = "railway.cmd" if sys.platform == "win32" else "railway"
    result = subprocess.run(
        [railway, "run", "python", "-c", py],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())