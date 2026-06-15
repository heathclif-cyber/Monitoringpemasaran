import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, CloudUpload, ExternalLink, Loader2 } from 'lucide-react'
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
  DocumentUpload,
} from '@/types'

type UploadEntityType = Exclude<DocumentEntityType, 'bypass'>
const UPLOAD_ENTITY_TYPES: UploadEntityType[] = ['kontrak', 'invoice', 'do', 'ba']

const ENTITY_TYPE_LABELS: Record<UploadEntityType, string> = {
  kontrak: 'Kontrak',
  invoice: 'Invoice',
  do: 'Delivery Order (DO)',
  ba: 'Berita Acara',
}

const ENTITY_REF_LABELS: Record<UploadEntityType, string> = {
  kontrak: 'Pilih No. Kontrak',
  invoice: 'Pilih No. Invoice',
  do: 'Pilih No. DO',
  ba: 'Pilih No. BA',
}

function CompletenessBadge({ summary }: { summary: DocumentCompleteness['summary'] }) {
  const complete = summary.missing === 0
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        complete
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      )}
    >
      {summary.uploaded}/{summary.total} lengkap
    </span>
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
        {slot.web_url?.startsWith('http') && (
          <a
            href={slot.web_url}
            target="_blank"
            rel="noopener noreferrer"
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
        <CompletenessBadge summary={item.summary} />
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
  const [entityType, setEntityType] = useState<UploadEntityType>('kontrak')
  const [entityId, setEntityId] = useState('')
  const [references, setReferences] = useState<DocumentReference[]>([])
  const [loadingRefs, setLoadingRefs] = useState(false)
  const [completeness, setCompleteness] = useState<DocumentCompleteness | null>(null)
  const [loadingCompleteness, setLoadingCompleteness] = useState(false)

  useEffect(() => {
    client.get<DocumentStatusResponse>('/api/documents/status').then(setStatus).catch(() => setStatus(null))
  }, [])

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

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Upload Dokumen ke OneDrive</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && !status.configured && status.mode === 'pending_auth' && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-2 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
              <p className="font-medium">Setup akun Microsoft Family / personal</p>
              {status.auth_url && (
                <Button type="button" variant="outline" size="sm" className="gap-1 h-8" asChild>
                  <a href={status.auth_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={12} /> Hubungkan Akun Microsoft
                  </a>
                </Button>
              )}
            </div>
          )}

          {status && !status.configured && status.mode === null && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              OneDrive belum dikonfigurasi. Set <code className="bg-amber-100 px-1 rounded">MS_CLIENT_ID</code> dan{' '}
              <code className="bg-amber-100 px-1 rounded">MS_CLIENT_SECRET</code> di .env.
            </div>
          )}

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
              {completeness && <CompletenessBadge summary={completeness.summary} />}
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Dokumen per Jenis</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p><strong>Kontrak:</strong> Dokumen Kontrak</p>
          <p><strong>Invoice:</strong> Invoice, Kuitansi</p>
          <p><strong>DO:</strong> Delivery Order, Deklarasi Penerimaan, Berita Acara Serah Terima</p>
          <p><strong>BA:</strong> Berita Acara Serah Terima</p>
          {entityType === 'kontrak' && (
            <p className="pt-2 text-foreground">Pilih kontrak untuk melihat juga status invoice & DO terkait.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}