import * as React from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const DATE_INPUT_TYPES = new Set(['date', 'datetime-local', 'time', 'month', 'week'])

const inputBaseClassName =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, disabled, ...props }, ref) => {
    const isDateInput = type ? DATE_INPUT_TYPES.has(type) : false
    const innerRef = React.useRef<HTMLInputElement>(null)

    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

    const openPicker = () => {
      const el = innerRef.current
      if (!el || disabled) return
      if ('showPicker' in el && typeof el.showPicker === 'function') {
        try {
          el.showPicker()
        } catch {
          el.focus()
        }
      } else {
        el.focus()
      }
    }

    if (isDateInput) {
      return (
        <div className="relative block w-full min-w-0">
          <input
            type={type}
            disabled={disabled}
            className={cn(inputBaseClassName, 'date-input block pr-9', className)}
            ref={innerRef}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label="Buka kalender"
            className={cn(
              'absolute inset-y-0 right-0 flex w-9 shrink-0 items-center justify-center',
              'rounded-r-md border-l border-input/60 text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
            onClick={openPicker}
          >
            <Calendar size={15} strokeWidth={2} />
          </button>
        </div>
      )
    }

    return (
      <input
        type={type}
        disabled={disabled}
        className={cn(inputBaseClassName, 'flex', className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }