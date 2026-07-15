export function calculateBAPokok(
  volumeBa: number,
  hargaSatuan: number,
  premi = 0,
  kontrakVolume = 0,
): number {
  let pokok = volumeBa * hargaSatuan
  if (kontrakVolume > 0 && premi > 0) {
    pokok += premi * (volumeBa / kontrakVolume)
  } else if (kontrakVolume <= 0 && premi > 0) {
    pokok += premi
  }
  return pokok
}

/** Bulat ke sen (2 desimal) — bukan ke rupiah utuh. Tampilan pakai formatCurrency. */
function asMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateBAInvoiceAmount(
  volumeBa: number,
  hargaSatuan: number,
  isPpn: string | boolean = 'true',
  ppnPersen = 11,
  premi = 0,
  kontrakVolume = 0,
): number {
  const pokok = calculateBAPokok(volumeBa, hargaSatuan, premi, kontrakVolume)
  const ppn =
    String(isPpn).toLowerCase() !== 'false' ? pokok * (ppnPersen / 100) : 0
  return asMoney(pokok + ppn)
}