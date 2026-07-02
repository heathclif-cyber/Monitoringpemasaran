import type { Kontrak } from '@/types'

/** PPh yang dipotong pembeli dari transfer bersih (net). */
export function pphOnNetTransfer(nominal: number, kontrak: Kontrak | null | undefined): number {
  if (!kontrak || nominal <= 0 || kontrak.is_pph !== 'true') return 0

  const ppnRate = (kontrak.ppn_persen || 0) / 100
  const pphRate = (kontrak.pph_persen || 0) / 100
  const hasPpn = kontrak.is_ppn !== 'false' && ppnRate > 0
  const denom = hasPpn ? 1 + ppnRate - pphRate : 1 - pphRate
  if (denom <= 0) return 0

  const pokok = nominal / denom
  return Math.round(pokok * pphRate)
}

/** Pelunasan efektif = transfer + PPh (jika PPh disetor pembeli). */
export function effectivePelunasan(
  nominal: number,
  isPphDisetor: string | null | undefined,
  kontrak: Kontrak | null | undefined,
): number {
  const base = Number(nominal) || 0
  if (String(isPphDisetor || 'false').toLowerCase() !== 'true') return base
  return base + pphOnNetTransfer(base, kontrak)
}

export function paymentProgressPercent(paid: number, invoiceTotal: number): number {
  if (invoiceTotal <= 0) return 0
  const pct = (paid / invoiceTotal) * 100
  if (paid >= invoiceTotal - 0.5) return 100
  return Math.min(99.9, Math.round(pct * 10) / 10)
}