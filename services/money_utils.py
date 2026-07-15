"""Utilitas uang: hitung dengan desimal, bandingkan dengan toleransi sen.

Tampilan UI boleh dibulatkan (formatCurrency 0 digit),
tapi nilai tersimpan & validasi memakai desimal (bukan round ke rupiah utuh).
"""

from __future__ import annotations

# 1 sen — toleransi floating point / bandingkan total multi-invoice
MONEY_EPS = 0.01


def as_money(value: float | int | None) -> float:
    """Normalisasi ke 2 desimal (sen). Bukan bulat ke rupiah utuh."""
    return round(float(value or 0.0), 2)


def money_le(a: float, b: float, *, eps: float = MONEY_EPS) -> bool:
    """a <= b dengan toleransi sen."""
    return float(a) <= float(b) + eps


def money_gt(a: float, b: float, *, eps: float = MONEY_EPS) -> bool:
    """a > b dengan toleransi sen."""
    return float(a) > float(b) + eps


def money_remaining(limit: float, used: float) -> float:
    """Sisa kuota uang, tidak negatif di bawah noise float."""
    sisa = as_money(float(limit) - float(used))
    return sisa if sisa > MONEY_EPS else 0.0
