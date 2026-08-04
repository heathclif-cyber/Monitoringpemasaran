import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  Eye,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { client } from '@/lib/client'
import { useAppStore } from '@/store/appStore'
import { useCanEdit } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocxPreview } from '@/components/common/DocxPreview'
import { cn, formatDate, safe } from '@/lib/utils'
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

/** Tombol upload ringkas — satu baris */
function CompactUpload({
  slot,
  onUploaded,
  label,
  required,
}: {
  slot: DocumentPipelineSlot
  onUploaded: () => void
  label: string
  required?: boolean
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
      addNotification(`${label} berhasil di-upload`, 'success')
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
      <div className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={13} /> Ada
        </span>
        {canView && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[11px]"
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
              className="h-7 px-1.5 text-[11px] text-muted-foreground"
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

  // Belum ada file
  if (!canUpload) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-medium',
          required ? 'text-rose-600' : 'text-muted-foreground',
        )}
      >
        <CircleAlert size={13} />
        Belum
      </span>
    )
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
        variant={required ? 'default' : 'outline'}
        className={cn(
          'h-8 gap-1 text-xs whitespace-nowrap',
          required && 'bg-rose-600 hover:bg-rose-700 text-white',
        )}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
        {fileMissing ? 'Upload ulang' : `Upload ${label}`}
      </Button>
    </>
  )
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        ok
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
      )}
      title={label}
    >
      {ok ? <CheckCircle2 size={11} /> : <CircleAlert size={11} />}
      {label}
    </span>
  )
}

function UnitRow({ row, onUploaded }: { row: DocumentPipelineRow; onUploaded: () => void }) {
  const baSt = row.slots.find((s) => s.slot_key === 'ba_serah_terima')
  const baPanen = row.slots.find((s) => s.slot_key === 'ba_panen')
  const done = row.unit_complete !== false
  const needBaSt = Boolean(baSt && !baSt.uploaded)
  const hasBaPanenSlot = Boolean(baPanen?.entity_id)
  const baPanenOk = Boolean(baPanen?.uploaded)

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3',
        'border-b border-border/70 px-3 py-2 last:border-0',
        needBaSt && 'bg-rose-50/50 dark:bg-rose-950/20',
        done && !needBaSt && 'bg-transparent',
      )}
    >
      {/* Identitas */}
      <div className="min-w-0 sm:w-[38%] sm:shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-semibold truncate">{row.no_do}</p>
          {!done && (
            <span className="shrink-0 rounded bg-rose-600 text-white px-1.5 py-0.5 text-[9px] font-bold uppercase">
              Aksi
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {safe(row.unit)}
          {row.tanggal ? ` · ${formatDate(row.tanggal)}` : ''}
        </p>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-1 sm:flex-1 min-w-0">
        <StatusDot ok={!needBaSt && Boolean(baSt?.uploaded)} label="BA Serah Terima" />
        {hasBaPanenSlot ? (
          <StatusDot ok={baPanenOk} label="BA Panen" />
        ) : (
          <span className="text-[10px] text-muted-foreground px-1">BA Panen —</span>
        )}
      </div>

      {/* Satu area aksi */}
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end sm:shrink-0">
        {needBaSt && baSt && (
          <CompactUpload slot={baSt} onUploaded={onUploaded} label="BA Serah Terima" required />
        )}
        {!needBaSt && hasBaPanenSlot && baPanen && !baPanenOk && (
          <CompactUpload slot={baPanen} onUploaded={onUploaded} label="BA Panen" />
        )}
        {!needBaSt && baSt?.uploaded && (
          <CompactUpload slot={baSt} onUploaded={onUploaded} label="BA ST" required />
        )}
        {done && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={14} /> OK
          </span>
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
    <div className="space-y-3 max-w-5xl">
      {/* Toolbar padat */}
      <div className="rounded-lg border bg-card px-3 py-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight">Dokumen Unit</h1>
            <p className="text-[11px] text-muted-foreground">
              Wajib: <strong>BA Serah Terima</strong> per DO · Opsional: BA Panen
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Progress tipis */}
            <div className="flex items-center gap-2 min-w-[140px]">
              <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500',
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
        </div>

        {/* Stats 1 baris */}
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-md bg-muted px-2 py-1 tabular-nums">
            Total <strong>{total}</strong>
          </span>
          <span className="rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-1 tabular-nums">
            Perlu aksi <strong>{incomplete}</strong>
          </span>
          <span className="rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-1 tabular-nums">
            Lengkap <strong>{complete}</strong>
          </span>
          <span className="rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-1 tabular-nums">
            Kurang BA ST <strong>{missingBaSt}</strong>
          </span>
        </div>

        {/* Filter 1 baris */}
        <div className="flex flex-wrap gap-2 items-center">
          <NativeSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-8 w-auto text-xs min-w-[8.5rem]"
          >
            <option value="incomplete">Perlu aksi</option>
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
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={groupByUnit}
              onChange={(e) => setGroupByUnit(e.target.checked)}
            />
            Kelompokkan unit
          </label>
        </div>
      </div>

      {/* Daftar padat */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Memuat…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center space-y-1">
            <CheckCircle2 className="mx-auto text-emerald-500" size={28} />
            <p className="text-sm font-medium">
              {statusFilter === 'incomplete'
                ? 'Tidak ada yang perlu diisi — semua lengkap'
                : 'Tidak ada data'}
            </p>
          </div>
        ) : groupByUnit && grouped ? (
          <div>
            {grouped.map(([unitName, unitRows]) => {
              const need = unitRows.filter((r) => !r.unit_complete).length
              return (
                <div key={unitName} className="border-b last:border-0">
                  <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-muted/60 backdrop-blur px-3 py-1.5 border-b border-border/50">
                    <span className="text-xs font-semibold truncate">{unitName}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                      {need > 0 ? (
                        <span className="text-rose-600 font-semibold">{need} perlu aksi</span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">semua OK</span>
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
      </div>

      <p className="text-[10px] text-muted-foreground px-0.5">
        Baris merah muda = BA Serah Terima belum diunggah. Tombol merah = aksi utama unit.
      </p>
    </div>
  )
}
