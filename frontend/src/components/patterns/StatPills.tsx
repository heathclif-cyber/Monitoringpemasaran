import { cn } from '@/lib/utils'

export type StatPillTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

export interface StatPillItem {
  label: string
  value: string | number
  tone?: StatPillTone
}

const TONE: Record<StatPillTone, string> = {
  default: 'bg-muted text-foreground',
  success:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-300',
  info: 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
}

export interface StatPillsProps {
  items: StatPillItem[]
  className?: string
}

/**
 * Ringkasan angka satu baris (halaman operasional).
 * Dashboard KPI besar tetap pakai StatCard.
 * @see docs/architecture/DESIGN_SYSTEM.md §4.4
 */
export function StatPills({ items, className }: StatPillsProps) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] tabular-nums',
            TONE[item.tone ?? 'default'],
          )}
        >
          <span className="opacity-80">{item.label}</span>
          <strong className="font-semibold">{item.value}</strong>
        </span>
      ))}
    </div>
  )
}
