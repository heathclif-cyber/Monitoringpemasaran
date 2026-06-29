import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { SupermanDeklarasiButton } from '@/components/common/SupermanDeklarasiButton'
import { supermanLabelFromResult } from '@/store/laporanStore'
import type { SupermanDeklarasiResult } from '@/types'

interface SupermanDeklarasiStatusProps {
  noInvoice?: string
  noPembayaran?: string
  noDo?: string
  existingSuperman?: string | null
  docsReady?: boolean
  onSuccess?: (result: SupermanDeklarasiResult) => void | Promise<void>
}

export function SupermanDeklarasiStatus({
  noInvoice,
  noPembayaran = '',
  noDo,
  existingSuperman,
  docsReady = false,
  onSuccess,
}: SupermanDeklarasiStatusProps) {
  const pendingLabelRef = useRef<string | null>(null)
  const [savedLabel, setSavedLabel] = useState(() => (existingSuperman || '').trim())

  useEffect(() => {
    pendingLabelRef.current = null
    setSavedLabel((existingSuperman || '').trim())
  }, [noInvoice, noPembayaran])

  useEffect(() => {
    const fromProp = (existingSuperman || '').trim()
    if (fromProp) {
      pendingLabelRef.current = null
      setSavedLabel(fromProp)
      return
    }
    if (!pendingLabelRef.current) {
      setSavedLabel('')
    }
  }, [existingSuperman])

  const handleSuccess = async (result: SupermanDeklarasiResult) => {
    const label = supermanLabelFromResult(result)
    if (label) {
      pendingLabelRef.current = label
      setSavedLabel(label)
    }
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
      noInvoice={noInvoice}
      noPembayaran={noPembayaran}
      noDo={noDo}
      existingSuperman={existingSuperman}
      docsReady={docsReady}
      compact
      onSuccess={handleSuccess}
    />
  )
}