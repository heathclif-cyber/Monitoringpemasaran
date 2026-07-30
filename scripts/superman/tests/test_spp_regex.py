"""Quick test for SPP number extraction patterns."""
from __future__ import annotations

import re

_SPPN_NO_RE = re.compile(
    r"((?:R\d+/R\d+D/SPPn/|\d+(?:\.\d+)?/SPPn/)[^\s\"'<>]+)",
    re.I,
)
_SPPB_NO_RE = re.compile(
    r"((?:R\d+/R\d+D/SPPb/|\d+(?:\.\d+)?/SPP[BG]/)[^\s\"'<>]+)",
    re.I,
)

samples = [
    "R8/R08D/SPPb/23/VI/2026 + R8/R08D/SPPn/56/VI/2026",
    '{"sppn_no": "0123/SPPn/GKP-PTPN24/KKB/SG35/2026", "sppb_no": "0004/SPPB/GKP-PTPN24/KKB/SG35/2026"}',
    '{"nomor": "0123/SPPn/GKP-PTPN24/KKB/SG35/2026"}',
    "berita_acara_sppb: 0004/SPPB/GKP-PTPN24/KKB/SG35/2026",
]

for s in samples:
    sppb = _SPPB_NO_RE.search(s)
    sppn = _SPPN_NO_RE.search(s)
    print(sppb.group(1) if sppb else None, "|", sppn.group(1) if sppn else None)