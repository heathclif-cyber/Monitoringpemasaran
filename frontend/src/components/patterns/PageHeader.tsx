import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: string
  description?: string
  /** Optional chip/badge left of title area */
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/**
 * Judul + deskripsi + aksi kanan. Satu baris di desktop.
 * @see docs/architecture/DESIGN_SYSTEM.md §4.2
 */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow}
        <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {title}
        </h1>
        {description ? (
          <p className="text-xs text-muted-foreground sm:text-sm max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </div>
  )
}
