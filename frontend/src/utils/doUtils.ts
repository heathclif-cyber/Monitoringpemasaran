export function calculateProportionalVolume(
  nominal: number,
  invoiceTotal: number,
  kontrakVolume: number,
): number {
  if (invoiceTotal > 0 && kontrakVolume > 0) {
    return Math.round((nominal / invoiceTotal) * kontrakVolume)
  }
  return kontrakVolume || 0
}

export function calculateSelisih(invoiceTotal: number, nominal: number): number {
  return invoiceTotal - nominal
}

export function getVolumePercentage(volumeDo: number, kontrakVolume: number): number {
  if (kontrakVolume <= 0) return 0
  return Math.round((volumeDo / kontrakVolume) * 100)
}
