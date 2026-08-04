import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  CloudUpload,
  Eye,
  FileCheck2,
  Columns2,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  Tractor,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
import { cn, formatDate, safe } from '@/lib/utils'
import type {
  DocumentPipelineResponse,
  DocumentPipelineRow,
  DocumentPipelineSlot,
  DocumentUpload,
} from '@/types'

type StatusFilter = 'incomplete' | 'all' | 'complete'
type ViewMode = 'board' | 'grid' | 'list'

const PREFS_KEY = 'unit-doc-monitor-prefs'
const BROWSER_VIEWABLE = new Set(['pdf', 'jpg', 'jpeg', 'png'])

const PIE_COLORS = {
  complete: '#10b981',
  incomplete: '#f59e0b',
}

function readPrefs(): { unit?: string; statusFilter?: StatusFilter; viewMode?: ViewMode } {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? (JSON.parse(raw) as { unit?: string; statusFilter?: StatusFilter; viewMode?: ViewMode }) : {}
  } catch {
    return {}
  }
}

function writePrefs(prefs: { unit: string; statusFilter: StatusFilter; viewMode: ViewMode }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

function ProgressRing({
  pct,
  size = 140,
  stroke = 12,
  label,
  sublabel,
}: {
  pct: number
  size?: number
  stroke?: number
  label: string
  sublabel?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = c - (clamped / 100) * c
  const color = clamped >= 90 ? '#10b981' : clamped >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>
          {clamped.toFixed(0)}%
        </span>
        <span className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</span>
        {sublabel && <span className="text-[10px] text-muted-foreground/80">{sublabel}</span>}
      </div>
    </div>
  )
}

function SlotUploadButton({
  slot,
  onUploaded,
  emphasize,
}: {
  slot: DocumentPipelineSlot
  onUploaded: () => void
  emphasize?: boolean
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
        'rounded-xl border p-3 transition-colors',
        slot.uploaded
          ? 'border-emerald-300/80 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
          : slot.required
            ? emphasize
              ? 'border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/25 ring-1 ring-rose-200/60'
              : 'border-amber-300/80 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20'
            : 'border-border bg-muted/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">{slot.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {slot.required ? 'Wajib Unit' : 'Opsional Unit'}
            {slot.file_name ? ` · ${slot.file_name}` : ''}
          </p>
        </div>
        {slot.uploaded ? (
          <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
        ) : (
          <CircleAlert className={cn('shrink-0', slot.required ? 'text-rose-500' : 'text-amber-500')} size={20} />
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
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
              size="sm"
              variant={fileAvailable ? 'outline' : fileMissing ? 'destructive' : 'default'}
              className={cn('h-8 gap-1 text-xs', !fileAvailable && slot.required && 'shadow-sm')}
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
              {fileAvailable ? 'Ganti PDF' : fileMissing ? 'Upload Ulang' : 'Upload PDF'}
            </Button>
          </>
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

function UnitDocCard({
  row,
  onUploaded,
  compact,
}: {
  row: DocumentPipelineRow
  onUploaded: () => void
  compact?: boolean
}) {
  const baSt = row.slots.find((s) => s.slot_key === 'ba_serah_terima')
  const baPanen = row.slots.find((s) => s.slot_key === 'ba_panen')
  const done = row.unit_complete !== false

  return (
    <Card
      className={cn(
        'overflow-hidden border transition-shadow hover:shadow-md',
        done
          ? 'border-emerald-200/80 dark:border-emerald-900/50'
          : 'border-rose-200/70 dark:border-rose-900/40',
      )}
    >
      <div
        className={cn(
          'h-1.5 w-full',
          done ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 via-amber-400 to-amber-300',
        )}
      />
      <CardHeader className={cn('pb-2', compact && 'p-3 pb-1')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold truncate">{row.no_do || '—'}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {safe(row.unit)} · {safe(row.komoditi)}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              done
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
            )}
          >
            {done ? 'Lengkap' : 'Belum'}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Inv: {safe(row.no_invoice)} · {row.tanggal ? formatDate(row.tanggal) : '—'}
        </p>
      </CardHeader>
      <CardContent className={cn('space-y-2 pt-0', compact && 'p-3 pt-0')}>
        {baSt && <SlotUploadButton slot={baSt} onUploaded={onUploaded} emphasize={!baSt.uploaded} />}
        {baPanen && <SlotUploadButton slot={baPanen} onUploaded={onUploaded} />}
        {!baSt && !baPanen && (
          <p className="text-xs text-muted-foreground py-2">Tidak ada slot dokumen unit.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function UnitDocPage() {
  const { addNotification } = useAppStore()
  const prefs = useMemo(() => readPrefs(), [])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(prefs.statusFilter || 'incomplete')
  const [unit, setUnit] = useState(prefs.unit || '')
  const [viewMode, setViewMode] = useState<ViewMode>(prefs.viewMode || 'board')
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [data, setData] = useState<DocumentPipelineResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [unitsFromApi, setUnitsFromApi] = useState<string[]>([])

  useEffect(() => {
    writePrefs({ unit, statusFilter, viewMode })
  }, [unit, statusFilter, viewMode])

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
      addNotification(err instanceof Error ? err.message : 'Gagal memuat pantauan dokumen unit', 'error')
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
  const pct = total > 0 ? (complete / total) * 100 : 0
  const missingBaSt = summary?.missing_ba_serah_terima ?? 0
  const withBaPanen = summary?.with_ba_panen ?? 0

  const pieData = useMemo(
    () => [
      { name: 'Lengkap', value: complete },
      { name: 'Belum', value: incomplete },
    ].filter((d) => d.value > 0),
    [complete, incomplete],
  )

  const unitBars = useMemo(() => {
    const list = summary?.by_unit ?? []
    return list.slice(0, 12).map((u) => ({
      name: u.unit.length > 18 ? `${u.unit.slice(0, 16)}…` : u.unit,
      fullName: u.unit,
      lengkap: u.complete,
      belum: u.incomplete,
      pct: u.pct,
    }))
  }, [summary?.by_unit])

  const unitOptions = useMemo(() => {
    const set = new Set([...unitsFromApi, ...(data?.units ?? [])])
    if (unit) set.add(unit)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [unitsFromApi, data?.units, unit])

  const boardColumns = useMemo(() => {
    const belum = rows.filter((r) => r.unit_complete === false)
    const lengkap = rows.filter((r) => r.unit_complete !== false)
    return { belum, lengkap }
  }, [rows])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-background to-emerald-50/40 dark:from-violet-950/30 dark:via-background dark:to-emerald-950/20 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-100/80 dark:bg-violet-900/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
              <Tractor size={13} />
              Khusus Unit
            </div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Kelengkapan Dokumen Unit</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Pantau dokumen yang wajib dilengkapi unit:{' '}
              <strong>BA Serah Terima Barang</strong> (wajib per DO) dan <strong>BA Panen</strong>{' '}
              (opsional). Upload PDF langsung dari kartu.
            </p>
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-white/70 dark:bg-background/60 px-2 py-1">
                <FileCheck2 size={12} className="text-violet-600" />
                BA Serah Terima = wajib
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white/70 dark:bg-background/60 px-2 py-1">
                <ClipboardList size={12} className="text-muted-foreground" />
                BA Panen = opsional
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing
              pct={pct}
              label="Unit lengkap"
              sublabel={`${complete}/${total || 0} DO`}
            />
          </div>
        </div>
      </div>

      {/* KPI + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 grid grid-cols-2 gap-3 content-start">
          {[
            {
              label: 'Total DO dipantau',
              value: total,
              icon: Building2,
              className: 'text-foreground',
            },
            {
              label: 'Unit sudah lengkap',
              value: complete,
              icon: CheckCircle2,
              className: 'text-emerald-600',
            },
            {
              label: 'Belum lengkap',
              value: incomplete,
              icon: CircleAlert,
              className: 'text-amber-600',
            },
            {
              label: 'Kurang BA Serah Terima',
              value: missingBaSt,
              icon: FileCheck2,
              className: 'text-rose-600',
            },
          ].map((k) => (
            <Card key={k.label} className="border-border/80">
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground leading-tight">{k.label}</p>
                  <k.icon size={14} className={cn('shrink-0 opacity-80', k.className)} />
                </div>
                <p className={cn('text-2xl font-bold tabular-nums mt-1', k.className)}>{k.value}</p>
              </CardContent>
            </Card>
          ))}
          <Card className="border-border/80 col-span-2">
            <CardContent className="p-3.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Sudah unggah BA Panen</p>
                <p className="text-lg font-semibold tabular-nums">{withBaPanen} DO</p>
              </div>
              <p className="text-xs text-muted-foreground max-w-[12rem] text-right">
                Opsional — tidak memblokir status lengkap unit
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-3 border-border/80">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">Proporsi kelengkapan</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Belum ada data</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {pieData.map((d) => (
                      <Cell
                        key={d.name}
                        fill={d.name === 'Lengkap' ? PIE_COLORS.complete : PIE_COLORS.incomplete}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="flex justify-center gap-4 text-xs -mt-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Lengkap
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Belum
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5 border-border/80">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">Per unit (belum vs lengkap)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {unitBars.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Belum ada data unit</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={unitBars} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value) => [value as number, '']}
                    labelFormatter={(label) => String(label)}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0]?.payload as { fullName?: string; lengkap?: number; belum?: number }
                      return (
                        <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                          <p className="font-medium mb-1">{p.fullName}</p>
                          <p className="text-amber-600">Belum: {p.belum ?? 0}</p>
                          <p className="text-emerald-600">Lengkap: {p.lengkap ?? 0}</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="belum" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="lengkap" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters + view */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Daftar DO — tugas unit</CardTitle>
            <div className="flex items-center gap-1.5">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
                {(
                  [
                    { id: 'board' as const, icon: Columns2, label: 'Papan' },
                    { id: 'grid' as const, icon: LayoutGrid, label: 'Kartu' },
                    { id: 'list' as const, icon: List, label: 'Daftar' },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewMode(v.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium',
                      viewMode === v.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <v.icon size={12} />
                    {v.label}
                  </button>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={load} disabled={loading}>
                {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Muat Ulang
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Status unit</Label>
              <NativeSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="mt-1 h-8 text-xs"
              >
                <option value="incomplete">Belum lengkap</option>
                <option value="all">Semua</option>
                <option value="complete">Sudah lengkap</option>
              </NativeSelect>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Unit (disimpan)</Label>
              <NativeSelect
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1 h-8 text-xs"
              >
                <option value="">Semua unit</option>
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cari No DO / invoice</Label>
              <div className="mt-1 flex gap-1.5">
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setQ(searchInput)}
                  placeholder="Cari…"
                  className="h-8 text-xs"
                />
                <Button type="button" size="sm" className="h-8 px-2" onClick={() => setQ(searchInput)}>
                  <Search size={13} />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Memuat data unit…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <CheckCircle2 className="mx-auto text-emerald-500" size={32} />
              <p className="text-sm font-medium">
                {statusFilter === 'incomplete'
                  ? 'Semua DO pada filter ini sudah lengkap dokumen unit 🎉'
                  : 'Tidak ada data untuk filter ini'}
              </p>
            </div>
          ) : viewMode === 'board' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-rose-200/60 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/10 p-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                    Belum lengkap
                  </h3>
                  <span className="rounded-full bg-rose-100 dark:bg-rose-950/50 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:text-rose-200">
                    {boardColumns.belum.length}
                  </span>
                </div>
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {boardColumns.belum.map((row) => (
                    <UnitDocCard key={row.row_key} row={row} onUploaded={load} compact />
                  ))}
                  {boardColumns.belum.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Kosong</p>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10 p-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Sudah lengkap
                  </h3>
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                    {boardColumns.lengkap.length}
                  </span>
                </div>
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {boardColumns.lengkap.map((row) => (
                    <UnitDocCard key={row.row_key} row={row} onUploaded={load} compact />
                  ))}
                  {boardColumns.lengkap.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Belum ada yang lengkap</p>
                  )}
                </div>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rows.map((row) => (
                <UnitDocCard key={row.row_key} row={row} onUploaded={load} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">No DO</th>
                    <th className="text-left py-2 px-2 font-medium">Unit</th>
                    <th className="text-left py-2 px-2 font-medium">BA Serah Terima</th>
                    <th className="text-left py-2 px-2 font-medium">BA Panen</th>
                    <th className="text-center py-2 px-2 font-medium">Status</th>
                    <th className="text-right py-2 px-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const baSt = row.slots.find((s) => s.slot_key === 'ba_serah_terima')
                    const baPanen = row.slots.find((s) => s.slot_key === 'ba_panen')
                    const done = row.unit_complete !== false
                    return (
                      <tr key={row.row_key} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-2 font-medium">{row.no_do}</td>
                        <td className="py-2.5 px-2">{safe(row.unit)}</td>
                        <td className="py-2.5 px-2">
                          {baSt?.uploaded ? (
                            <span className="text-emerald-600 inline-flex items-center gap-1">
                              <CheckCircle2 size={12} /> Ada
                            </span>
                          ) : (
                            <span className="text-rose-600 inline-flex items-center gap-1">
                              <CircleAlert size={12} /> Belum
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          {baPanen?.uploaded ? (
                            <span className="text-emerald-600">Ada</span>
                          ) : baPanen?.entity_id ? (
                            <span className="text-muted-foreground">Belum*</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              done
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800',
                            )}
                          >
                            {done ? 'Lengkap' : 'Belum'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex justify-end gap-1 max-w-xs ml-auto">
                            {baSt && !baSt.uploaded && (
                              <div className="w-full max-w-[200px]">
                                <SlotUploadButton slot={baSt} onUploaded={load} emphasize />
                              </div>
                            )}
                            {baSt?.uploaded && baPanen && !baPanen.uploaded && baPanen.entity_id && (
                              <div className="w-full max-w-[200px]">
                                <SlotUploadButton slot={baPanen} onUploaded={load} />
                              </div>
                            )}
                            {done && baSt?.uploaded && (
                              <span className="text-[11px] text-muted-foreground self-center">OK</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
