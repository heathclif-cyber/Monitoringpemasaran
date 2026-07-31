/** Satuan non-Kg (butir historis + EA). Nama produk seperti KELAPA BUTIR tidak diubah. */

export function isEaSatuan(satuan?: string | null): boolean {
  const s = (satuan || '').trim().toLowerCase()
  return s === 'ea' || s === 'butir'
}

/** Normalisasi untuk form/select: Butir → EA; lainnya biarkan (default Kg). */
export function normalizeSatuan(satuan?: string | null): string {
  if (isEaSatuan(satuan)) return 'EA'
  const s = (satuan || '').trim()
  return s || 'Kg'
}
