import type { LaporanRow, SapFieldGuide, SapImportCell, SapImportMapping, SapImportScope, SapReconciliationCheck, SapReconciliationResult } from '@/types'

export const SAP_FIELD_GUIDES: SapFieldGuide[] = [
  { key: 'documentNumber', label: 'Nomor dokumen SAP *', help: 'Nomor billing atau delivery sesuai jenis ekspor yang dipilih.', aliases: ['billing document', 'delivery', 'delivery document', 'billing_sap', 'do_sap'] },
  { key: 'localInvoice', label: 'Referensi invoice aplikasi', help: 'Nomor proforma aplikasi. Opsional jika nomor SAP sudah dicatat di aplikasi.', aliases: ['no_invoice', 'invoice aplikasi', 'local_invoice'] },
  { key: 'localDo', label: 'Referensi DO aplikasi', help: 'Nomor DO lokal untuk mencocokkan ekspor delivery.', aliases: ['no_do', 'do aplikasi', 'local_do'] },
  { key: 'salesOrder', label: 'Sales Order SAP', help: 'Nomor SO yang mendasari dokumen ini.', aliases: ['sales order', 'so_sap', 'salesorder'] },
  { key: 'quantity', label: 'Kuantitas total dokumen', help: 'Total billing atau delivery, bukan jumlah dari satu item saja.', aliases: ['billing quantity', 'delivery quantity', 'quantity', 'kuantitas'] },
  { key: 'unit', label: 'Satuan kuantitas', help: 'Misalnya KG atau EA. Satuan berbeda memerlukan konversi yang disepakati.', aliases: ['unit', 'sales unit', 'satuan', 'uom'] },
  { key: 'unitPrice', label: 'Harga dasar SAP', help: 'Harga dasar sebelum premi, pajak, diskon, dan ongkos. Hanya dibandingkan bila satu harga/material.', aliases: ['base price', 'harga dasar', 'unit_price'] },
  { key: 'pricingUnit', label: 'Per kuantitas harga', help: 'Harga berlaku per berapa satuan: misalnya 1 KG atau 100 KG. Wajib untuk membandingkan harga.', aliases: ['pricing unit', 'price unit', 'pricing_unit'] },
  { key: 'currency', label: 'Mata uang', help: 'Aplikasi saat ini memakai IDR. Nilai mata uang lain tidak dikonversi otomatis.', aliases: ['currency', 'document currency', 'mata_uang', 'waerk'] },
  { key: 'grossAmount', label: 'Total billing termasuk PPN', help: 'Total billing sebelum pengurangan PPh, bukan cash-in atau nilai neto tanpa pajak.', aliases: ['gross amount', 'total termasuk ppn', 'gross_amount'] },
  { key: 'netAmount', label: 'DPP / nilai sebelum PPN', help: 'Total sebelum PPN. Pembanding lokal merupakan estimasi dari total invoice dan tarif kontrak, bukan DPP faktur pajak terverifikasi.', aliases: ['net amount', 'net_amount', 'dpp', 'nilai sebelum ppn'] },
  { key: 'vatAmount', label: 'Nominal PPN', help: 'Hanya PPN, bukan gabungan seluruh pajak SAP. Pembanding lokal merupakan estimasi dari tarif kontrak.', aliases: ['vat amount', 'vat_amount', 'nominal ppn', 'ppn'] },
  { key: 'withholdingAmount', label: 'Nominal PPh dipotong/dipungut', help: 'Nominal PPh dari sumber yang sesuai; tidak membuktikan penyetoran. Jangan gunakan total pajak SAP sebagai PPh.', aliases: ['withholding amount', 'withholding_amount', 'nominal pph', 'pph'] },
  { key: 'documentDate', label: 'Document Date', help: 'Tanggal dokumen SAP ini, berbeda dari tanggal penciptaan di sistem atau tanggal invoice lokal.', aliases: ['document date', 'document_date'] },
  { key: 'pricingDate', label: 'Pricing Date', help: 'Tanggal acuan kondisi harga. Tidak diisi otomatis dari tanggal kontrak.', aliases: ['pricing date', 'pricing_date', 'prsdt'] },
  { key: 'plannedGiDate', label: 'Planned GI Date', help: 'Tanggal rencana posting barang keluar, bukan sekadar tanggal penerbitan DO.', aliases: ['planned gi date', 'planned goods issue date', 'plannedgidate', 'wadat'] },
  { key: 'actualGiDate', label: 'Actual GI Date', help: 'Tanggal aktual posting barang keluar. Tanggal DO atau transfer bukan penggantinya.', aliases: ['actual gi date', 'actual goods issue date', 'actual goods movement date', 'wadat_ist'] },
  { key: 'billingDate', label: 'Billing Date SAP', help: 'Tanggal billing pada SAP. Bulan buku dan tanggal proforma tetap data terpisah.', aliases: ['billing date', 'billing_date', 'fkdat'] },
  { key: 'giStatus', label: 'Status goods issue', help: 'Status yang diekspor SAP. Nomor delivery terisi tidak membuktikan PGI selesai.', aliases: ['gi status', 'goods movement status', 'gi_status'] },
  { key: 'billingStatus', label: 'Status billing', help: 'Status billing/pembatalan dari sumber SAP. Nomor billing terisi tidak membuktikan posting FI.', aliases: ['billing status', 'billing_status'] },
]

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (value: SapImportCell | undefined) => String(value ?? '').trim()
// Document numbers exported as numbers lose their leading zeros; punctuation is significant.
const documentKey = (value: string) => /^\d+$/.test(value.trim()) ? value.trim().replace(/^0+(?=\d)/, '') : value.trim().toUpperCase()
const validRef = (value: string) => value.trim() && value.trim() !== '-' && value.trim() !== '—'

// Invoice totals repeat across DO rows. Never sum DO-level tax allocations here.
export function invoiceTaxEstimate(row: LaporanRow) {
  const gross = row.Jumlah_Invoice
  const vatRate = row.PPN_Persen
  const withholdingRate = row.PPh_Persen
  if (typeof vatRate !== 'number' || typeof withholdingRate !== 'number' || ![gross, vatRate, withholdingRate].every(Number.isFinite) || gross <= 0 || vatRate < 0 || withholdingRate < 0) return null
  const net = gross / (1 + vatRate / 100)
  return { net, vat: gross - net, withholding: net * withholdingRate / 100 }
}

export function pphEvidenceLabel(row: LaporanRow): string {
  if (typeof row.PPh_Persen !== 'number' || !Number.isFinite(row.PPh_Persen) || row.PPh_Persen < 0) return 'Status PPh belum diketahui'
  if (row.PPh_Persen === 0) return 'Tidak berlaku'
  const marked = ['true', 'disetor', 'sudah'].includes(String(row.PPh_Setor).trim().toLowerCase())
  return marked ? 'Ditandai disetor — belum diverifikasi' : 'Belum ada bukti tercatat'
}
const unitKey = (value: string) => {
  const unit = value.trim().toUpperCase()
  return ['KG', 'KGM', 'KILOGRAM'].includes(unit) ? 'KG' : ['EA', 'BUTIR'].includes(unit) ? 'EA' : unit
}

export function suggestSapMapping(headers: string[]): SapImportMapping {
  const mapping: SapImportMapping = {}
  for (const field of SAP_FIELD_GUIDES) {
    const indexes = headers.map((header, index) => field.aliases.some((alias) => normalizeHeader(alias) === normalizeHeader(header)) ? index : -1).filter((index) => index >= 0)
    if (indexes.length === 1) mapping[field.key] = indexes[0]
  }
  return mapping
}

export function parseSapNumber(value: SapImportCell, format: 'id' | 'en'): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Angka tidak valid')
    return value
  }
  const raw = value.trim().replace(/\s/g, '')
  if (!raw) throw new Error('Angka kosong')
  const pattern = format === 'id' ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/ : /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/
  if (!pattern.test(raw)) throw new Error(`Format angka tidak valid: ${value}`)
  const number = Number(format === 'id' ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, ''))
  if (!Number.isFinite(number)) throw new Error('Angka di luar batas')
  return number
}

export function parseSapDate(value: SapImportCell): string {
  if (!text(value)) return ''
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 61 || value > 2958465) throw new Error('Tanggal Excel tidak valid')
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10)
  }
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const dmy = value.trim().match(/^(\d{2})[./](\d{2})[./](\d{4})$/)
  if (!iso && !dmy) throw new Error(`Tanggal harus YYYY-MM-DD atau DD.MM.YYYY: ${value}`)
  const year = Number(iso ? iso[1] : dmy![3])
  const month = Number(iso ? iso[2] : dmy![2])
  const day = Number(iso ? iso[3] : dmy![1])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`Tanggal tidak valid: ${value}`)
  return date.toISOString().slice(0, 10)
}

export function reconcileSapRows(data: SapImportCell[][], mapping: SapImportMapping, scope: SapImportScope, numberFormat: 'id' | 'en', localRows: LaporanRow[], firstDataRow = 2): SapReconciliationResult[] {
  if (mapping.documentNumber === undefined) throw new Error('Pilih kolom nomor dokumen SAP')
  const mappedColumns = Object.values(mapping).filter((value) => value !== undefined)
  if (new Set(mappedColumns).size !== mappedColumns.length) throw new Error('Satu kolom tidak boleh digunakan untuk beberapa field')
  if (scope === 'delivery' && ['grossAmount', 'netAmount', 'vatAmount', 'withholdingAmount'].some((key) => mapping[key as keyof SapImportMapping] !== undefined)) throw new Error('Nilai billing/pajak hanya dibandingkan pada ekspor billing')
  const counts = new Map<string, number>()
  const importedInvoiceDocuments = new Map<string, Set<string>>()
  for (const cells of data) {
    const key = documentKey(text(cells[mapping.documentNumber]))
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    if (scope === 'billing' && mapping.localInvoice !== undefined) {
      const invoice = documentKey(text(cells[mapping.localInvoice]))
      if (validRef(invoice) && key) {
        const documents = importedInvoiceDocuments.get(invoice) ?? new Set<string>()
        documents.add(key)
        importedInvoiceDocuments.set(invoice, documents)
      }
    }
  }
  return data.map((cells, index) => {
    const get = (key: keyof SapImportMapping) => mapping[key] === undefined ? undefined : cells[mapping[key]!]
    const doc = text(get('documentNumber'))
    const result: SapReconciliationResult = { sourceRow: firstDataRow + index, documentNumber: doc, localInvoice: '', localDo: '', status: 'invalid', message: '', checks: [] }
    try {
      if (!validRef(doc)) throw new Error('Nomor dokumen SAP kosong')
      if ((counts.get(documentKey(doc)) ?? 0) > 1) {
        result.status = 'ambiguous'
        result.message = 'Nomor SAP berulang. Gunakan satu baris total per dokumen; ekspor per item belum dibandingkan.'
        return result
      }
      const localInvoice = text(get('localInvoice'))
      const localDo = text(get('localDo'))
      if (scope === 'billing' && (importedInvoiceDocuments.get(documentKey(localInvoice))?.size ?? 0) > 1) {
        result.status = 'ambiguous'
        result.message = 'Beberapa billing SAP mengarah ke satu invoice lokal. Billing parsial perlu dipetakan sebelum total dibandingkan.'
        return result
      }
      if (scope === 'billing' && validRef(localDo)) throw new Error('Referensi DO hanya digunakan pada ekspor delivery')
      const referenceField = scope === 'billing' ? 'Billing' : 'DO_SAP'
      const eligible = localRows.filter((row) => !row.No_DO.startsWith('BYPASS-') && validRef(row.No_Invoice))
      const refMatches = eligible.filter((row) => validRef(row[referenceField]) && documentKey(row[referenceField]) === documentKey(doc))
      const localMatches = eligible.filter((row) => (!validRef(localInvoice) || documentKey(row.No_Invoice) === documentKey(localInvoice)) && (!validRef(localDo) || documentKey(row.No_DO) === documentKey(localDo)))
      let candidates = validRef(localInvoice) || validRef(localDo) ? localMatches : refMatches
      if ((validRef(localInvoice) || validRef(localDo)) && refMatches.some((row) => !localMatches.includes(row))) throw new Error('Referensi lokal bertentangan dengan nomor SAP yang sudah tersimpan')
      if (scope === 'delivery') candidates = candidates.filter((row) => validRef(row.No_DO))
      const groups = new Map<string, LaporanRow[]>()
      for (const row of candidates) {
        const key = scope === 'billing' ? row.No_Invoice : row.No_DO
        groups.set(key, [...(groups.get(key) ?? []), row])
      }
      if (groups.size === 0) { result.status = 'unmatched'; result.message = 'Tidak ditemukan pasangan berdasarkan nomor SAP atau referensi lokal.'; return result }
      if (groups.size > 1) { result.status = 'ambiguous'; result.message = 'Referensi mengarah ke beberapa dokumen lokal. Lengkapi referensi invoice/DO.'; return result }
      const matchedGroup = [...groups.values()][0]
      const local = matchedGroup[0]
      const group = scope === 'billing' ? eligible.filter((row) => row.No_Invoice === local.No_Invoice) : matchedGroup
      result.localInvoice = local.No_Invoice
      result.localDo = scope === 'delivery' ? local.No_DO : ''
      const checks = result.checks
      const unique = <T extends string | number>(values: T[]): T[] => [...new Set(values)]
      const refs = unique(group.map((row) => row[referenceField].trim()).filter(validRef))
      if (refs.length > 1) throw new Error('Satu invoice lokal mempunyai beberapa referensi billing SAP; perlu rekonsiliasi billing parsial')
      checks.push({ label: scope === 'billing' ? 'Nomor billing' : 'Nomor delivery', local: refs[0] || 'Belum dicatat', sap: doc, state: !refs.length ? 'pending' : documentKey(refs[0]) === documentKey(doc) ? 'match' : 'difference' })
      if (validRef(text(get('salesOrder')))) {
        const orders = unique(group.map((row) => row.SO_SAP.trim()).filter(validRef))
        checks.push({ label: 'Sales Order', local: orders.join(', ') || 'Belum dicatat', sap: text(get('salesOrder')), state: orders.length === 1 ? documentKey(orders[0]) === documentKey(text(get('salesOrder'))) ? 'match' : 'difference' : 'pending' })
      }
      const currency = text(get('currency')).toUpperCase()
      const sapUnit = unitKey(text(get('unit')))
      const localUnits = unique(group.map((row) => unitKey(row.Satuan)))
      const sameUnit = !!sapUnit && localUnits.length === 1 && sapUnit === localUnits[0]
      if (currency) checks.push({ label: 'Mata uang', local: 'IDR', sap: currency, state: currency === 'IDR' ? 'match' : 'pending', message: currency === 'IDR' ? undefined : 'Tidak ada konversi kurs otomatis.' })
      if (sapUnit) checks.push({ label: 'Satuan', local: localUnits.join(', '), sap: sapUnit, state: sameUnit ? 'match' : 'pending', message: sameUnit ? undefined : 'Konversi satuan perlu dipastikan sebelum membandingkan kuantitas/harga.' })
      const numeric = (key: 'quantity' | 'unitPrice' | 'grossAmount' | 'netAmount' | 'vatAmount' | 'withholdingAmount', label: string, localValues: number[], comparable: boolean, message: string, divisor = 1) => {
        if (mapping[key] === undefined) return
        const raw = get(key)
        if (raw === undefined || !text(raw)) { checks.push({ label, local: '', sap: 'Kosong', state: 'pending' }); return }
        const value = parseSapNumber(raw, numberFormat) / divisor
        if (value < 0) throw new Error(`${label} negatif; dokumen retur/kredit memerlukan pemetaan tersendiri`)
        const distinct = unique(localValues)
        if (!comparable || distinct.length !== 1 || !Number.isFinite(distinct[0])) { checks.push({ label, local: distinct.join(', '), sap: String(value), state: 'pending', message }); return }
        const tolerance = key === 'quantity' ? 0.000001 : key === 'unitPrice' ? 0.01 : 1
        checks.push({ label, local: String(distinct[0]), sap: String(value), state: Math.abs(distinct[0] - value) <= tolerance ? 'match' : 'difference', message: `Selisih SAP − aplikasi: ${value - distinct[0]}` })
      }
      numeric('quantity', scope === 'billing' ? 'Volume invoice' : 'Volume DO (bukan konfirmasi PGI)', group.map((row) => scope === 'billing' ? row.Volume_Invoice : row.Volume_DO_Dokumen ?? row.Jumlah_DO), sameUnit, 'Satuan atau volume lokal belum dapat dipastikan.')
      const pricingUnit = get('pricingUnit')
      let denominator = 0
      if (pricingUnit !== undefined && text(pricingUnit)) {
        denominator = parseSapNumber(pricingUnit, numberFormat)
        if (denominator <= 0) throw new Error('Per kuantitas harga harus lebih dari nol')
      }
      const materials = unique(group.map((row) => `${row.Komoditi}|${row.Deskripsi_Produk}|${row.Harga_Satuan}`))
      numeric('unitPrice', 'Harga dasar per satuan', group.map((row) => row.Harga_Satuan), currency === 'IDR' && sameUnit && denominator > 0 && materials.length === 1, 'Perlu IDR, satuan sama, per kuantitas harga, dan satu material/harga lokal.', denominator || 1)
      numeric('grossAmount', 'Total invoice termasuk PPN, sebelum PPh', group.map((row) => row.Jumlah_Invoice), scope === 'billing' && currency === 'IDR', 'Total hanya dibandingkan untuk billing dalam IDR.')
      const estimates = group.map(invoiceTaxEstimate)
      const taxComparable = scope === 'billing' && currency === 'IDR' && estimates.every(Boolean) && unique(group.map((row) => `${row.PPN_Persen}|${row.PPh_Persen}`)).length === 1
      const taxMessage = 'Perlu billing IDR dan tarif kontrak konsisten. Pembanding adalah estimasi, bukan verifikasi faktur pajak atau bukti setor.'
      numeric('netAmount', 'Nilai sebelum PPN (estimasi kontrak)', estimates.map((value) => value?.net ?? NaN), taxComparable, taxMessage)
      numeric('vatAmount', 'PPN invoice (estimasi kontrak)', estimates.map((value) => value?.vat ?? NaN), taxComparable, taxMessage)
      numeric('withholdingAmount', 'PPh invoice (estimasi kontrak)', estimates.map((value) => value?.withholding ?? NaN), taxComparable, taxMessage)
      if (scope === 'billing' && ['netAmount', 'vatAmount', 'withholdingAmount'].some((key) => mapping[key as keyof SapImportMapping] !== undefined)) {
        checks.push({ label: 'Dasar pemeriksaan pajak', local: 'Estimasi total invoice × tarif kontrak', sap: 'Nominal ekspor', state: 'info', message: 'Kesamaan nominal bukan verifikasi DPP faktur pajak, bukti potong/pungut, atau penyetoran PPh. PPh perlu sumber FI/perpajakan yang sesuai.' })
        checks.push({ label: 'Bukti penyetoran PPh', local: group.map(pphEvidenceLabel).filter((value, index, all) => all.indexOf(value) === index).join('; '), sap: 'Tidak diverifikasi melalui ekspor ini', state: 'info' })
      }
      for (const key of ['documentDate', 'pricingDate', 'plannedGiDate', 'actualGiDate', 'billingDate'] as const) {
        if (mapping[key] === undefined || !text(get(key))) continue
        const date = parseSapDate(get(key)!)
        const guide = SAP_FIELD_GUIDES.find((field) => field.key === key)!
        checks.push({ label: guide.label, local: 'Belum tersedia sebagai field SAP', sap: date, state: 'info', message: guide.help })
      }
      for (const key of ['giStatus', 'billingStatus'] as const) {
        if (text(get(key))) checks.push({ label: SAP_FIELD_GUIDES.find((field) => field.key === key)!.label, local: 'Belum diverifikasi dari SAP', sap: text(get(key)), state: 'info', message: 'Ditampilkan sesuai ekspor; arti kode status mengikuti konfigurasi SAP.' })
      }
      const cancelled = /cancel|batal|revers|retur|credit|kredit/i.test(text(get('billingStatus')))
      if (cancelled) checks.push({ label: 'Jenis/status dokumen', local: 'Invoice aktif', sap: text(get('billingStatus')), state: 'pending', message: 'Dokumen batal/kredit tidak boleh dianggap billing aktif yang cocok.' })
      const hasNumericComparison = checks.some((check) => ['Volume invoice', 'Volume DO (bukan konfirmasi PGI)', 'Harga dasar per satuan', 'Total invoice termasuk PPN, sebelum PPh', 'Nilai sebelum PPN (estimasi kontrak)', 'PPN invoice (estimasi kontrak)', 'PPh invoice (estimasi kontrak)'].includes(check.label) && ['match', 'difference'].includes(check.state))
      result.status = checks.some((check) => check.state === 'difference') ? 'difference' : checks.some((check) => check.state === 'pending') || !hasNumericComparison ? 'partial' : 'matched'
      result.message = result.status === 'matched' ? 'Cocok pada field yang diperiksa; tanggal/status hanya informasi ekspor.' : result.status === 'difference' ? 'Ada selisih pada field yang diperiksa.' : 'Pasangan ditemukan; beberapa data belum dapat dibandingkan.'
    } catch (error) {
      result.status = 'invalid'
      result.message = error instanceof Error ? error.message : 'Data tidak valid'
    }
    return result
  })
}
