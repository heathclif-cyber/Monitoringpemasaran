import { useEffect, useMemo, useState } from 'react'
import { CloudUpload, ExternalLink, Loader2 } from 'lucide-react'
import { client } from '@/lib/client'
import { useAppStore } from '@/store/appStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { DOC_TYPE_LABELS } from '@/components/common/DocumentUpload'
import type { DocumentDocType, DocumentEntityType, DocumentStatusResponse, DocumentUpload } from '@/types'

const DOC_ENTITY_MAP: Record<DocumentDocType, DocumentEntityType> = {
  kontrak: 'kontrak',
  invoice: 'invoice',
  kuitansi: 'invoice',
  do: 'do',
  deklarasi: 'do',
  berita_acara: 'do',
}

const REF_LABELS: Record<DocumentEntityType, string> = {
  kontrak: 'No. Kontrak',
  invoice: 'No. Invoice',
  do: 'No. DO',
  bypass: 'ID Bypass',
}

export default function UploadPage() {
  const { addNotification } = useAppStore()
  const [status, setStatus] = useState<DocumentStatusResponse | null>(null)
  const [docType, setDocType] = useState<DocumentDocType>('kontrak')
  const [entityId, setEntityId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<DocumentUpload | null>(null)

  const entityType = DOC_ENTITY_MAP[docType]

  useEffect(() => {
    client.get<DocumentStatusResponse>('/api/documents/status').then(setStatus).catch(() => setStatus(null))
  }, [])

  const docOptions = useMemo(
    () => (status?.doc_types ?? Object.keys(DOC_TYPE_LABELS)) as DocumentDocType[],
    [status],
  )

  const handleUpload = async () => {
    if (!entityId.trim() || !file) {
      addNotification('Lengkapi nomor referensi dan pilih file', 'warning')
      return
    }
    const formData = new FormData()
    formData.append('entity_type', entityType)
    formData.append('entity_id', entityId.trim())
    formData.append('doc_type', docType)
    formData.append('file', file)

    setUploading(true)
    try {
      const doc = await client.uploadFormData<DocumentUpload>('/api/documents/upload', formData)
      setResult(doc)
      addNotification('Dokumen berhasil di-upload ke OneDrive', 'success')
      setFile(null)
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Upload gagal', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Upload Dokumen ke OneDrive</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && !status.configured && status.mode === 'pending_auth' && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-2 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
              <p className="font-medium">Setup akun Microsoft Family / personal</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Isi <code className="bg-blue-100 px-1 rounded">MS_CLIENT_ID</code> dan{' '}
                  <code className="bg-blue-100 px-1 rounded">MS_CLIENT_SECRET</code> di .env, lalu restart backend.</li>
                <li>Daftarkan redirect URI di Azure: <code className="bg-blue-100 px-1 rounded break-all">{status.redirect_uri}</code></li>
                <li>Klik tombol di bawah, login dengan akun Family Anda.</li>
                <li>Salin <code className="bg-blue-100 px-1 rounded">MS_REFRESH_TOKEN</code> dari halaman sukses ke .env, restart lagi.</li>
              </ol>
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
              <code className="bg-amber-100 px-1 rounded">MS_CLIENT_SECRET</code> di .env untuk memulai setup akun personal.
            </div>
          )}

          <div>
            <Label className="text-xs">Jenis Dokumen</Label>
            <NativeSelect
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentDocType)}
              className="mt-1"
            >
              {docOptions.map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label className="text-xs">{REF_LABELS[entityType]}</Label>
            <Input
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder={
                entityType === 'do' && docType === 'deklarasi'
                  ? 'Contoh: DO-2024-001'
                  : 'Nomor referensi dokumen'
              }
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Referensi: {entityType} — dokumen harus sudah tersimpan di sistem.
            </p>
          </div>

          <div>
            <Label className="text-xs">File</Label>
            <Input
              type="file"
              accept=".docx,.pdf,.jpg,.jpeg,.png,.xlsx,.xls"
              className="mt-1"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground mt-1">Format: docx, pdf, jpg, png, xlsx. Maks. 25 MB.</p>
          </div>

          <Button
            type="button"
            className="gap-2"
            disabled={uploading || !status?.configured}
            onClick={handleUpload}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
            {uploading ? 'Mengupload...' : 'Upload ke OneDrive'}
          </Button>

          {result && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
              <p className="font-medium text-green-700 dark:text-green-400">Upload berhasil</p>
              <p className="truncate">{result.file_name}</p>
              <a href={result.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Buka di OneDrive
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Struktur Folder OneDrive</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1 font-mono">
          <p>Monitoring Pemasaran/</p>
          <p className="pl-3">├── Kontrak/&#123;no_kontrak&#125;/</p>
          <p className="pl-3">├── Invoice/&#123;no_invoice&#125;/</p>
          <p className="pl-3">├── DO/&#123;no_do&#125;/</p>
          <p className="pl-3">├── Deklarasi/&#123;no_do&#125;/</p>
          <p className="pl-3">└── Berita-Acara/&#123;no_do&#125;/</p>
        </CardContent>
      </Card>
    </div>
  )
}