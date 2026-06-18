#!/usr/bin/env python
"""Ringkas struktur PDF contoh SPPn di uploads/Contoh SPPN."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pypdf import PdfReader

FOLDER = ROOT / "uploads" / "Contoh SPPN"


def parse_pdf(path: Path) -> dict:
    text = "\n".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    def after(label: str) -> str:
        for i, ln in enumerate(lines):
            if label.lower() in ln.lower():
                if ":" in ln:
                    val = ln.split(":", 1)[1].strip()
                    if val:
                        return val
                if i + 1 < len(lines):
                    return lines[i + 1]
        return ""

    items = []
    for ln in lines:
        m = re.match(
            r"^(\d{8})\s+(8S\d+)\s+(A\d{4})\s+(A\d{7})\s+(.+)$",
            ln.replace("  ", " "),
        )
        if m:
            items.append(
                {
                    "gl": m.group(1),
                    "sap": m.group(2),
                    "pc": m.group(3),
                    "cf": m.group(4),
                    "uraian_start": m.group(5)[:80],
                }
            )

    return {
        "file": path.name,
        "nomor": after("Nomor"),
        "tanggal": after("Tanggal"),
        "kwitansi": after("Kwitansi dari"),
        "ba_au58": after("BA / AU 58"),
        "items": items,
        "terbilang_line": next((ln for ln in lines if "TERBILANG" in ln.upper()), ""),
    }


def main() -> int:
    if not FOLDER.exists():
        print(f"Folder tidak ada: {FOLDER}", file=sys.stderr)
        return 1
    for pdf in sorted(FOLDER.glob("*.pdf")):
        data = parse_pdf(pdf)
        print(f"\n=== {data['file']} ===")
        print(f"Nomor   : {data['nomor']}")
        print(f"Tanggal : {data['tanggal']}")
        print(f"Kwitansi: {data['kwitansi']}")
        print(f"BA/AU58 : {data['ba_au58']}")
        for i, item in enumerate(data["items"], 1):
            print(
                f"  Baris {i}: GL={item['gl']} SAP={item['sap']} "
                f"PC={item['pc']} CF={item['cf']}"
            )
            print(f"           {item['uraian_start']}...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())