import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface FitTextProps {
  children: string
  className?: string
  minSize?: number
  maxSize?: number
}

/** Skala ukuran font agar teks selalu muat dalam lebar container */
export function FitText({ children, className, minSize = 12, maxSize = 22 }: FitTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const text = textRef.current
    if (!container || !text) return

    const fit = () => {
      let size = maxSize
      text.style.fontSize = `${size}px`
      text.style.whiteSpace = 'nowrap'

      const maxWidth = container.clientWidth
      while (size > minSize && text.scrollWidth > maxWidth) {
        size -= 0.5
        text.style.fontSize = `${size}px`
      }

      if (text.scrollWidth > maxWidth) {
        text.style.whiteSpace = 'normal'
        text.style.wordBreak = 'break-word'
      }
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [children, minSize, maxSize])

  return (
    <div ref={containerRef} className={cn('w-full min-w-0', className)}>
      <span
        ref={textRef}
        className="inline-block max-w-full font-bold tabular-nums leading-tight text-foreground"
        style={{ fontSize: `${maxSize}px` }}
      >
        {children}
      </span>
    </div>
  )
}