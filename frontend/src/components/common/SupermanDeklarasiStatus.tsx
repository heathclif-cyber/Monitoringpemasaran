import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { SupermanDeklarasiButton } from '@/components/common/SupermanDeklarasiButton'
import { supermanLabelFromResult } from '@/store/laporanStore'
import type { SupermanDeklarasiResult } from '@/types'

interface SupermanDeklarasiStatusProps {
  noDo: string
  existingSuperman?: string | null
  docsReady?: boolean
  onSuccess?: (result: SupermanDeklarasiResult) => void | Promise<void>
}

export function SupermanDeklarasiStatus({
  noDo,
  existingSuperman,
  docsReady = false,
  onSuccess,
}: SupermanDeklarasiStatusProps) {
  const [savedLabel, setSavedLabel] = useState(() => (existingSuperman || '').trim())

  useEffect(() => {
    setSavedLabel((existingSuperman || '').trim())
  }, [existingSuperman, noDo])

  const handleSuccess = async (result: SupermanDeklarasiResult) => {
    const label = supermanLabelFromResult(result)
    if (label) setSavedLabel(label)
    await onSuccess?.(result)
  }

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
      onSuccess={handleSuccess}
    />
  )
}