import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface FilterToolbarProps {
  children: React.ReactNode
  /** Extra actions aligned to the right on wide screens */
  end?: React.ReactNode
  className?: string
  contentClassName?: string
}

/**
 * Baris filter standar di dalam Card.
 * Anak: NativeSelect / Input / checkbox — gunakan h-8.
 * @see docs/architecture/DESIGN_SYSTEM.md §4.3
 */
export function FilterToolbar({ children, end, className, contentClassName }: FilterToolbarProps) {
  return (
    <Card className={cn('border-border/80 shadow-sm', className)}>
      <CardContent
        className={cn(
          'p-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center',
          contentClassName,
        )}
      >
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">{children}</div>
        {end ? <div className="flex flex-wrap items-center gap-2 shrink-0">{end}</div> : null}
      </CardContent>
    </Card>
  )
}
