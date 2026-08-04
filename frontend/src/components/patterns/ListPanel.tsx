import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/common/EmptyState'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface ListPanelProps {
  children: React.ReactNode
  loading?: boolean
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: LucideIcon
  className?: string
  /** Optional sticky header row above list body */
  header?: React.ReactNode
}

/**
 * Kontainer list/tabel standar: loading, empty, border card.
 * @see docs/architecture/DESIGN_SYSTEM.md §4.5
 */
export function ListPanel({
  children,
  loading,
  empty,
  emptyTitle = 'Tidak ada data',
  emptyDescription,
  emptyIcon,
  className,
  header,
}: ListPanelProps) {
  return (
    <Card className={cn('border-border/80 shadow-sm overflow-hidden', className)}>
      {header}
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Memuat…
          </div>
        ) : empty ? (
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
