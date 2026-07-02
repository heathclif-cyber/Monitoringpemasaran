import type { Kontrak } from '@/types'

/** Selisih pembulatan PPh (senilai backend Superman). */
export const PAYMENT_LUNAS_TOLERANCE = 1.5

export function isInvoicePaid(paid: number, invoiceTotal: number): boolean {
  return invoiceTotal > 0 && paid >= invoiceTotal - PAYMENT_LUNAS_TOLERANCE
}

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

/** Pelunasan untuk cek lunas/Superman — PPh dipotong pembeli selalu dihitung jika kontrak kena PPh. */
export function effectivePelunasan(
  nominal: number,
  _isPphDisetor: string | null | undefined,
  kontrak: Kontrak | null | undefined,
): number {
  const base = Number(nominal) || 0
  if (kontrak?.is_pph !== 'true') return base
  return base + pphOnNetTransfer(base, kontrak)
}

export function paymentProgressPercent(paid: number, invoiceTotal: number): number {
  if (invoiceTotal <= 0) return 0
  const pct = (paid / invoiceTotal) * 100
  if (isInvoicePaid(paid, invoiceTotal)) return 100
  return Math.min(99.9, Math.round(pct * 10) / 10)
}