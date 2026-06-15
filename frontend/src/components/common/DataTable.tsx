import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  key: string
  header: string
  align?: 'left' | 'center' | 'right'
  className?: string
  headerClassName?: string
  render: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  maxHeight?: string
  onRowClick?: (row: T) => void
}

const alignClass = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  maxHeight = '65vh',
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="sticky top-0 z-10 border-b bg-muted/95 backdrop-blur-sm">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-3 py-2.5 text-xs font-medium text-muted-foreground',
                  alignClass[col.align ?? 'left'],
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row) => (
            <tr
              key={keyExtractor(row)}
              className={cn(
                'group transition-colors hover:bg-muted/50',
                onRowClick && 'cursor-pointer',
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-3 py-2.5',
                    alignClass[col.align ?? 'left'],
                    col.className,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}