import { CheckCircle2, CircleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SupermanDeklarasiButton } from '@/components/common/SupermanDeklarasiButton'
import { cn } from '@/lib/utils'
import type { SupermanDocRequirement } from '@/types'

interface SupermanDeklarasiStatusProps {
  noDo: string
  existingSuperman?: string | null
  requirements?: SupermanDocRequirement[]
  docsReady?: boolean
  onSuccess?: () => void
}

export function SupermanDeklarasiStatus({
  noDo,
  existingSuperman,
  requirements = [],
  docsReady = false,
  onSuccess,
}: SupermanDeklarasiStatusProps) {
  const savedLabel = (existingSuperman || '').trim()

  if (savedLabel) {
    return (
      <div className="space-y-1.5 min-w-[11rem]">
        <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={13} />
          <span>{savedLabel}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 min-w-[11rem]">
      {requirements.length > 0 && (
        <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Dokumen wajib
          </p>
          {requirements.map((req) => (
            <div key={`${req.entity_type}-${req.entity_id}-${req.doc_type}`} className="text-[11px] leading-snug">
              <div className="flex items-start gap-1">
                {req.uploaded ? (
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <CircleAlert size={12} className="mt-0.5 shrink-0 text-amber-600" />
                )}
                <span className={cn(req.uploaded ? 'text-foreground' : 'text-amber-800 dark:text-amber-300')}>
                  {req.label}
                  {req.uploaded && req.file_name ? ` (${req.file_name})` : ''}
                </span>
              </div>
              {!req.uploaded && req.upload_hint && (
                <p className="ml-4 text-[10px] text-muted-foreground">{req.upload_hint}</p>
              )}
            </div>
          ))}
          {!docsReady && (
            <Link to="/upload" className="ml-4 inline-block text-[10px] text-primary hover:underline">
              Buka Upload Dokumen
            </Link>
          )}
        </div>
      )}

      <SupermanDeklarasiButton
        noDo={noDo}
        existingSuperman={existingSuperman}
        docsReady={docsReady}
        compact
        onSuccess={onSuccess}
      />
    </div>
  )
}