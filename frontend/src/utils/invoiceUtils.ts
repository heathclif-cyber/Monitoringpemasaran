import { client } from '@/lib/client'
import { formatDate } from '@/lib/utils'
import type { Invoice, Kontrak, SupermanDocRequirement } from '@/types'

export interface SupermanDocRequirementsResult {
  requirements: SupermanDocRequirement[]
  ready: boolean
}

export function areMandatorySupermanDocsReady(requirements: SupermanDocRequirement[]): boolean {
  const mandatory = requirements.filter((r) => r.required !== false)
  return mandatory.length > 0 && mandatory.every((r) => r.uploaded)
}

export async function fetchInvoiceDocRequirements(
  noInvoice: string,
): Promise<SupermanDocRequirementsResult> {
  const query = `no_invoice=${encodeURIComponent(noInvoice)}`
  const paths = [
    `/api/pembayaran/doc-requirements?${query}`,
    `/api/superman/doc-requirements?${query}`,
  ]

  let lastError: unknown
  for (const path of paths) {
    try {
      const res = await client.get<{ requirements: SupermanDocRequirement[]; ready: boolean }>(path)
      const requirements = res.requirements || []
      return {
        requirements,
        ready: res.ready ?? areMandatorySupermanDocsReady(requirements),
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gagal memuat status dokumen pendukung')
}

export function formatInvoiceSelectLabel(
  invoice: Invoice,
  kontrakByNo: Record<string, Kontrak | undefined>,
): string {
  const pembeli = kontrakByNo[invoice.no_kontrak]?.pembeli?.split('\n')[0]?.trim() || '-'
  const tanggal = formatDate(invoice.tanggal_transaksi)
  return `${invoice.no_invoice} - ${pembeli} - ${tanggal}`
}