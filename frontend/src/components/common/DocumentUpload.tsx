import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudUpload, ExternalLink, Loader2 } from 'lucide-react'
import { client } from '@/lib/client'
import { useAppStore } from '@/store/appStore'
import { useAuthStore, useCanEdit } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DocumentDocType, DocumentEntityType, DocumentUpload as DocumentUploadType } from '@/types'

const DOC_TYPE_LABELS: Record<DocumentDocType, string> = {
  kontrak: 'Dokumen Kontrak',
  invoice: 'Invoice',
  kuitansi: 'Kuitansi',
  rekening_koran: 'Rekening Koran Penerimaan',
  do: 'Delivery Order',
  deklarasi: 'Deklarasi Penerimaan',
  berita_acara: 'Berita Acara Serah Terima',
}

interface DocumentUploadProps {
  entityType: DocumentEntityType
  entityId: string
  docType: DocumentDocType
  label?: string
  compact?: boolean
  disabled?: boolean
  onUploaded?: (doc: DocumentUploadType) => void
  className?: string
}

export function DocumentUpload({
  entityType,
  entityId,
  docType,
  label,
  compact = false,
  disabled = false,
  onUploaded,
  className,
}: DocumentUploadProps) {
  const { addNotification } = useAppStore()
  const canEdit = useCanEdit()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [latest, setLatest] = useState<DocumentUploadType | null>(null)

  const title = label || DOC_TYPE_LABELS[docType]
  const canUpload = canEdit && Boolean(entityId?.trim()) && !disabled

  const loadStatus = useCallback(async () => {
    try {
      const status = await client.get<{ configured: boolean }>('/api/documents/status')
      setConfigured(status.configured)
    } catch {
      setConfigured(false)
    }
  }, [])

  const loadLatest = useCallback(async () => {
    if (!entityId?.trim()) {
      setLatest(null)
      return
    }
    try {
      const docs = await client.get<DocumentUploadType[]>(
        `/api/documents?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}&doc_type=${encodeURIComponent(docType)}`,
      )
      setLatest(docs[0] ?? null)
    } catch {
      setLatest(null)
    }
  }, [entityType, entityId, docType])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    loadLatest()
  }, [loadLatest])

  const handleFile = async (file: File | null) => {
    if (!file || !useAuthStore.getState().canEdit() || !canUpload) return
    const formData = new FormData()
    formData.append('entity_type', entityType)
    formData.append('entity_id', entityId.trim())
    formData.append('doc_type', docType)
    formData.append('file', file)

    setUploading(true)
    try {
      const doc = await client.uploadFormData<DocumentUploadType>('/api/documents/upload', formData)
      setLatest(doc)
      addNotification(`${title} berhasil di-upload`, 'success')
      onUploaded?.(doc)
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Upload gagal', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (configured === false) {
    return compact ? null : (
      <p className="text-xs text-muted-foreground">
        Storage belum tersedia. Hubungi administrator.
      </p>
    )
  }

  if (compact) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {latest?.web_url && (
          <a
            href={latest.web_url}
            target={latest.web_url.startsWith('http') ? '_blank' : undefined}
            rel={latest.web_url.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink size={10} /> Buka
          </a>
        )}
        {canEdit && (
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".docx,.pdf,.jpg,.jpeg,.png,.xlsx,.xls"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        )}
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={!canUpload || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
            Upload
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border bg-card p-3 space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {latest && (
          <a
            href={latest.web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink size={12} /> Download
          </a>
        )}
      </div>
      {latest ? (
        <p className="text-xs text-muted-foreground truncate">{latest.file_name}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Belum ada file di-upload.</p>
      )}
      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".docx,.pdf,.jpg,.jpeg,.png,.xlsx,.xls"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      )}
      {canEdit ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            disabled={!canUpload || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
            {uploading ? 'Mengupload...' : latest ? 'Ganti File' : 'Upload Dokumen'}
          </Button>
          {!canUpload && (
            <p className="text-xs text-muted-foreground">Simpan dokumen terlebih dahulu untuk mengaktifkan upload.</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Mode tamu — hanya unduh dokumen yang sudah ada.</p>
      )}
    </div>
  )
}

export { DOC_TYPE_LABELS }