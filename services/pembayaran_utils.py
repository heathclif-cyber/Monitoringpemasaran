"""Perhitungan pelunasan pembayaran (termasuk PPh disetor pembeli)."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import models

# Selisih di bawah Rp 100 dianggap lunas (pembulatan PPh/transfer).
PAYMENT_LUNAS_TOLERANCE = 99


def is_invoice_paid(paid_total: float, invoice_total: float) -> bool:
    return invoice_total > 0 and paid_total >= invoice_total - PAYMENT_LUNAS_TOLERANCE


def pph_on_net_transfer(nominal: float, kontrak: "models.Kontrak | None") -> float:
    """PPh yang dipotong pembeli saat transfer bersih."""
    if not kontrak or nominal <= 0:
        return 0.0
    if str(getattr(kontrak, "is_pph", "false")).lower() != "true":
        return 0.0

    ppn_rate = float(getattr(kontrak, "ppn_persen", 0) or 0) / 100
    pph_rate = float(getattr(kontrak, "pph_persen", 0) or 0) / 100
    has_ppn = str(getattr(kontrak, "is_ppn", "true")).lower() != "false" and ppn_rate > 0
    denom = (1 + ppn_rate - pph_rate) if has_ppn else (1 - pph_rate)
    if denom <= 0:
        return 0.0

    pokok = nominal / denom
    return round(pokok * pph_rate)


def effective_pelunasan(
    nominal: float,
    is_pph_disetor: str | None,
    kontrak: "models.Kontrak | None",
) -> float:
    """Pelunasan untuk cek lunas/Superman.

    PPh yang dipotong pembeli selalu dianggap bagian pembayaran jika kontrak
    kena PPh. Parameter is_pph_disetor hanya untuk pelacakan di Laporan Digital.
    """
    _ = is_pph_disetor
    base = float(nominal or 0)
    if str(getattr(kontrak, "is_pph", "false") if kontrak else "false").lower() != "true":
        return base
    return base + pph_on_net_transfer(base, kontrak)


def pembayaran_paid_total(payments: list["models.Pembayaran"], kontrak: "models.Kontrak | None") -> float:
    return sum(
        effective_pelunasan(p.nominal_transfer, p.is_pph_disetor, kontrak)
        for p in payments
    )


def max_nominal_transfer(
    sisa_pelunasan: float,
    kontrak: "models.Kontrak | None",
) -> float:
    """Batas nominal transfer agar pelunasan (termasuk PPh dipotong pembeli) tidak melebihi sisa."""
    target = max(0.0, float(sisa_pelunasan or 0))
    if target <= 0:
        return 0.0
    if str(getattr(kontrak, "is_pph", "false") if kontrak else "false").lower() != "true":
        return round(target)

    lo, hi = 0, int(target)
    best = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if effective_pelunasan(mid, None, kontrak) <= target + 0.5:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return float(best)