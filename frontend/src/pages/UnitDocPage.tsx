import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CloudUpload, Eye, Loader2, RefreshCw, Search } from 'lucide-react'
import { client } from '@/lib/client'
import { useAppStore } from '@/store/appStore'
import { useCanEdit } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocxPreview } from '@/components/common/DocxPreview'
import {
  FilterToolbar,
  ListPanel,
  PageHeader,
  PageShell,
  StatPills,
  StatusPill,
} from '@/components/patterns'
import { cn, formatDate, formatNumberDec, safe } from '@/lib/utils'
import type {
  DocumentPipelineResponse,
  DocumentPipelineRow,
  DocumentPipelineSlot,
  DocumentUpload,
} from '@/types'

type StatusFilter = 'incomplete' | 'all' | 'complete'

const PREFS_KEY = 'unit-doc-monitor-prefs'
const BROWSER_VIEWABLE = new Set(['pdf', 'jpg', 'jpeg', 'png'])

function readPrefs(): { unit?: string; statusFilter?: StatusFilter } {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? (JSON.parse(raw) as { unit?: string; statusFilter?: StatusFilter }) : {}
  } catch {
    return {}
  }
}

function writePrefs(prefs: { unit: string; statusFilter: StatusFilter }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

function formatVolumeLabel(volume?: number | null, satuan?: string | null): string | null {
  if (volume == null || Number.isNaN(Number(volume))) return null
  const unit = (satuan || 'Kg').trim() || 'Kg'
  const n = Number(volume)
  const text =
    Math.abs(n - Math.round(n)) < 1e-9
      ? new Intl.NumberFormat('id-ID').format(Math.round(n))
      : formatNumberDec(n)
  return `${text} ${unit}`
}

function CompactUpload({
  slot,
  onUploaded,
}: {
  slot: DocumentPipelineSlot
  onUploaded: () => void
}) {
  const { addNotification } = useAppStore()
  const canEdit = useCanEdit()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [docxOpen, setDocxOpen] = useState(false)

  const canUpload = canEdit && Boolean(slot.entity_type && slot.entity_id && slot.doc_type)
  const ext = slot.file_name?.split('.').pop()?.toLowerCase() ?? ''
  const isDocx = ext === 'docx'
  const viewUrl = slot.document_id != null ? `/api/documents/view/${slot.document_id}` : null
  const fileMissing = slot.uploaded && slot.file_exists === false
  const fileAvailable = slot.uploaded && !fileMissing
  const canView = fileAvailable && !!viewUrl && (isDocx || BROWSER_VIEWABLE.has(ext))

  const handleFile = async (file: File | null) => {
    if (!file || !canUpload || !slot.entity_type || !slot.entity_id || !slot.doc_type) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      addNotification('Hanya file PDF yang diizinkan', 'error')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    const formData = new FormData()
    formData.append('entity_type', slot.entity_type)
    formData.append('entity_id', slot.entity_id)
    formData.append('doc_type', slot.doc_type)
    formData.append('file', file)
    setUploading(true)
    try {
      await client.uploadFormData<DocumentUpload>('/api/documents/upload', formData)
      addNotification('BA Serah Terima berhasil di-upload', 'success')
      onUploaded()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Upload gagal', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (slot.uploaded && !fileMissing) {
    return (
      <div className="inline-flex items-center gap-1">
        <StatusPill tone="success">Sudah ada</StatusPill>
        {canView && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-1.5 text-xs"
            onClick={() => {
              if (isDocx) setDocxOpen(true)
              else if (viewUrl) window.open(viewUrl, '_blank', 'noopener,noreferrer')
            }}
          >
            <Eye size={12} />
          </Button>
        )}
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-1.5 text-xs text-muted-foreground"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              Ganti
            </Button>
          </>
        )}
        {isDocx && viewUrl && (
          <Dialog open={docxOpen} onOpenChange={setDocxOpen}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
                <DialogTitle className="text-sm font-medium">{slot.file_name}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <DocxPreview url={viewUrl} />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    )
  }

  if (!canUpload) {
    return <StatusPill tone="danger">Belum</StatusPill>
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="h-8 gap-1 text-xs whitespace-nowrap"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
        {fileMissing ? 'Upload ulang' : 'Upload BA Serah Terima'}
      </Button>
    </>
  )
}

function UnitRow({ row, onUploaded }: { row: DocumentPipelineRow; onUploaded: () => void }) {
  const baSt = row.slots.find((s) => s.slot_key === 'ba_serah_terima')
  const done = Boolean(baSt?.uploaded) || row.unit_complete !== false
  const needBaSt = Boolean(baSt && !baSt.uploaded)
  const volLabel = formatVolumeLabel(row.volume, row.satuan)

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3',
        'border-b border-border/70 px-3 py-2.5 last:border-0',
        needBaSt && 'bg-destructive/5',
      )}
    >
      <div className="min-w-0 sm:w-[40%] sm:shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-semibold truncate">{row.no_do}</p>
          {needBaSt ? (
            <StatusPill tone="action" icon={false}>
              Aksi
            </StatusPill>
          ) : (
            <StatusPill tone="success" icon={false}>
              OK
            </StatusPill>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {safe(row.unit)}
          {row.tanggal ? ` · ${formatDate(row.tanggal)}` : ''}
          {row.no_invoice ? ` · Inv ${row.no_invoice}` : ''}
        </p>
      </div>

      <div className="flex flex-col gap-1 sm:flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">
          BA Serah Terima Barang
          <span className="ml-1.5 text-[10px] font-medium text-destructive">wajib</span>
        </p>
        {volLabel ? (
          <div className="inline-flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-bold tabular-nums">
              Vol. {volLabel}
            </span>
            {row.komoditi ? (
              <span className="text-xs text-muted-foreground truncate">{row.komoditi}</span>
            ) : null}
          </div>
        ) : (
          <StatusPill tone="warning" icon={false}>
            Volume DO kosong
          </StatusPill>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:justify-end sm:shrink-0">
        {baSt ? (
          <CompactUpload slot={baSt} onUploaded={onUploaded} />
        ) : done ? (
          <StatusPill tone="success">OK</StatusPill>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  )
}

export default function UnitDocPage() {
  const { addNotification } = useAppStore()
  const prefs = useMemo(() => readPrefs(), [])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(prefs.statusFilter || 'incomplete')
  const [unit, setUnit] = useState(prefs.unit || '')
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [data, setData] = useState<DocumentPipelineResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [unitsFromApi, setUnitsFromApi] = useState<string[]>([])
  const [groupByUnit, setGroupByUnit] = useState(true)

  useEffect(() => {
    writePrefs({ unit, statusFilter })
  }, [unit, statusFilter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        scope: 'unit',
        status_filter: statusFilter,
        limit: '300',
      })
      if (unit) params.set('unit', unit)
      if (q.trim()) params.set('q', q.trim())
      const res = await client.get<DocumentPipelineResponse>(`/api/documents/pipeline?${params}`)
      setData(res)
      if (res.units?.length) setUnitsFromApi(res.units)
    } catch (err: unknown) {
      setData(null)
      addNotification(err instanceof Error ? err.message : 'Gagal memuat data unit', 'error')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, unit, q, addNotification])

  useEffect(() => {
    load()
  }, [load])

  const summary = data?.summary
  const rows = data?.rows ?? []
  const total = summary?.total_rows ?? 0
  const complete = summary?.complete ?? 0
  const incomplete = summary?.incomplete ?? 0
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0
  const missingBaSt = summary?.missing_ba_serah_terima ?? 0

  const unitOptions = useMemo(() => {
    const set = new Set([...unitsFromApi, ...(data?.units ?? [])])
    if (unit) set.add(unit)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [unitsFromApi, data?.units, unit])

  const grouped = useMemo(() => {
    if (!groupByUnit) return null
    const map = new Map<string, DocumentPipelineRow[]>()
    for (const r of rows) {
      const key = (r.unit || 'Tanpa unit').trim() || 'Tanpa unit'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => {
      const aNeed = a[1].filter((x) => !x.unit_complete).length
      const bNeed = b[1].filter((x) => !x.unit_complete).length
      if (bNeed !== aNeed) return bNeed - aNeed
      return a[0].localeCompare(b[0], 'id')
    })
  }, [rows, groupByUnit])

  return (
    <PageShell width="narrow" density="compact">
      <PageHeader
        title="Dokumen Unit"
        description="Wajib: BA Serah Terima Barang per DO — cek volume yang harus diserahkan"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 min-w-[120px]">
              <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    pct >= 90 ? 'bg-primary' : pct >= 50 ? 'bg-amber-500' : 'bg-destructive',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums w-8">{pct}%</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={load}
              disabled={loading}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Muat
            </Button>
          </div>
        }
      />

      <StatPills
        items={[
          { label: 'Total DO', value: total },
          { label: 'Belum BA ST', value: missingBaSt || incomplete, tone: 'danger' },
          { label: 'Lengkap', value: complete, tone: 'success' },
        ]}
      />

      <FilterToolbar
        end={
          <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={groupByUnit}
              onChange={(e) => setGroupByUnit(e.target.checked)}
            />
            Kelompokkan unit
          </label>
        }
      >
        <NativeSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-8 w-auto text-xs min-w-[8.5rem]"
        >
          <option value="incomplete">Belum lengkap</option>
          <option value="all">Semua</option>
          <option value="complete">Sudah lengkap</option>
        </NativeSelect>
        <NativeSelect
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="h-8 w-auto text-xs min-w-[10rem] max-w-[14rem]"
        >
          <option value="">Semua unit</option>
          {unitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-1 flex-1 min-w-[10rem] max-w-xs">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setQ(searchInput)}
            placeholder="Cari No DO / invoice…"
            className="h-8 text-xs"
          />
          <Button type="button" size="sm" className="h-8 px-2" onClick={() => setQ(searchInput)}>
            <Search size={13} />
          </Button>
        </div>
      </FilterToolbar>

      <ListPanel
        loading={loading}
        empty={!loading && rows.length === 0}
        emptyIcon={CheckCircle2}
        emptyTitle={
          statusFilter === 'incomplete'
            ? 'Semua BA Serah Terima sudah diunggah'
            : 'Tidak ada data'
        }
        emptyDescription="Ubah filter atau kata kunci untuk melihat DO lain."
        header={
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-foreground">Daftar Delivery Order</p>
              <p className="text-[11px] text-muted-foreground">BA Serah Terima Barang, volume DO, dan aksi upload</p>
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">{rows.length} DO ditampilkan</span>
          </div>
        }
      >
        {groupByUnit && grouped ? (
          <div>
            {grouped.map(([unitName, unitRows]) => {
              const need = unitRows.filter((r) => !r.unit_complete).length
              return (
                <div key={unitName} className="border-b last:border-0">
                  <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-muted/60 backdrop-blur px-3 py-1.5 border-b border-border/50">
                    <span className="text-xs font-semibold truncate">{unitName}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                      {need > 0 ? (
                        <span className="text-destructive font-semibold">{need} belum</span>
                      ) : (
                        <span className="text-primary font-semibold">semua OK</span>
                      )}
                      {' · '}
                      {unitRows.length} DO
                    </span>
                  </div>
                  {unitRows.map((row) => (
                    <UnitRow key={row.row_key} row={row} onUploaded={load} />
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
          <div>
            {rows.map((row) => (
              <UnitRow key={row.row_key} row={row} onUploaded={load} />
            ))}
          </div>
        )}
      </ListPanel>

      <p className="text-[10px] text-muted-foreground">
        Baris disorot = BA Serah Terima belum diunggah. Tombol merah = aksi upload PDF.
      </p>
    </PageShell>
  )
}
