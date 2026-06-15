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
}

export function StatCard({ label, value, subtitle, icon: Icon, iconClassName, trend, onClick }: StatCardProps) {
  const trendUp = trend && trend.pct > 0
  const trendDown = trend && trend.pct < 0
  const trendFlat = trend && trend.pct === 0

  return (
    <Card
      className={cn(
        'border-slate-200/80',
        onClick && 'cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all',
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 truncate tabular-nums">{value}</p>
            {trend && (
              <div className={cn(
                'flex items-center gap-1 mt-1 text-xs font-medium',
                trendUp && 'text-emerald-600',
                trendDown && 'text-rose-600',
                trendFlat && 'text-slate-400',
              )}>
                {trendUp && <TrendingUp size={12} />}
                {trendDown && <TrendingDown size={12} />}
                {trendFlat && <Minus size={12} />}
                <span>{formatTrendPct(trend.pct)}</span>
                <span className="text-slate-400 font-normal">{trend.label}</span>
              </div>
            )}
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <Icon
              size={22}
              className={cn('text-brand-600 shrink-0 ml-3', iconClassName)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
