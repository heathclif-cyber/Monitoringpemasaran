import { Badge } from '@/components/ui/badge'

interface StatusMap {
  label: string
  variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'
}

const STATUS_MAP: Record<string, StatusMap> = {
  pending: { label: 'Pending', variant: 'secondary' },
  processing: { label: 'Processing', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  draft: { label: 'Draft', variant: 'secondary' },
  active: { label: 'Active', variant: 'success' },
  unpaid: { label: 'Unpaid', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  partial: { label: 'Partial', variant: 'info' },
}

interface StatusBadgeProps {
  status: string
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const key = status.toLowerCase()
  const mapping = STATUS_MAP[key]
  return (
    <Badge variant={mapping?.variant || 'secondary'}>
      {label || mapping?.label || status}
    </Badge>
  )
}
