import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Izinkan nilai bebas (mis. nomor dokumen baru) selain opsi dari database */
  allowCustom?: boolean
  /** Dipanggil saat nilai dipilih dari daftar atau dikonfirmasi (blur) */
  onValueCommit?: (value: string) => void
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '-- Pilih --',
  className,
  allowCustom = false,
  onValueCommit,
}: SearchableSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)
  const displayValue = open
    ? query
    : (selectedOption?.label ?? (allowCustom ? value : ''))

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const commitValue = (next: string) => {
    const trimmed = next.trim()
    onChange(trimmed)
    onValueCommit?.(trimmed)
  }

  const closeDropdown = (commit = false) => {
    if (commit && allowCustom && query.trim()) {
      commitValue(query)
    }
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown(true)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  })

  const handleSelect = (option: Option) => {
    onChange(option.value)
    onValueCommit?.(option.value)
    setQuery('')
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            if (allowCustom) {
              onChange(v)
            } else if (!v) {
              onChange('')
            }
          }}
          onFocus={() => {
            setOpen(true)
            if (allowCustom) setQuery(value)
          }}
          onBlur={() => {
            if (allowCustom && query.trim()) {
              commitValue(query)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && allowCustom && query.trim()) {
              e.preventDefault()
              commitValue(query)
              setOpen(false)
              setQuery('')
            }
            if (e.key === 'Escape') {
              closeDropdown(false)
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-lpignore="true"
          data-form-type="other"
          className="h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm w-full focus:outline-none focus:ring-1 focus:ring-ring pr-8"
        />
        <button
          type="button"
          onClick={value ? handleClear : () => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {value ? <X size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {allowCustom ? 'Ketik nomor baru atau cari di daftar' : 'Tidak ditemukan'}
            </div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={() => handleSelect(o)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                  o.value === value && 'bg-accent text-accent-foreground font-medium',
                )}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}