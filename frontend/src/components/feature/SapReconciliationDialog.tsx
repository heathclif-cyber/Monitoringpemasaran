import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Badge } from '@/components/ui/badge'
import { FilterToolbar, ListPanel, StatPills } from '@/components/patterns'
import { SAP_FIELD_GUIDES, reconcileSapRows, suggestSapMapping } from '@/utils/sapReconciliation'
import type { LaporanRow, SapImportCell, SapImportMapping, SapImportScope, SapImportSheet, SapReconciliationResult } from '@/types'

const STATUS_LABELS: Record<SapReconciliationResult['status'], string> = {
  matched: 'Cocok pada field diperiksa', difference: 'Ada selisih', partial: 'Belum lengkap',
  unmatched: 'Belum terhubung', ambiguous: 'Referensi ambigu', invalid: 'Data tidak valid',
}

export function SapReconciliationDialog({ open, onOpenChange, rows, loading }: {
  open: boolean; onOpenChange: (open: boolean) => void; rows: LaporanRow[]; loading: boolean
}) {
  const [sheets, setSheets] = useState<SapImportSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [headerRow, setHeaderRow] = useState(1)
  const [mapping, setMapping] = useState<SapImportMapping>({})
  const [scope, setScope] = useState<SapImportScope>('billing')
  const [numberFormat, setNumberFormat] = useState<'id' | 'en'>('id')
  const [confirmedTotals, setConfirmedTotals] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<SapReconciliationResult[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sheet = sheets[sheetIndex]
  const headers = useMemo(() => {
    const values = (sheet?.rows[headerRow - 1] ?? []).map((cell) => String(cell).trim())
    while (values.length && !values[values.length - 1]) values.pop()
    return values
  }, [sheet, headerRow])
  const data = useMemo(() => (sheet?.rows.slice(headerRow) ?? []).filter((cells) => cells.some((cell) => String(cell).trim())), [sheet, headerRow])
  const filteredResults = (results ?? []).filter((result) => statusFilter === 'all' || result.status === statusFilter)
  const detail = results?.find((result) => result.sourceRow === selectedRow)
  const clearResults = () => { setResults(null); setSelectedRow(null); setPage(0); setError('') }
  useEffect(() => { setResults(null); setSelectedRow(null); setPage(0) }, [rows])
  const changeHeader = (nextSheet: number, nextHeader: number) => {
    setSheetIndex(nextSheet); setHeaderRow(nextHeader)
    const suggested = suggestSapMapping((sheets[nextSheet]?.rows[nextHeader - 1] ?? []).map(String))
    if (scope === 'billing') delete suggested.localDo
    else { delete suggested.grossAmount; delete suggested.netAmount; delete suggested.vatAmount; delete suggested.withholdingAmount }
    setMapping(suggested)
    setConfirmedTotals(false); clearResults()
  }
  const importFile = async (file: File) => {
    setBusy(true); clearResults(); setSheets([]); setFileName(''); setMapping({}); setConfirmedTotals(false)
    try {
      if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error('Gunakan ekspor .xlsx atau .csv')
      if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran maksimum 10 MB. Batasi periode ekspor SAP.')
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true, cellFormula: false, cellHTML: false, sheetRows: 10002 })
      const parsed = workbook.SheetNames.map((name) => {
        const worksheet = workbook.Sheets[name]
        const range = worksheet['!fullref'] || worksheet['!ref']
        if (range && XLSX.utils.decode_range(range).e.r >= 10001) throw new Error('Maksimum 10.000 baris per sheet. Batasi periode ekspor SAP.')
        if (range && XLSX.utils.decode_range(range).e.c >= 256) throw new Error('Maksimum 256 kolom per sheet. Pilih kolom ekspor SAP yang diperlukan.')
        const values = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: '', blankrows: true })
        return { name, rows: values.map((cells) => cells.map((cell): SapImportCell => typeof cell === 'number' ? cell : String(cell ?? ''))) }
      }).filter((candidate) => candidate.rows.some((cells) => cells.some((cell) => String(cell).trim())))
      if (!parsed.length) throw new Error('File tidak memiliki data')
      setSheets(parsed); setSheetIndex(0); setHeaderRow(1)
      const suggested = suggestSapMapping(parsed[0].rows[0].map(String))
      if (scope === 'billing') delete suggested.localDo
      else { delete suggested.grossAmount; delete suggested.netAmount; delete suggested.vatAmount; delete suggested.withholdingAmount }
      setMapping(suggested); setFileName(file.name)
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal membaca ekspor SAP') }
    finally { setBusy(false) }
  }
  const compare = () => {
    clearResults()
    try {
      if (!data.length) throw new Error('Tidak ada baris data setelah header')
      if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error('Pilih baris header yang memiliki nama kolom unik dan tidak kosong')
      setResults(reconcileSapRows(data, mapping, scope, numberFormat, rows, headerRow + 1)); setStatusFilter('all')
    } catch (err) { setError(err instanceof Error ? err.message : 'Rekonsiliasi gagal') }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Rekonsiliasi SAP SD</DialogTitle><DialogDescription>Bandingkan ekspor billing atau delivery SAP dengan seluruh laporan aplikasi, termasuk di luar filter halaman.</DialogDescription></DialogHeader>
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p>Integrasi melalui ekspor file. File diproses di browser; hasil hanya ada selama halaman terbuka. Belum ada sinkronisasi langsung atau penyimpanan hasil ke database.</p>
          <p>Pencocokan memakai nomor dokumen, bukan nama mitra atau nominal. Pemeriksaan tidak mengubah transaksi maupun nomor SAP di aplikasi.</p>
          <p>DPP/PPN/PPh aplikasi merupakan estimasi tarif kontrak per invoice, bukan penjumlahan alokasi DO. Kecocokan nominal tidak membuktikan pajak sudah disetor; PPh memerlukan sumber FI/perpajakan dan bukti terverifikasi.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input ref={inputRef} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Ekspor SAP" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = '' }} />
          <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Pilih ekspor SAP</Button>
          {fileName && <span className="text-xs text-muted-foreground break-all">Sumber: {fileName} · snapshot file, bukan status SAP langsung</span>}
        </div>
        {error && <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">{error}</p>}
        {sheet ? <>
          <FilterToolbar>
            <div className="space-y-1"><Label htmlFor="sap-scope" className="text-xs">Jenis ekspor</Label><NativeSelect id="sap-scope" value={scope} onChange={(event) => { setScope(event.target.value as SapImportScope); setMapping({}); setConfirmedTotals(false); clearResults() }}><option value="billing">Billing — total per invoice</option><option value="delivery">Delivery — total per DO</option></NativeSelect></div>
            <div className="space-y-1"><Label htmlFor="sap-sheet" className="text-xs">Sheet</Label><NativeSelect id="sap-sheet" value={sheetIndex} onChange={(event) => changeHeader(Number(event.target.value), 1)}>{sheets.map((candidate, index) => <option key={index} value={index}>{candidate.name}</option>)}</NativeSelect></div>
            <div className="space-y-1"><Label htmlFor="sap-header" className="text-xs">Baris header</Label><Input id="sap-header" type="number" min={1} max={sheet.rows.length} value={headerRow} className="h-10 w-24" onChange={(event) => { const next = Number(event.target.value); if (Number.isInteger(next) && next >= 1 && next <= sheet.rows.length) changeHeader(sheetIndex, next) }} /></div>
            <div className="space-y-1"><Label htmlFor="sap-numbers" className="text-xs">Format angka teks</Label><NativeSelect id="sap-numbers" value={numberFormat} onChange={(event) => { setNumberFormat(event.target.value as 'id' | 'en'); clearResults() }}><option value="id">Indonesia: 1.234,56</option><option value="en">Internasional: 1,234.56</option></NativeSelect></div>
          </FilterToolbar>
          <section><h3 className="text-sm font-semibold mb-3">Cocokkan kolom ekspor dengan artinya</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SAP_FIELD_GUIDES.filter((field) => scope === 'billing' ? field.key !== 'localDo' : !['grossAmount', 'netAmount', 'vatAmount', 'withholdingAmount'].includes(field.key)).map((field) => <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`sap-${field.key}`} className="text-xs">{field.label}</Label>
                <NativeSelect id={`sap-${field.key}`} value={mapping[field.key] ?? ''} onChange={(event) => { const next = { ...mapping }; if (event.target.value === '') delete next[field.key]; else next[field.key] = Number(event.target.value); setMapping(next); clearResults() }}><option value="">Tidak tersedia / tidak dibandingkan</option>{headers.map((header, index) => <option key={index} value={index}>{header || `Kolom ${index + 1} (tanpa judul)`}</option>)}</NativeSelect>
                <p className="text-[11px] text-muted-foreground">{field.help}</p>
                {mapping[field.key] !== undefined && <p className="text-[11px] break-all">Contoh: {String(data[0]?.[mapping[field.key]!] ?? '—')}</p>}
              </div>)}
            </div>
          </section>
          <Label className="flex items-start gap-2 text-xs font-normal leading-5"><input type="checkbox" className="mt-1" checked={confirmedTotals} onChange={(event) => setConfirmedTotals(event.target.checked)} /><span>Ekspor berisi satu baris total per dokumen SAP, bukan per item/kondisi harga. Harga yang dipilih adalah harga dasar satu material; total billing termasuk PPN dan belum dikurangi PPh.</span></Label>
          <Button type="button" disabled={loading || busy || !confirmedTotals || !data.length || mapping.documentNumber === undefined} onClick={compare}>Bandingkan {data.length} baris dengan aplikasi</Button>
        </> : <ListPanel empty emptyTitle="Belum ada ekspor SAP" emptyDescription="Pilih file billing/delivery SAP, tentukan baris header, lalu cocokkan kolom. Kolom yang tidak tersedia boleh dibiarkan kosong."><span /></ListPanel>}
        {results && <>
          <StatPills items={[{ label: 'Dokumen', value: results.length }, { label: 'Cocok diperiksa', value: results.filter((result) => result.status === 'matched').length, tone: 'success' }, { label: 'Selisih', value: results.filter((result) => result.status === 'difference').length, tone: 'danger' }, { label: 'Perlu pemeriksaan', value: results.filter((result) => !['matched', 'difference'].includes(result.status)).length, tone: 'warning' }]} />
          <FilterToolbar><Label htmlFor="sap-result-status" className="text-xs">Hasil</Label><NativeSelect id="sap-result-status" className="w-auto" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0) }}><option value="all">Semua hasil</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></FilterToolbar>
          <ListPanel empty={!filteredResults.length} emptyTitle="Tidak ada hasil untuk filter ini"><div className="overflow-auto max-h-80"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>{['Baris', 'Dokumen SAP', 'Invoice / DO aplikasi', 'Hasil', 'Keterangan', ''].map((label, index) => <th key={index} className="px-3 py-2 text-left">{label}</th>)}</tr></thead><tbody>
            {filteredResults.slice(page * 50, (page + 1) * 50).map((result) => <tr key={result.sourceRow} className="border-t"><td className="px-3 py-2">{result.sourceRow}</td><td className="px-3 py-2">{result.documentNumber || '—'}</td><td className="px-3 py-2 break-words">{result.localInvoice || '—'}{result.localDo && <p className="text-muted-foreground">DO {result.localDo}</p>}</td><td className="px-3 py-2"><Badge variant={result.status === 'matched' ? 'success' : result.status === 'difference' || result.status === 'invalid' ? 'destructive' : 'warning'}>{STATUS_LABELS[result.status]}</Badge></td><td className="px-3 py-2">{result.message}</td><td className="px-3 py-2"><Button type="button" variant="outline" size="sm" disabled={!result.checks.length} onClick={() => setSelectedRow(result.sourceRow)}>Rincian</Button></td></tr>)}
          </tbody></table></div></ListPanel>
          <div className="flex justify-end items-center gap-2 text-xs"><span>Halaman {page + 1} / {Math.max(1, Math.ceil(filteredResults.length / 50))}</span><Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</Button><Button type="button" size="sm" variant="outline" disabled={(page + 1) * 50 >= filteredResults.length} onClick={() => setPage(page + 1)}>Berikutnya</Button></div>
          {detail && <section className="space-y-2"><h3 className="text-sm font-semibold">Pemeriksaan dokumen {detail.documentNumber}</h3><div className="overflow-auto rounded-md border"><table className="w-full text-xs"><thead className="bg-muted"><tr>{['Field', 'Aplikasi', 'SAP', 'Hasil / Penjelasan'].map((label) => <th key={label} className="text-left px-3 py-2">{label}</th>)}</tr></thead><tbody>{detail.checks.map((check, index) => <tr key={index} className="border-t"><td className="px-3 py-2">{check.label}</td><td className="px-3 py-2">{check.local || '—'}</td><td className="px-3 py-2">{check.sap || '—'}</td><td className="px-3 py-2">{({ match: 'Cocok', difference: 'Selisih', info: 'Informasi SAP; belum dibandingkan', pending: 'Perlu pemeriksaan' })[check.state]}{check.message && <p className="mt-1 text-muted-foreground">{check.message}</p>}</td></tr>)}</tbody></table></div></section>}
        </>}
      </DialogContent>
    </Dialog>
  )
}
