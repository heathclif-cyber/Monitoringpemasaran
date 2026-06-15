import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatTrendPct, type TrendDelta } from '@/lib/trendUtils'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  subtitle?: string
  icon?: LucideIcon
  iconClassName?: string
  trend?: TrendDelta
  onClick?: () => void
  /** Tampilkan nilai penuh tanpa ellipsis — untuk nominal besar */
  wrapValue?: boolean
  /** Ukuran ringkas untuk halaman data padat (mis. Laporan) */
  compact?: boolean
}

export function StatCard({ label, value, subtitle, icon: Icon, iconClassName, trend, onClick, wrapValue, compact }: StatCardProps) {
  const trendUp = trend && trend.pct > 0
  const trendDown = trend && trend.pct < 0
  const trendFlat = trend && trend.pct === 0

  return (
    <Card
      className={cn(
        'border-border/80',
        onClick && 'cursor-pointer hover:border-border hover:shadow-sm transition-all',
      )}
      onClick={onClick}
    >
      <CardContent className={cn('p-4', compact && 'p-3.5', wrapValue && !compact && 'p-5')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={cn(
              'text-xs text-muted-foreground font-medium',
              wrapValue ? 'leading-snug' : 'truncate',
            )}>
              {label}
            </p>
            <p className={cn(
              'font-bold text-foreground tabular-nums',
              compact && 'mt-1 text-sm leading-snug break-words',
              wrapValue && !compact && 'mt-1.5 text-base sm:text-lg leading-snug break-words',
              !wrapValue && !compact && 'mt-1 text-2xl truncate',
            )}>
              {value}
            </p>
            {trend && (
              <div className={cn(
                'flex items-center gap-1 mt-1 text-xs font-medium',
                trendUp && 'text-emerald-600 dark:text-emerald-400',
                trendDown && 'text-rose-600 dark:text-rose-400',
                trendFlat && 'text-muted-foreground',
              )}>
                {trendUp && <TrendingUp size={12} />}
                {trendDown && <TrendingDown size={12} />}
                {trendFlat && <Minus size={12} />}
                <span>{formatTrendPct(trend.pct)}</span>
                <span className="text-muted-foreground font-normal">{trend.label}</span>
              </div>
            )}
            {subtitle && (
              <p className={cn(
                'text-muted-foreground',
                compact ? 'text-xs mt-0.5 leading-snug' : wrapValue ? 'text-sm mt-1 leading-snug break-words' : 'text-xs mt-0.5',
              )}>
                {subtitle}
              </p>
            )}
          </div>
          {Icon && (
            <Icon
              size={compact ? 18 : 22}
              className={cn('text-primary shrink-0', compact ? 'ml-2' : 'ml-3', iconClassName)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
