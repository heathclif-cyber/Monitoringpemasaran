import { useState } from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface PreviewPanelProps {
  title: string
  children: React.ReactNode
  isEmpty?: boolean
  emptyIcon?: React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
}

export function PreviewPanel({
  title,
  children,
  isEmpty,
  emptyIcon,
  emptyTitle = 'Belum ada data',
  emptyDescription = 'Isi form untuk melihat preview',
}: PreviewPanelProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const content = isEmpty ? (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {emptyIcon ?? <Eye size={32} className="text-slate-300 mb-3" />}
      <p className="text-sm text-slate-500 font-medium">{emptyTitle}</p>
      <p className="text-xs text-slate-400 mt-1">{emptyDescription}</p>
    </div>
  ) : (
    children
  )

  return (
    <>
      <div className="lg:hidden fixed bottom-5 right-5 z-30">
        <Button size="sm" className="gap-2 shadow-lg" onClick={() => setMobileOpen(true)}>
          <Eye size={14} />
          Preview
        </Button>
      </div>

      <div className="hidden lg:block w-full lg:w-[600px] shrink-0">
        <div className="sticky top-[76px] max-h-[calc(100vh-100px)] overflow-y-auto rounded-xl border border-border bg-card shadow-sm">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <Eye size={14} className="text-slate-400" />
          </div>
          <div className={cn('p-5', !isEmpty && 'p-2.5')}>{content}</div>
        </div>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          </DialogHeader>
          <div className="p-5 pt-3 overflow-auto max-h-[75vh]">{content}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}