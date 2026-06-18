import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FormStep {
  id: string
  label: string
  description?: string
}

interface FormStepperProps {
  steps: FormStep[]
  activeStep: number
  onStepClick?: (index: number) => void
  className?: string
}

export function FormStepper({ steps, activeStep, onStepClick, className }: FormStepperProps) {
  return (
    <nav aria-label="Progress" className={cn('mb-6', className)}>
      <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((step, index) => {
          const isComplete = index < activeStep
          const isActive = index === activeStep
          const isClickable = onStepClick && (isComplete || isActive)

          return (
            <li key={step.id} className="flex items-center shrink-0">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(index)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                  isActive && 'bg-primary/10 text-primary',
                  isComplete && !isActive && 'text-muted-foreground hover:bg-muted/50',
                  !isActive && !isComplete && 'text-muted-foreground',
                  isClickable && 'cursor-pointer',
                  !isClickable && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold border',
                    isActive && 'border-primary bg-primary text-primary-foreground',
                    isComplete && !isActive && 'border-primary/30 bg-primary/10 text-primary',
                    !isActive && !isComplete && 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {isComplete ? <Check size={12} /> : index + 1}
                </span>
                <span className="hidden sm:block">
                  <span className="block text-xs font-semibold leading-tight">{step.label}</span>
                  {step.description && (
                    <span className="block text-[10px] text-muted-foreground font-normal">{step.description}</span>
                  )}
                </span>
              </button>
              {index < steps.length - 1 && (
                <div className={cn('mx-1 h-px w-4 sm:w-8', index < activeStep ? 'bg-primary/40' : 'bg-border')} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface FormStepActionsProps {
  activeStep: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  isSubmitting?: boolean
  submitLabel?: string
  extraActions?: React.ReactNode
}

export function FormStepActions({
  activeStep,
  totalSteps,
  onBack,
  onNext,
  isSubmitting,
  submitLabel = 'Simpan',
  extraActions,
}: FormStepActionsProps) {
  const isLast = activeStep === totalSteps - 1

  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      {activeStep > 0 && (
        <ButtonBack type="button" onClick={onBack} />
      )}
      {!isLast ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onNext()
          }}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Lanjut
        </button>
      ) : (
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Menyimpan...' : submitLabel}
        </button>
      )}
      {extraActions}
    </div>
  )
}

function ButtonBack({ onClick }: { onClick: () => void; type?: 'button' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted transition-colors"
    >
      Kembali
    </button>
  )
}