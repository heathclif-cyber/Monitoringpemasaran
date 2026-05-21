import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Loader2 } from 'lucide-react'

interface DocxPreviewProps {
  url: string
  className?: string
}

export function DocxPreview({ url, className }: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then((blob) => {
        if (cancelled) return
        const container = containerRef.current
        if (!container) return
        container.innerHTML = ''
        return renderAsync(blob, container, undefined, {
          className: 'docx-preview',
          inWrapper: true,
          ignoreWidth: true,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: false,
          trimXmlDeclaration: true,
          useBase64URL: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => { cancelled = true }
  }, [url])

  if (error) {
    return <div className="text-sm text-red-500 p-8 text-center">Gagal memuat preview: {error}</div>
  }

  return (
    <div className={className} ref={containerRef}>
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-slate-300" />
      </div>
    </div>
  )
}
