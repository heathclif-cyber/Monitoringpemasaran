from __future__ import annotations

import os

# GL PPN — tersedia di budget Superman (master_gl_tambah_v2)
GL_PPN = "21060008"

# GL PPh (setoran pajak) — contoh SPPb Regional 8
GL_PPH = os.getenv("SUPERMAN_GL_PPH", "11600000")

# A0205003 Pembayaran pajak PPH Masa
CF_PPH_ID = os.getenv("SUPERMAN_CF_PPH", "204")

# Penerima setoran PPh (tidak transfer)
KPP_RECIPIENT_NAME = os.getenv("SUPERMAN_KPP_NAME", "KPP Wajib Pajak Besar 3")

# SAP customer di cetakan SPPn
SAP_CUSTOMER = "8S00000001"

# Profit center: pencarian Select2 "Regional 8" → 8S00000001 REGIONAL 8
PROFIT_CENTER_SEARCH = "Regional 8"

# Cash flow master_cash_flow_id (bukan value select 1/2)
CF_PENDAPATAN_ID = "1"  # A0101000 Penerimaan kas dari pelanggan
CF_PPN_ID = "2"  # A0102000 Penerimaan kas lainnya

# GL pendapatan per komoditi — kode di master budget (bukan KBB cetak 11xxxx)
_KOMODITI_GL: list[tuple[str, str]] = [
    ("sawit", "41100000"),
    ("tbs", "41100000"),
    ("karet", "41100006"),
    ("gula", "41100026"),
    ("kelapa sawit", "41100027"),
    ("kelapa", "41100023"),
    ("teh", "41100015"),
    ("kopi", "41100017"),
]

_DEFAULT_GL_PENDAPATAN = "41100000"


def resolve_gl_pendapatan(komoditi: str, deskripsi: str = "") -> str:
    blob = f"{komoditi} {deskripsi}".lower()
    # lebih spesifik dulu (kelapa sawit sebelum kelapa)
    for key, gl in sorted(_KOMODITI_GL, key=lambda x: -len(x[0])):
        if key in blob:
            return gl
    return _DEFAULT_GL_PENDAPATAN