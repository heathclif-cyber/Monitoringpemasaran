import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

interface MultiSelectFilterProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  allLabel?: string
  optionLabels?: Record<string, string>
  className?: string
  contentWidth?: string
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  allLabel,
  optionLabels,
  className,
  contentWidth = 'w-56',
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const allSelected = options.length > 0 && selected.length === options.length
  const fmt = (v: string) => optionLabels?.[v] ?? v

  const displayText =
    selected.length === 0
      ? allLabel ?? `Semua ${label}`
      : selected.length === 1
        ? fmt(selected[0])
        : `${selected.length} ${label} terpilih`

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    )
  }

  const toggleAll = () => {
    onChange(allSelected ? [] : [...options])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-9 justify-between font-normal text-sm px-3', className)}
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('p-2', contentWidth)} align="start">
        <button
          type="button"
          onClick={toggleAll}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <span className={cn('flex h-4 w-4 items-center justify-center rounded border', allSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-slate-300')}>
            {allSelected && <Check size={10} />}
          </span>
          Pilih Semua
        </button>
        <div className="my-1 h-px bg-slate-100" />
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {options.map((opt) => {
            const checked = selected.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted transition-colors text-left"
              >
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'bg-primary border-primary text-primary-foreground' : 'border-slate-300')}>
                  {checked && <Check size={10} />}
                </span>
                <span className="truncate">{fmt(opt)}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}