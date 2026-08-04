import { cn } from '@/lib/utils'
import { CheckCircle2, CircleAlert, type LucideIcon } from 'lucide-react'

export type StatusPillTone = 'success' | 'warning' | 'danger' | 'neutral' | 'action'

const TONE: Record<StatusPillTone, string> = {
  success:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  neutral: 'bg-muted text-muted-foreground',
  action: 'bg-primary text-primary-foreground',
}

export interface StatusPillProps {
  children: React.ReactNode
  tone?: StatusPillTone
  icon?: LucideIcon | false
  className?: string
}

/**
 * Chip status kecil untuk baris list.
 * @see docs/architecture/DESIGN_SYSTEM.md §3
 */
export function StatusPill({ children, tone = 'neutral', icon, className }: StatusPillProps) {
  const DefaultIcon =
    icon === false
      ? null
      : icon
        ? icon
        : tone === 'success'
          ? CheckCircle2
          : tone === 'danger' || tone === 'warning' || tone === 'action'
            ? CircleAlert
            : null
  const Icon = DefaultIcon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        TONE[tone],
        className,
      )}
    >
      {Icon ? <Icon size={11} className="shrink-0" /> : null}
      {children}
    </span>
  )
}
