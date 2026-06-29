import { formatDate } from '@/lib/utils'
import type { DeliveryOrder, Invoice, Kontrak, Pembayaran } from '@/types'

function getPembeliLabel(
  invoice: Invoice | undefined,
  kontrakByNo: Record<string, Kontrak | undefined>,
): string {
  if (!invoice?.no_kontrak) return '-'
  return kontrakByNo[invoice.no_kontrak]?.pembeli?.split('\n')[0]?.trim() || '-'
}

export function formatSupermanSelectLabel(
  pembayaran: Pick<Pembayaran, 'superman' | 'no_invoice' | 'tanggal_pembayaran' | 'no_pembayaran'>,
  invoiceByNo: Record<string, Invoice | undefined>,
  kontrakByNo: Record<string, Kontrak | undefined>,
): string {
  const superman = (pembayaran.superman || '').trim() || pembayaran.no_invoice
  const pembeli = getPembeliLabel(invoiceByNo[pembayaran.no_invoice], kontrakByNo)
  const tanggal = formatDate(pembayaran.tanggal_pembayaran)
  return `${superman} - ${pembeli} - ${tanggal}`
}

export function formatDOSelectLabel(
  doRow: Pick<DeliveryOrder, 'no_do' | 'no_invoice' | 'tanggal_do'>,
  invoiceByNo: Record<string, Invoice | undefined>,
  kontrakByNo: Record<string, Kontrak | undefined>,
): string {
  const pembeli = getPembeliLabel(invoiceByNo[doRow.no_invoice], kontrakByNo)
  const tanggal = formatDate(doRow.tanggal_do)
  return `${doRow.no_do} - ${pembeli} - ${tanggal}`
}

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
