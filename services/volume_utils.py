"""Hitung volume proporsional — dipakai saat buat DO dan Volume Invoice.

Volume DO yang tersimpan adalah acuan operasional di Laporan (Jumlah_DO).
Sebelum DO terbit, Jumlah_DO = 0 dan Sisa_Volume = Volume_Invoice.
Rumus transfer memakai proporsi nilai invoice/scope, bukan `nominal / harga_satuan`
(itu mengabaikan PPN dan salah).
"""

from __future__ import annotations

from services.ba_utils import (
    ba_effective_harga,
    calculate_ba_invoice_amount,
    is_payung_ba,
    kontrak_nilai_maksimum,
)


def resolve_volume_scope(kontrak, invoice=None, ba=None) -> tuple[float, float]:
    """(volume_scope, nilai_penuh_scope) untuk proporsi volume.

    Sama logika dengan scope di laporan + create DO:
    - Payung BA → volume BA, nilai = nominal invoice BA (pokok+PPN BA)
    - Invoice unit → volume unit, nilai proporsional unit
    - Default → volume kontrak, nilai maks kontrak (pokok+PPN)
    """
    k_vol = float(getattr(kontrak, "volume", 0) or 0)
    vol_base = k_vol
    nilai_penuh = float(kontrak_nilai_maksimum(kontrak))

    if is_payung_ba(kontrak) and ba is not None and float(getattr(ba, "volume_ba", 0) or 0) > 0:
        vol_base = float(ba.volume_ba or 0)
        # Saat DO dibuat, pembagi = jumlah_pembayaran invoice (bukan hitung ulang BA)
        inv_gross = float(getattr(invoice, "jumlah_pembayaran", 0) or 0) if invoice else 0
        if inv_gross > 0:
            nilai_penuh = inv_gross
        else:
            nilai_penuh = float(
                calculate_ba_invoice_amount(kontrak, vol_base, ba_effective_harga(ba, kontrak))
            )
        return vol_base, nilai_penuh

    nama_unit = getattr(invoice, "nama_unit", None) if invoice else None
    units = getattr(kontrak, "units", None) or []
    if nama_unit and units:
        matched = next((u for u in units if u.nama_unit == nama_unit), None)
        if matched and float(getattr(matched, "volume", 0) or 0) > 0:
            vol_base = float(matched.volume or 0)
            if k_vol > 0:
                unit_ratio = vol_base / k_vol
                pokok_full = (k_vol * float(kontrak.harga_satuan or 0)) + float(kontrak.premi or 0)
                ppn_full = 0.0
                if str(getattr(kontrak, "is_ppn", "true")).lower() == "true":
                    ppn_full = pokok_full * (float(getattr(kontrak, "ppn_persen", 0) or 0) / 100)
                nilai_penuh = (pokok_full + ppn_full) * unit_ratio
            return vol_base, nilai_penuh

    return vol_base, nilai_penuh


def compute_proportional_volume(
    nominal: float,
    *,
    volume_scope: float,
    nilai_penuh: float,
    round_result: bool = False,
) -> float:
    """Volume = (nominal / nilai_penuh) × volume_scope — rumus DO resmi.

    Snap ke volume_scope penuh jika nominal ≈ nilai penuh (noise pembulatan
    harga/rupiah). Contoh: kontrak 9.000 kg bulat, invoice selisih Rp 2.610
    dari nilai hitung → volume tetap 9.000, bukan 8.999,79.
    """
    nom = float(nominal or 0)
    vol = float(volume_scope or 0)
    full = float(nilai_penuh or 0)
    if nom <= 0:
        return 0.0
    if full <= 0 or vol <= 0:
        result = vol
    else:
        # Hampir lunas scope (≥ 99.95% atau selisih ≤ max(Rp 5.000, 0,01% nilai))
        # → anggap volume penuh (bukan pecahan aneh di laporan).
        gap = abs(full - nom)
        tol_money = max(5000.0, full * 1e-4)
        if nom + 1e-9 >= full or gap <= tol_money or (nom / full) >= 0.9995:
            result = vol
        else:
            result = (nom / full) * vol
            # Hasil proporsi yang hanya beda < 0,5 unit dari scope penuh → snap
            if abs(result - vol) < 0.5:
                result = vol
    if round_result:
        return float(round(result))
    return float(result)


def compute_volume_for_invoice(kontrak, invoice, ba=None) -> float:
    """Volume invoice: utamakan field manual invoice.volume.

    Fallback (data lama): proporsi jumlah_pembayaran / scope, atau volume BA payung.
    """
    if not invoice:
        vol_base, _ = resolve_volume_scope(kontrak, None, ba)
        return vol_base

    stored = float(getattr(invoice, "volume", 0) or 0)
    if stored > 0:
        return stored

    if is_payung_ba(kontrak) and ba is not None and float(getattr(ba, "volume_ba", 0) or 0) > 0:
        return float(ba.volume_ba or 0)

    vol_base, nilai_penuh = resolve_volume_scope(kontrak, invoice, ba)
    inv_gross = float(getattr(invoice, "jumlah_pembayaran", 0) or 0)
    return compute_proportional_volume(
        inv_gross,
        volume_scope=vol_base,
        nilai_penuh=nilai_penuh,
        round_result=False,
    )


def compute_volume_for_transfer(kontrak, invoice, ba, nominal: float, *, round_result: bool = True) -> float:
    """Volume DO / estimasi pra-DO: **langsung dari invoice.volume**.

    Transfer bisa lebih kecil dari jumlah_pembayaran (PPh dipotong pembeli) —
    volume fisik tetap mengikuti invoice, bukan proporsi transfer, agar
    Volume Invoice = Volume DO selalu klop.

    Override manual di form DO tetap dimungkinkan di API (jika volume_do diisi).
    """
    inv_vol = compute_volume_for_invoice(kontrak, invoice, ba)
    nom = float(nominal or 0)

    if inv_vol > 0:
        result = inv_vol
    elif nom <= 0:
        result = 0.0
    else:
        # Fallback data lama tanpa invoice.volume
        vol_base, nilai_penuh = resolve_volume_scope(kontrak, invoice, ba)
        inv_gross = float(getattr(invoice, "jumlah_pembayaran", 0) or 0) if invoice else 0
        if is_payung_ba(kontrak) and inv_gross > 0:
            nilai_penuh = inv_gross
        result = compute_proportional_volume(
            nom,
            volume_scope=vol_base,
            nilai_penuh=nilai_penuh,
            round_result=False,
        )

    if round_result:
        return float(round(result))
    return float(result)
