import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  subtitle?: string
  icon?: LucideIcon
  iconClassName?: string
  onClick?: () => void
}

export function StatCard({ label, value, subtitle, icon: Icon, iconClassName, onClick }: StatCardProps) {
  return (
    <Card
      className={cn(onClick && 'cursor-pointer hover:shadow-md transition-shadow')}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 truncate">{value}</p>
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
