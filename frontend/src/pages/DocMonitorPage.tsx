import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  CloudUpload,
  Eye,
  FileSearch,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { client } from '@/lib/client'
import { useAppStore } from '@/store/appStore'
import { useCanEdit } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocxPreview } from '@/components/common/DocxPreview'
import { MultiSelectFilter } from '@/components/common/MultiSelectFilter'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { cn, formatDate, safe } from '@/lib/utils'
import type {
  DocumentPipelineResponse,
  DocumentPipelineSlot,
  DocumentUpload,
} from '@/types'

/** Mode upload per nomor (UI lama UploadPage) — digabung ke menu tunggal */
const EntityUploadPage = lazy(() => import('@/pages/UploadPage'))

type DocViewMode = 'pipeline' | 'entity'

type FilterMode = 'incomplete' | 'all' | 'complete'

/** Slot fokusat: klik kartu ringkasan / dropdown */
type MissingSlotFilter =
  | ''
  | 'unit_tasks'
  | 'regional_tasks'
  | 'ba_serah_terima'
  | 'do'
  | 'deklarasi'
  | 'superman'
  | 'kontrak'
  | 'invoice'
  | 'rekening_koran'
  | 'faktur_pajak'

const PREFS_KEY = 'pantau-dokumen-prefs'

const BROWSER_VIEWABLE = new Set(['pdf', 'jpg', 'jpeg', 'png'])

/** Unit: hanya BA Serah Terima Barang */
const UNIT_SLOT_KEYS = new Set(['ba_serah_terima'])
/** Regional: kontrak, invoice, DO, deklarasi, rekening koran, faktur pajak, dll. */
const REGIONAL_SLOT_KEYS = new Set([
  'kontrak',
  'invoice',
  'rekening_koran',
  'faktur_pajak',
  'kuitansi',
  'do',
  'deklarasi',
  'superman',
])

const SLOT_ORDER = [
  'ba_serah_terima',
  'kontrak',
  'invoice',
  'rekening_koran',
  'faktur_pajak',
  'kuitansi',
  'do',
  'deklarasi',
  'superman',
] as const

const MISSING_SLOT_OPTIONS: { value: MissingSlotFilter; label: string }[] = [
  { value: '', label: 'Semua jenis kekurangan' },
  { value: 'unit_tasks', label: 'Kurang tugas Unit (BA Serah Terima)' },
  { value: 'regional_tasks', label: 'Kurang tugas Regional' },
  { value: 'ba_serah_terima', label: 'Kurang BA Serah Terima (Unit)' },
  { value: 'do', label: 'Kurang file DO (Regional)' },
  { value: 'deklarasi', label: 'Kurang Deklarasi (Regional)' },
  { value: 'faktur_pajak', label: 'Kurang Faktur Pajak (Regional)' },
  { value: 'rekening_koran', label: 'Kurang Rekening Koran (Regional)' },
  { value: 'superman', label: 'Belum Superman (Regional)' },
  { value: 'kontrak', label: 'Kurang file Kontrak (Regional)' },
  { value: 'invoice', label: 'Kurang file Invoice (Regional)' },
]

function readPrefs(): { unit?: string; statusFilter?: FilterMode } {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as { unit?: string; statusFilter?: FilterMode }
  } catch {
    return {}
  }
}

function writePrefs(prefs: { unit: string; statusFilter: FilterMode }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

function slotTone(slot: DocumentPipelineSlot): string {
  if (slot.slot_key === 'superman') {
    if (slot.uploaded) return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
    if (slot.note?.includes('siap')) return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300'
    if (!slot.required) return 'bg-muted text-muted-foreground border-border'
    return 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
  }
  if (slot.uploaded) {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
  }
  if (!slot.required) {
    return 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400'
  }
  if (!slot.entity_id) {
    return 'bg-muted text-muted-foreground border-border'
  }
  return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300'
}

function CompletenessBadge({ uploaded, total }: { uploaded: number; total: number }) {
  const complete = total > 0 && uploaded === total
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        complete
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      )}
    >
      {uploaded}/{total}
    </span>
  )
}

function PipelineChip({ slot }: { slot: DocumentPipelineSlot }) {
  const short =
    slot.slot_key === 'ba_serah_terima'
      ? 'BA ST'
      : slot.slot_key === 'rekening_koran'
        ? 'Rek. Koran'
        : slot.slot_key === 'faktur_pajak'
          ? 'Faktur'
          : slot.slot_key === 'superman'
            ? 'SPP'
            : slot.label.split(' ')[0]
  const owner = slot.responsibility === 'unit' ? 'Unit' : 'Regional'

  return (
    <span
      title={[
        slot.label,
        owner,
        slot.required ? 'Wajib' : 'Opsional',
        slot.uploaded ? 'Sudah ada' : 'Belum',
        slot.note || '',
      ]
        .filter(Boolean)
        .join(' · ')}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
        slotTone(slot),
      )}
    >
      {slot.uploaded ? <CheckCircle2 size={10} /> : <CircleAlert size={10} />}
      {short}
      <span className="opacity-60 font-normal">{owner === 'Unit' ? 'U' : 'R'}</span>
      {!slot.required && <span className="opacity-70">*</span>}
    </span>
  )
}

function SlotUploadRow({
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

  const isSuperman = slot.slot_key === 'superman'
  const canUpload =
    canEdit &&
    !isSuperman &&
    Boolean(slot.entity_type && slot.entity_id && slot.doc_type)

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
      addNotification(`${slot.label} berhasil di-upload`, 'success')
      onUploaded()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Upload gagal', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border px-3 py-2.5',
        slot.uploaded
          ? 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20'
          : slot.required
            ? 'border-amber-200/80 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/10'
            : 'border-border bg-muted/20',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{slot.label}</p>
          <span
            className={cn(
              'text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5',
              slot.responsibility === 'unit'
                ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300'
                : 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
            )}
          >
            {slot.responsibility === 'unit' ? 'Unit' : 'Regional'}
          </span>
          {slot.required ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
              Wajib
            </span>
          ) : (
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Opsional
            </span>
          )}
          {slot.uploaded ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={12} /> Terupload
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
              <CircleAlert size={12} /> Belum
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {slot.file_name ||
            slot.note ||
            (slot.entity_id
              ? `${slot.entity_type} · ${slot.entity_id}`
              : 'Belum ada referensi dokumen')}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {canView && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => {
              if (isDocx) setDocxOpen(true)
              else if (viewUrl) window.open(viewUrl, '_blank', 'noopener,noreferrer')
            }}
          >
            <Eye size={12} /> Lihat
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
              variant={fileAvailable ? 'outline' : fileMissing ? 'destructive' : 'default'}
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
              {fileAvailable ? 'Ganti' : fileMissing ? 'Upload Ulang' : 'Upload'}
            </Button>
          </>
        )}
        {isSuperman && !slot.uploaded && (
          <span className="text-[11px] text-muted-foreground max-w-[160px] text-right">
            Deklarasi lewat menu Pembayaran
          </span>
        )}
      </div>

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

function SlotGroup({
  title,
  hint,
  slots,
  onUploaded,
}: {
  title: string
  hint: string
  slots: DocumentPipelineSlot[]
  onUploaded: () => void
}) {
  if (slots.length === 0) return null
  const missing = slots.filter((s) => s.required && !s.uploaded).length
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
        {missing > 0 && (
          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
            {missing} wajib belum
          </span>
        )}
      </div>
      {slots.map((slot) => (
        <SlotUploadRow key={slot.slot_key} slot={slot} onUploaded={onUploaded} />
      ))}
    </div>
  )
}

export default function DocMonitorPage() {
  const { addNotification } = useAppStore()
  const prefs = useMemo(() => readPrefs(), [])
  const [viewMode, setViewMode] = useState<DocViewMode>('pipeline')
  const [statusFilter, setStatusFilter] = useState<FilterMode>(prefs.statusFilter || 'incomplete')
  const [missingSlot, setMissingSlot] = useState<MissingSlotFilter>('')
  const [unit, setUnit] = useState(prefs.unit || '')
  const [materials, setMaterials] = useState<string[]>([])
  const [materialOptions, setMaterialOptions] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [data, setData] = useState<DocumentPipelineResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [unitsFromApi, setUnitsFromApi] = useState<string[]>([])

  useEffect(() => {
    client
      .get<string[]>('/api/documents/materials')
      .then(setMaterialOptions)
      .catch(() => setMaterialOptions([]))
  }, [])

  useEffect(() => {
    writePrefs({ unit, statusFilter })
  }, [unit, statusFilter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        status_filter: statusFilter,
        limit: '200',
      })
      if (unit) params.set('unit', unit)
      if (q.trim()) params.set('q', q.trim())
      if (missingSlot) params.set('missing_slot', missingSlot)
      materials.forEach((m) => params.append('material', m))
      const res = await client.get<DocumentPipelineResponse>(`/api/documents/pipeline?${params}`)
      setData(res)
      if (res.units?.length) setUnitsFromApi(res.units)
    } catch (err: unknown) {
      setData(null)
      addNotification(err instanceof Error ? err.message : 'Gagal memuat pantauan dokumen', 'error')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, unit, materials, q, missingSlot, addNotification])

  useEffect(() => {
    load()
  }, [load])

  const unitOptions = useMemo(() => {
    const set = new Set([...unitsFromApi, ...(data?.units ?? [])])
    if (unit) set.add(unit)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [unitsFromApi, data?.units, unit])

  const summary = data?.summary
  const rows = data?.rows ?? []

  const applySearch = () => setQ(searchInput)

  const applyQuickFilter = (slot: MissingSlotFilter) => {
    setMissingSlot((prev) => (prev === slot ? '' : slot))
    if (slot) {
      setStatusFilter('incomplete')
    }
    setExpanded(null)
  }

  const clearFilters = () => {
    setMissingSlot('')
    setStatusFilter('incomplete')
    setMaterials([])
    setQ('')
    setSearchInput('')
    setExpanded(null)
    // unit tetap (preferensi unit disimpan)
  }

  const activeMissingLabel =
    MISSING_SLOT_OPTIONS.find((o) => o.value === missingSlot)?.label || null

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CloudUpload size={16} />
            <span className="text-xs font-medium uppercase tracking-wide">Dokumen</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Satu menu untuk <strong>memantau</strong> dan <strong>mengunggah</strong> PDF.
            <strong> Regional:</strong> Kontrak, Invoice, DO, Deklarasi, Rekening Koran, Faktur Pajak.
            <strong> Unit:</strong> BA Serah Terima Barang (wajib per DO).
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 self-start">
          <button
            type="button"
            onClick={() => setViewMode('pipeline')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'pipeline'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileSearch size={13} />
            Pantau rantai
          </button>
          <button
            type="button"
            onClick={() => setViewMode('entity')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'entity'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <CloudUpload size={13} />
            Upload per nomor
          </button>
        </div>
      </div>

      {viewMode === 'entity' ? (
        <Suspense fallback={<LoadingSkeleton rows={6} />}>
          <EntityUploadPage />
        </Suspense>
      ) : (
      <>
      {/* Summary cards — klik = filter cepat */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(
          [
            {
              label: 'Total baris',
              value: summary?.total_rows ?? 0,
              tone: 'default' as const,
              slot: '' as MissingSlotFilter,
            },
            {
              label: 'Kurang tugas Unit',
              value: summary?.incomplete_unit ?? 0,
              tone: 'danger' as const,
              slot: 'unit_tasks' as MissingSlotFilter,
            },
            {
              label: 'Kurang tugas Regional',
              value: summary?.incomplete_regional ?? 0,
              tone: 'warn' as const,
              slot: 'regional_tasks' as MissingSlotFilter,
            },
            {
              label: 'Kurang BA Serah Terima',
              value: summary?.missing_ba_serah_terima ?? 0,
              tone: 'danger' as const,
              slot: 'ba_serah_terima' as MissingSlotFilter,
            },
            {
              label: 'Kurang Faktur Pajak',
              value: summary?.missing_faktur_pajak ?? 0,
              tone: 'warn' as const,
              slot: 'faktur_pajak' as MissingSlotFilter,
            },
            {
              label: 'Belum Superman',
              value: summary?.missing_superman ?? 0,
              tone: 'warn' as const,
              slot: 'superman' as MissingSlotFilter,
            },
          ] as const
        ).map((c) => {
          const active = c.slot !== '' && missingSlot === c.slot
          return (
            <Card
              key={c.label}
              className={cn(
                'border-border/80 transition-all',
                c.slot && 'cursor-pointer hover:border-primary/40 hover:shadow-sm',
                active && 'ring-2 ring-primary/40 border-primary/50',
              )}
              onClick={() => c.slot && applyQuickFilter(c.slot)}
              title={c.slot ? `Filter: ${c.label}` : undefined}
            >
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground leading-tight">{c.label}</p>
                <p
                  className={cn(
                    'text-xl font-semibold mt-1 tabular-nums',
                    c.tone === 'danger' && 'text-red-600',
                    c.tone === 'warn' && 'text-amber-600',
                  )}
                >
                  {c.value}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={16} className="text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Pantau & Upload Dokumen</CardTitle>
              {rows.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {rows.length} baris ditampilkan
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {(missingSlot || materials.length > 0 || q) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={clearFilters}
                >
                  <X size={13} /> Reset filter
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={load}
                disabled={loading}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Muat Ulang
              </Button>
            </div>
          </div>

          {activeMissingLabel && missingSlot && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 font-medium">
                Filter: {activeMissingLabel}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => setMissingSlot('')}
              >
                hapus
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-3">
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <NativeSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as FilterMode)
                  setExpanded(null)
                }}
                className="mt-1 h-8 text-xs"
              >
                <option value="incomplete">Belum Lengkap</option>
                <option value="all">Semua</option>
                <option value="complete">Sudah Lengkap</option>
              </NativeSelect>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Unit (disimpan)</Label>
              <NativeSelect
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value)
                  setExpanded(null)
                }}
                className="mt-1 h-8 text-xs"
              >
                <option value="">Semua Unit</option>
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Jenis kekurangan</Label>
              <NativeSelect
                value={missingSlot}
                onChange={(e) => {
                  setMissingSlot(e.target.value as MissingSlotFilter)
                  setExpanded(null)
                }}
                className="mt-1 h-8 text-xs"
              >
                {MISSING_SLOT_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Material</Label>
              <MultiSelectFilter
                label="Material"
                allLabel="Semua Material"
                options={materialOptions}
                selected={materials}
                onChange={(next) => {
                  setMaterials(next)
                  setExpanded(null)
                }}
                className="h-8 w-full text-xs"
                contentWidth="w-72"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cari nomor / unit</Label>
              <div className="mt-1 flex gap-1.5">
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                  placeholder="No DO, invoice, kontrak..."
                  className="h-8 text-xs"
                />
                <Button type="button" size="sm" className="h-8 px-2" onClick={applySearch}>
                  <Search size={13} />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Lengkap
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-400" /> Wajib belum upload
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-violet-500" /> Unit (BA Serah Terima)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> Regional (kontrak–invoice–DO–faktur–dll.)
            </span>
            <span className="text-muted-foreground/80">· Chip R/U = Regional / Unit · Klik kartu = filter</span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Memuat data...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground px-4 space-y-2">
              <p>
                {statusFilter === 'incomplete' && !missingSlot
                  ? 'Semua dokumen pada filter ini sudah lengkap 🎉'
                  : 'Tidak ada data untuk filter ini.'}
              </p>
              {(missingSlot || materials.length > 0 || q || unit) && (
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={clearFilters}>
                  Reset filter (kecuali unit)
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10 border-b">
                  <tr className="text-muted-foreground">
                    <th className="text-left py-2.5 px-3 font-medium">No DO / Invoice</th>
                    <th className="text-left py-2.5 px-2 font-medium hidden md:table-cell">Unit</th>
                    <th className="text-left py-2.5 px-2 font-medium hidden lg:table-cell">Kontrak</th>
                    <th className="text-left py-2.5 px-2 font-medium">Pipeline</th>
                    <th className="text-left py-2.5 px-2 font-medium hidden sm:table-cell">Belum</th>
                    <th className="text-center py-2.5 px-2 font-medium w-16">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = row.row_key
                    const open = expanded === key
                    const orderedSlots = SLOT_ORDER.map((k) =>
                      row.slots.find((s) => s.slot_key === k),
                    ).filter(Boolean) as DocumentPipelineSlot[]
                    const unitSlots = orderedSlots.filter(
                      (s) => UNIT_SLOT_KEYS.has(s.slot_key) || s.responsibility === 'unit',
                    )
                    const regionalSlots = orderedSlots.filter(
                      (s) =>
                        REGIONAL_SLOT_KEYS.has(s.slot_key) ||
                        s.responsibility === 'regional' ||
                        (!UNIT_SLOT_KEYS.has(s.slot_key) && s.responsibility !== 'unit'),
                    )
                    // Hindari duplikat jika filter overlap
                    const unitKeys = new Set(unitSlots.map((s) => s.slot_key))
                    const regionalOnly = regionalSlots.filter((s) => !unitKeys.has(s.slot_key))
                    return (
                      <Fragment key={key}>
                        <tr
                          className={cn(
                            'border-b last:border-0 hover:bg-muted/40 cursor-pointer',
                            open && 'bg-muted/30',
                          )}
                          onClick={() => setExpanded(open ? null : key)}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-foreground">
                              {row.no_do || row.no_invoice || '—'}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {row.no_do && row.no_invoice ? `Inv: ${row.no_invoice}` : null}
                              {row.tanggal ? ` · ${formatDate(row.tanggal)}` : ''}
                              {row.tipe_alur === 'PAYUNG_BA' ? ' · Payung BA' : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 hidden md:table-cell max-w-[140px]">
                            <div className="truncate">{safe(row.unit)}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {safe(row.komoditi)}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 hidden lg:table-cell max-w-[160px]">
                            <div className="truncate font-medium">{row.no_kontrak}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {safe(row.pembeli)}
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex flex-wrap gap-1 max-w-[360px]">
                              {orderedSlots.map((s) => (
                                <PipelineChip key={s.slot_key} slot={s} />
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 hidden sm:table-cell max-w-[180px]">
                            {row.missing_required.length === 0 ? (
                              <span className="text-emerald-600">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {row.missing_required.slice(0, 3).map((l) => (
                                  <span
                                    key={l}
                                    className="inline-flex rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                                  >
                                    {l}
                                  </span>
                                ))}
                                {row.missing_required.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{row.missing_required.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <CompletenessBadge
                              uploaded={row.required_uploaded}
                              total={row.required_total}
                            />
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={6} className="px-3 py-3">
                              <div className="space-y-4 max-w-4xl">
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                  <span>
                                    Unit:{' '}
                                    <strong
                                      className={
                                        row.unit_complete === false
                                          ? 'text-amber-700 dark:text-amber-300'
                                          : 'text-emerald-700 dark:text-emerald-300'
                                      }
                                    >
                                      {row.unit_complete === false
                                        ? `Belum (${(row.missing_unit || []).join(', ') || '…'})`
                                        : 'Lengkap'}
                                    </strong>
                                  </span>
                                  <span>
                                    Regional:{' '}
                                    <strong
                                      className={
                                        row.regional_complete === false
                                          ? 'text-amber-700 dark:text-amber-300'
                                          : 'text-emerald-700 dark:text-emerald-300'
                                      }
                                    >
                                      {row.regional_complete === false
                                        ? `Belum (${(row.missing_regional || []).slice(0, 3).join(', ') || '…'})`
                                        : 'Lengkap'}
                                    </strong>
                                  </span>
                                  <span>
                                    Superman:{' '}
                                    <strong className="text-foreground">
                                      {row.superman || row.superman_status}
                                    </strong>
                                  </span>
                                </div>
                                <SlotGroup
                                  title="Tanggung jawab Unit"
                                  hint="BA Serah Terima Barang (wajib per DO)"
                                  slots={unitSlots}
                                  onUploaded={load}
                                />
                                <SlotGroup
                                  title="Tanggung jawab Regional"
                                  hint="Kontrak, Invoice, Rekening Koran, Faktur Pajak, DO, Deklarasi, Kuitansi, Superman"
                                  slots={regionalOnly}
                                  onUploaded={load}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  )
}
