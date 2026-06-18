import { CheckCircle2 } from 'lucide-react'
import { SupermanDeklarasiButton } from '@/components/common/SupermanDeklarasiButton'

interface SupermanDeklarasiStatusProps {
  noDo: string
  existingSuperman?: string | null
  docsReady?: boolean
  onSuccess?: () => void
}

export function SupermanDeklarasiStatus({
  noDo,
  existingSuperman,
  docsReady = false,
  onSuccess,
}: SupermanDeklarasiStatusProps) {
  const savedLabel = (existingSuperman || '').trim()

  if (savedLabel) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-400 min-w-[8rem]">
        <CheckCircle2 size={13} />
        <span className="break-words">{savedLabel}</span>
      </div>
    )
  }

  return (
    <SupermanDeklarasiButton
      noDo={noDo}
      existingSuperman={existingSuperman}
      docsReady={docsReady}
      compact
      onSuccess={onSuccess}
    />
  )
}