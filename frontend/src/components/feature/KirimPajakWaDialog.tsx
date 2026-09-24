import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { client } from '@/lib/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import type { Invoice, KontakPajak, KontakPajakInput, Kontrak } from '@/types'

/** Pesan permintaan faktur pajak. DPP/PPN dipecah dari jumlah invoice (= pokok + PPN). */
function buildPesan(nama: string, inv: Invoice, k: Kontrak, hargaSatuan: number): string {
  const isPpn = String(k.is_ppn).toLowerCase() !== 'false'
  const ppnPct = k.ppn_persen || 11
  const total = inv.jumlah_pembayaran || 0
  const dpp = isPpn ? total / (1 + ppnPct / 100) : total
  const ppn = total - dpp
  const satuan = k.satuan || 'Kg'
  const pembeli = (k.pembeli || '-').split('\n')[0]

  const lines = [
    `Yth. Bapak/Ibu ${nama},`,
    '',
    'Mohon bantuan pembuatan *Faktur Pajak* untuk invoice berikut:',
    '',
    `No. Invoice : ${inv.no_invoice}`,
    `Tanggal : ${formatDate(inv.tanggal_transaksi)}`,
    `No. Kontrak : ${inv.no_kontrak}`,
    `Pembeli : ${pembeli}`,
    ...(k.alamat_pembeli ? [`Alamat : ${k.alamat_pembeli.replace(/\n/g, ', ')}`] : []),
    `Komoditi : ${k.jenis_komoditi || k.komoditi || '-'}`,
    ...(inv.nama_unit ? [`Unit : ${inv.nama_unit}`] : []),
    ...(inv.no_ba ? [`No. BA : ${inv.no_ba}`] : []),
    `Volume : ${(Number(inv.volume) || 0).toLocaleString('id-ID')} ${satuan}`,
    `Harga Satuan : ${formatCurrency(hargaSatuan)} / ${satuan}`,
    `DPP : ${formatCurrency(dpp)}`,
    `PPN${isPpn ? ` (${ppnPct}%)` : ''} : ${isPpn ? formatCurrency(ppn) : 'Tidak dikenakan'}`,
    `Total Invoice : ${formatCurrency(total)}`,
    '',
    'File invoice terlampir. Terima kasih.',
  ]
  return lines.join('\n')
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice | null
  kontrak: Kontrak | null
  /** Harga satuan invoice (BA untuk kontrak payung, selain itu harga kontrak). */
  hargaSatuan: number
}

export function KirimPajakWaDialog({ open, onOpenChange, invoice, kontrak, hargaSatuan }: Props) {
  const addNotification = useAppStore((s) => s.addNotification)
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')

  const [kontakList, setKontakList] = useState<KontakPajak[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pesan, setPesan] = useState('')
  const [newKontak, setNewKontak] = useState<KontakPajakInput>({ nama: '', no_wa: '' })
  const [submitting, setSubmitting] = useState(false)

  const fetchKontak = async () => {
    try {
      const data = await client.get<KontakPajak[]>('/api/kontak-pajak')
      setKontakList(data)
      setSelectedId((cur) => (cur && data.some((c) => c.id === cur) ? cur : data[0]?.id ?? null))
    } catch {
      addNotification('Gagal memuat kontak pajak', 'error')
    }
  }

  useEffect(() => {
    if (open) void fetchKontak()
  }, [open])

  const selected = useMemo(
    () => kontakList.find((c) => c.id === selectedId) || null,
    [kontakList, selectedId],
  )

  // Susun ulang pesan saat dialog dibuka / kontak berganti
  useEffect(() => {
    if (!open || !invoice || !kontrak) return
    setPesan(buildPesan(selected?.nama || 'Tim Pajak', invoice, kontrak, hargaSatuan))
  }, [open, invoice, kontrak, hargaSatuan, selected])

  const handleKirim = () => {
    if (!selected) {
      addNotification('Pilih kontak pajak terlebih dahulu', 'error')
      return
    }
    const url = `https://wa.me/${selected.no_wa}?text=${encodeURIComponent(pesan)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    onOpenChange(false)
  }

  const handleTambah = async () => {
    if (!newKontak.nama.trim() || !newKontak.no_wa.trim()) {
      addNotification('Nama dan nomor WA wajib diisi', 'error')
      return
    }
    setSubmitting(true)
    try {
      const created = await client.post<KontakPajak>('/api/kontak-pajak', newKontak)
      setNewKontak({ nama: '', no_wa: '' })
      setSelectedId(created.id)
      await fetchKontak()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Gagal menambah kontak', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleHapus = async (id: number) => {
    setSubmitting(true)
    try {
      await client.delete(`/api/kontak-pajak/${id}`)
      await fetchKontak()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Gagal menghapus kontak', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kirim ke Pajak via WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Personil Pajak</Label>
            {kontakList.length > 0 ? (
              <NativeSelect
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value) || null)}
              >
                {kontakList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama} — +{c.no_wa}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <p className="text-sm text-muted-foreground">
                Belum ada kontak pajak.{isAdmin ? ' Tambahkan di bawah.' : ' Minta admin menambahkan kontak.'}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Pesan</Label>
            <Textarea
              value={pesan}
              onChange={(e) => setPesan(e.target.value)}
              className="min-h-[260px] font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              WhatsApp akan terbuka dengan pesan ini. Lampirkan file invoice (Export .docx) secara manual sebelum mengirim.
            </p>
          </div>

          {isAdmin && (
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Kelola Kontak Pajak (admin)</Label>
              {kontakList.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                  <span>{c.nama} — +{c.no_wa}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    title="Hapus kontak"
                    disabled={submitting}
                    onClick={() => handleHapus(c.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  className="h-8"
                  placeholder="Nama"
                  value={newKontak.nama}
                  onChange={(e) => setNewKontak({ ...newKontak, nama: e.target.value })}
                />
                <Input
                  className="h-8"
                  placeholder="No WA (08xx)"
                  value={newKontak.no_wa}
                  onChange={(e) => setNewKontak({ ...newKontak, no_wa: e.target.value })}
                />
                <Button type="button" size="sm" className="h-8 gap-1" disabled={submitting} onClick={handleTambah}>
                  <Plus size={12} /> Tambah
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="button" onClick={handleKirim} disabled={!selected || !invoice} className="gap-2">
            <MessageCircle size={14} /> Buka WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
