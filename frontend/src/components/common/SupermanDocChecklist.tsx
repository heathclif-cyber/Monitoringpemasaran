import { CheckCircle2, CircleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { SupermanDocRequirement } from '@/types'

interface SupermanDocChecklistProps {
  requirements?: SupermanDocRequirement[]
  docsReady?: boolean
}

export function SupermanDocChecklist({ requirements = [], docsReady = false }: SupermanDocChecklistProps) {
  if (requirements.length === 0) {
    return <span className="text-muted-foreground">-</span>
  }

  return (
    <div className="min-w-[7rem] space-y-1">
      <span
        className={cn(
          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
          docsReady
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        )}
      >
        {docsReady ? 'Siap' : 'Belum'}
      </span>
      <ul className="space-y-0.5">
        {requirements.map((req) => (
          <li
            key={`${req.entity_type}-${req.entity_id}-${req.doc_type}`}
            className="flex items-center gap-1 text-[11px] leading-tight"
            title={req.uploaded && req.file_name ? req.file_name : req.upload_hint || req.label}
          >
            {req.uploaded ? (
              <CheckCircle2 size={11} className="shrink-0 text-emerald-600" />
            ) : (
              <CircleAlert size={11} className="shrink-0 text-amber-600" />
            )}
            <span className={cn(!req.uploaded && 'text-amber-800 dark:text-amber-300')}>
              {req.label === 'Dokumen Kontrak'
                ? 'Kontrak'
                : req.label === 'Berita Acara (DO)'
                  ? 'BA DO'
                  : req.label === 'Deklarasi Penerimaan (DO)'
                    ? 'Deklarasi'
                    : req.label === 'Dokumen DO/SPPB'
                      ? 'DO/SPPB'
                      : req.label === 'Dokumen Pendukung'
                        ? 'Kontrak/BA/Deklarasi'
                        : req.label}
            </span>
          </li>
        ))}
      </ul>
      {!docsReady && (
        <Link to="/upload" className="text-[10px] text-primary hover:underline">
          Upload
        </Link>
      )}
    </div>
  )
}