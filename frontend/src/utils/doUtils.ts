export function calculateProportionalVolume(
  nominal: number,
  nilaiPenuh: number,
  unitVolume: number,
): number {
  if (nilaiPenuh > 0 && unitVolume > 0 && nominal > 0) {
    return Math.round((nominal / nilaiPenuh) * unitVolume)
  }
  if (nominal <= 0) return 0
  return unitVolume || 0
}

export function calculateSelisih(invoiceTotal: number, nominal: number): number {
  return invoiceTotal - nominal
}

export function getVolumePercentage(volumeDo: number, kontrakVolume: number): number {
  if (kontrakVolume <= 0) return 0
  return Math.round((volumeDo / kontrakVolume) * 100)
}
