import { formatDate } from '@/lib/utils'
import type { Invoice, Kontrak } from '@/types'

export function formatInvoiceSelectLabel(
  invoice: Invoice,
  kontrakByNo: Record<string, Kontrak | undefined>,
): string {
  const pembeli = kontrakByNo[invoice.no_kontrak]?.pembeli?.split('\n')[0]?.trim() || '-'
  const tanggal = formatDate(invoice.tanggal_transaksi)
  return `${invoice.no_invoice} - ${pembeli} - ${tanggal}`
}