import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Banknote,
  Truck,
  Table,
  Zap,
  Archive,
  CloudUpload,
  ClipboardList,
  Boxes,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

const NAV_COMMANDS = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, group: 'Menu' },
  { label: 'Buat Kontrak', to: '/kontrak', icon: FileText, group: 'Menu' },
  { label: 'Cetak Invoice', to: '/invoice', icon: Receipt, group: 'Menu' },
  { label: 'Input Pembayaran', to: '/pembayaran', icon: Banknote, group: 'Menu' },
  { label: 'Delivery Order', to: '/delivery-order', icon: Truck, group: 'Menu' },
  { label: 'Berita Acara', to: '/berita-acara', icon: ClipboardList, group: 'Menu' },
  { label: 'Upload Dokumen', to: '/upload', icon: CloudUpload, group: 'Menu' },
  { label: 'Persediaan', to: '/stok', icon: Boxes, group: 'Menu' },
  { label: 'Laporan Digital', to: '/laporan', icon: Table, group: 'Menu' },
  { label: 'Input Bypass', to: '/bypass', icon: Zap, group: 'Menu' },
  { label: 'Arsip Kontrak', to: '/repo/kontrak', icon: Archive, group: 'Repository' },
  { label: 'Arsip Invoice', to: '/repo/invoice', icon: Receipt, group: 'Repository' },
  { label: 'Arsip Pembayaran', to: '/repo/pembayaran', icon: Banknote, group: 'Repository' },
  { label: 'Arsip Delivery Order', to: '/repo/do', icon: Truck, group: 'Repository' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const run = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const groups = ['Menu', 'Repository'] as const

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Cari halaman..." />
      <CommandList>
        <CommandEmpty>Tidak ditemukan.</CommandEmpty>
        {groups.map((group, gi) => (
          <div key={group}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {NAV_COMMANDS.filter((c) => c.group === group).map((cmd) => {
                const Icon = cmd.icon
                return (
                  <CommandItem key={cmd.to} value={cmd.label} onSelect={() => run(cmd.to)}>
                    <Icon size={15} className="text-muted-foreground" />
                    <span>{cmd.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  )
}