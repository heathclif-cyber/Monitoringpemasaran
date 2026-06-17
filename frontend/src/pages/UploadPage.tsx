import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, CloudUpload, ExternalLink, Eye, ListFilter, Loader2, Search } from 'lucide-react'
import { client } from '@/lib/client'
import { useAppStore } from '@/store/appStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { DOC_TYPE_LABELS } from '@/components/common/DocumentUpload'
import { cn } from '@/lib/utils'
import type {
  DocumentCompleteness,
  DocumentDocType,
  DocumentEntityType,
  DocumentReference,
  DocumentSlot,
  DocumentStatusResponse,
  DocumentSummaryRow,
  DocumentUpload,
} from '@/types'

type UploadEntityType = Exclude<DocumentEntityType, 'bypass'>
type SummaryEntityType = DocumentEntityType
const UPLOAD_ENTITY_TYPES: UploadEntityType[] = ['kontrak', 'invoice', 'do', 'ba']
const SUMMARY_ENTITY_TYPES: SummaryEntityType[] = ['kontrak', 'invoice', 'do', 'ba', 'bypass']

const ENTITY_TYPE_LABELS: Record<SummaryEntityType, string> = {
  kontrak: 'Kontrak',
  invoice: 'Invoice',
  do: 'Delivery Order (DO)',
  ba: 'Berita Acara',
  bypass: 'Bypass',
}

const ENTITY_REF_LABELS: Record<UploadEntityType, string> = {
  kontrak: 'Pilih No. Kontrak',
  invoice: 'Pilih No. Invoice',
  do: 'Pilih No. DO',
  ba: 'Pilih No. BA',
}

type FilterMode = 'incomplete' | 'all' | 'complete'

function CompletenessBadge({ total, uploaded }: { total: number; uploaded: number }) {
  const complete = uploaded === total && total > 0
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

function MissingBadge({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l} className="inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          <CircleAlert size={10} className="mr-0.5" /> {l}
        </span>
      ))}
    </div>
  )
}

function SlotRow({
  entityType,
  entityId,
  slot,
  configured,
  onUploaded,
}: {
  entityType: DocumentEntityType
  entityId: string
  slot: DocumentSlot
  configured: boolean
  onUploaded: () => void
}) {
  const { addNotification } = useAppStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File | null) => {
    if (!file) return
    const formData = new FormData()
    formData.append('entity_type', entityType)
    formData.append('entity_id', entityId)
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
        'flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between',
        slot.uploaded
          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
          : 'border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {slot.uploaded ? (
            <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CircleAlert size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <p className="text-sm font-medium">{slot.label}</p>
          <span className="text-xs text-muted-foreground">({DOC_TYPE_LABELS[slot.doc_type]})</span>
        </div>
        {slot.uploaded ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">{slot.file_name}</p>
        ) : (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Belum di-upload</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {slot.web_url && (
          <a
            href={slot.web_url}
            target={slot.web_url.startsWith('http') ? '_blank' : undefined}
            rel={slot.web_url.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink size={12} /> Buka
          </a>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".docx,.pdf,.jpg,.jpeg,.png,.xlsx,.xls"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant={slot.uploaded ? 'outline' : 'default'}
          size="sm"
          className="h-8 gap-1 text-xs"
          disabled={!configured || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
          {slot.uploaded ? 'Ganti' : 'Upload'}
        </Button>
      </div>
    </div>
  )
}

function CompletenessGroup({
  item,
  configured,
  onUploaded,
  nested = false,
}: {
  item: DocumentCompleteness
  configured: boolean
  onUploaded: () => void
  nested?: boolean
}) {
  return (
    <div className={cn('space-y-2', nested && 'ml-3 border-l border-border pl-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{item.display_label}</p>
        <CompletenessBadge total={item.summary.total} uploaded={item.summary.uploaded} />
        {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
      </div>
      <div className="space-y-2">
        {item.slots.map((slot) => (
          <SlotRow
            key={`${item.entity_type}-${item.entity_id}-${slot.doc_type}`}
            entityType={item.entity_type}
            entityId={item.entity_id}
            slot={slot}
            configured={configured}
            onUploaded={onUploaded}
          />
        ))}
      </div>
      {item.related.map((child) => (
        <CompletenessGroup
          key={`${child.entity_type}-${child.entity_id}`}
          item={child}
          configured={configured}
          onUploaded={onUploaded}
          nested
        />
      ))}
    </div>
  )
}

export default function UploadPage() {
  const { addNotification } = useAppStore()
  const [status, setStatus] = useState<DocumentStatusResponse | null>(null)

  // --- Summary state ---
  const [summaryType, setSummaryType] = useState<SummaryEntityType>('kontrak')
  const [summaryFilter, setSummaryFilter] = useState<FilterMode>('incomplete')
  const [summaryRows, setSummaryRows] = useState<DocumentSummaryRow[]>([])
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState<string | null>(null)

  // --- Upload state ---
  const [entityType, setEntityType] = useState<UploadEntityType>('kontrak')
  const [entityId, setEntityId] = useState('')
  const [references, setReferences] = useState<DocumentReference[]>([])
  const [loadingRefs, setLoadingRefs] = useState(false)
  const [completeness, setCompleteness] = useState<DocumentCompleteness | null>(null)
  const [loadingCompleteness, setLoadingCompleteness] = useState(false)

  useEffect(() => {
    client.get<DocumentStatusResponse>('/api/documents/status').then(setStatus).catch(() => setStatus(null))
  }, [])

  // --- Load summary ---
  const loadSummary = useCallback(async () => {
    setLoadingSummary(true)
    try {
      const data = await client.get<DocumentSummaryRow[]>(
        `/api/documents/summary?entity_type=${encodeURIComponent(summaryType)}&status_filter=${summaryFilter}&limit=200`,
      )
      setSummaryRows(data)
    } catch {
      setSummaryRows([])
    } finally {
      setLoadingSummary(false)
    }
  }, [summaryType, summaryFilter])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  // --- Load references ---
  const loadReferences = useCallback(async () => {
    setLoadingRefs(true)
    try {
      const data = await client.get<DocumentReference[]>(
        `/api/documents/references?entity_type=${encodeURIComponent(entityType)}&limit=100`,
      )
      setReferences(data)
    } catch {
      setReferences([])
    } finally {
      setLoadingRefs(false)
    }
  }, [entityType])

  const loadCompleteness = useCallback(async () => {
    if (!entityId.trim()) {
      setCompleteness(null)
      return
    }
    setLoadingCompleteness(true)
    try {
      const includeRelated = entityType === 'kontrak' || entityType === 'invoice'
      const data = await client.get<DocumentCompleteness>(
        `/api/documents/completeness?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}&include_related=${includeRelated}`,
      )
      setCompleteness(data)
    } catch (err: unknown) {
      setCompleteness(null)
      addNotification(err instanceof Error ? err.message : 'Gagal memuat status dokumen', 'error')
    } finally {
      setLoadingCompleteness(false)
    }
  }, [entityType, entityId, addNotification])

  useEffect(() => {
    setEntityId('')
    setCompleteness(null)
    loadReferences()
  }, [entityType, loadReferences])

  useEffect(() => {
    loadCompleteness()
  }, [loadCompleteness])

  const referenceOptions = useMemo(
    () =>
      references.map((ref) => ({
        value: ref.entity_id,
        label: ref.sublabel ? `${ref.label} — ${ref.sublabel}` : ref.label,
      })),
    [references],
  )

  const selectedRef = references.find((r) => r.entity_id === entityId)

  // Jump from summary to upload detail
  const jumpToUpload = (etype: UploadEntityType, eid: string) => {
    setEntityType(etype)
    setEntityId(eid)
    // scroll to upload section
    document.getElementById('upload-detail-card')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* ======== SUMMARY TABLE ======== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListFilter size={16} className="text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Ringkasan Upload</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <NativeSelect
                value={summaryType}
                onChange={(e) => {
                  setSummaryType(e.target.value as SummaryEntityType)
                  setSummaryExpanded(null)
                }}
                className="h-8 w-auto text-xs"
              >
                {SUMMARY_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{ENTITY_TYPE_LABELS[t]}</option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={summaryFilter}
                onChange={(e) => {
                  setSummaryFilter(e.target.value as FilterMode)
                  setSummaryExpanded(null)
                }}
                className="h-8 w-auto text-xs"
              >
                <option value="incomplete">Belum Lengkap</option>
                <option value="all">Semua</option>
                <option value="complete">Sudah Lengkap</option>
              </NativeSelect>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSummary ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 size={16} className="animate-spin" /> Memuat ringkasan...
            </div>
          ) : summaryRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {summaryFilter === 'incomplete'
                ? 'Semua dokumen sudah lengkap 🎉'
                : 'Belum ada data dokumen.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-2 font-medium">No Dokumen</th>
                    <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">Keterangan</th>
                    <th className="text-center py-2 px-2 font-medium w-20">Status</th>
                    <th className="text-left py-2 px-2 font-medium hidden md:table-cell">Belum Upload</th>
                    <th className="text-center py-2 pl-2 font-medium w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr
                      key={`${row.entity_type}-${row.entity_id}`}
                      className={cn(
                        'border-b last:border-0 hover:bg-muted/50 cursor-pointer',
                        summaryExpanded === `${row.entity_type}-${row.entity_id}` && 'bg-muted/30',
                      )}
                      onClick={() => {
                        setSummaryExpanded(
                          summaryExpanded === `${row.entity_type}-${row.entity_id}`
                            ? null
                            : `${row.entity_type}-${row.entity_id}`,
                        )
                      }}
                    >
                      <td className="py-2 pr-2">
                        <span className="font-medium">{row.display_label}</span>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground hidden sm:table-cell max-w-[140px] truncate">
                        {row.sublabel || '-'}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <CompletenessBadge total={row.total} uploaded={row.uploaded} />
                      </td>
                      <td className="py-2 px-2 hidden md:table-cell">
                        <MissingBadge labels={row.slots.filter((s) => !s.uploaded).map((s) => s.label)} />
                      </td>
                      <td className="py-2 pl-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Lihat detail upload"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (row.entity_type === 'bypass') return
                            jumpToUpload(row.entity_type as UploadEntityType, row.entity_id)
                          }}
                        >
                          <Eye size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Expanded: inline slot rows */}
              {summaryExpanded && (() => {
                const expandedRow = summaryRows.find(
                  (r) => `${r.entity_type}-${r.entity_id}` === summaryExpanded,
                )
                if (!expandedRow) return null
                return (
                  <div className="mt-2 p-3 rounded-md border bg-muted/20 space-y-2">
                    <p className="text-xs font-semibold">
                      {expandedRow.display_label}
                      {expandedRow.sublabel ? ` · ${expandedRow.sublabel}` : ''}
                    </p>
                    {expandedRow.slots.map((slot) => (
                      <SlotRow
                        key={`exp-${expandedRow.entity_type}-${expandedRow.entity_id}-${slot.doc_type}`}
                        entityType={expandedRow.entity_type}
                        entityId={expandedRow.entity_id}
                        slot={slot}
                        configured={Boolean(status?.configured)}
                        onUploaded={() => {
                          loadSummary()
                          loadCompleteness()
                        }}
                      />
                    ))}
                    {expandedRow.entity_type !== 'bypass' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          jumpToUpload(expandedRow.entity_type as UploadEntityType, expandedRow.entity_id)
                        }
                      >
                        <Search size={12} /> Buka detail lengkap
                      </Button>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======== UPLOAD DETAIL ======== */}
      <Card id="upload-detail-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Upload Dokumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Jenis Referensi Dokumen</Label>
            <NativeSelect
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as UploadEntityType)}
              className="mt-1"
            >
              {UPLOAD_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{ENTITY_TYPE_LABELS[t]}</option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground mt-1">
              Pilih jenis dokumen bisnis, lalu pilih nomornya di bawah.
            </p>
          </div>

          <div>
            <Label className="text-xs">{ENTITY_REF_LABELS[entityType]}</Label>
            <div className="mt-1">
              <SearchableSelect
                options={referenceOptions}
                value={entityId}
                onChange={setEntityId}
                placeholder={loadingRefs ? 'Memuat daftar...' : '-- Cari & pilih nomor --'}
              />
            </div>
            {selectedRef && (
              <p className="text-xs text-muted-foreground mt-1">
                Terpilih: <span className="font-medium text-foreground">{selectedRef.label}</span>
                {selectedRef.sublabel ? ` · ${selectedRef.sublabel}` : ''}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {entityId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">Status Kelengkapan Dokumen</CardTitle>
              {completeness && <CompletenessBadge total={completeness.summary.total} uploaded={completeness.summary.uploaded} />}
            </div>
          </CardHeader>
          <CardContent>
            {loadingCompleteness ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 size={16} className="animate-spin" /> Memuat status dokumen...
              </div>
            ) : completeness ? (
              <CompletenessGroup
                item={completeness}
                configured={Boolean(status?.configured)}
                onUploaded={loadCompleteness}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Tidak ada data kelengkapan.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
