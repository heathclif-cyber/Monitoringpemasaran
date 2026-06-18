import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Boxes, LayoutGrid, Map, Pencil, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react'
import { StokSaldoHeatmap } from '@/components/feature/StokSaldoHeatmap'
import { useStokStore } from '@/store/stokStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { cn, formatNumber } from '@/lib/utils'
import type { StokLedgerEntry } from '@/types'

const stokSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  unit: z.string().min(1, 'Unit wajib diisi'),
  jenis_material: z.string().min(1, 'Material wajib dipilih'),
  volume: z.coerce.number().positive('Volume harus lebih dari 0'),
  satuan: z.string().min(1),
  catatan: z.string().optional(),
})

type StokFormData = z.infer<typeof stokSchema>

const MATERIAL_OPTIONS = [
  'TBS (TANDAN BUAH SEGAR)',
  'Lump',
  'TH BR CR 3X',
  'TH BR CR 3X HITAM',
  'GULA GAPOKTAN',
  'Gula Kemasan 50 KG Milik PG',
  'KELAPA KUPAS',
  'KELAPA BUTIR',
  'Kopra',
  'SAPI PEJANTAN AFKIR',
  'CPO',
]

export default function StokPage() {
  const { entries, saldos, materials, units, isLoading, fetchAll, createMasuk, updateEntry, deleteEntry, backfillDO } = useStokStore()
  const [syncing, setSyncing] = useState(false)
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [editId, setEditId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StokLedgerEntry | null>(null)
  const [saldoView, setSaldoView] = useState<'grid' | 'heatmap'>('heatmap')

  const materialOptions = useMemo(() => {
    const merged = new Set([...MATERIAL_OPTIONS, ...materials])
    return [...merged].sort()
  }, [materials])

  const form = useForm<StokFormData>({
    resolver: zodResolver(stokSchema),
    defaultValues: {
      tanggal: new Date().toISOString().split('T')[0],
      unit: '',
      jenis_material: '',
      volume: 0,
      satuan: 'Kg',
      catatan: '',
    },
  })

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = form

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const onSubmit = async (data: StokFormData) => {
    try {
      const payload = {
        tanggal: data.tanggal,
        unit: data.unit,
        jenis_material: data.jenis_material,
        volume: data.volume,
        satuan: data.satuan,
        catatan: data.catatan || undefined,
      }
      if (editId) {
        await updateEntry(editId, payload)
        addNotification('Stok berhasil diperbarui', 'success')
      } else {
        await createMasuk(payload)
        addNotification('Stok masuk berhasil dicatat', 'success')
      }
      handleReset()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Gagal menyimpan stok', 'error')
    }
  }

  const handleReset = () => {
    reset({
      tanggal: new Date().toISOString().split('T')[0],
      unit: '',
      jenis_material: '',
      volume: 0,
      satuan: 'Kg',
      catatan: '',
    })
    setEditId(null)
  }

  const startEdit = (entry: StokLedgerEntry) => {
    if (entry.sumber !== 'manual') return
    setEditId(entry.id)
    setValue('tanggal', entry.tanggal)
    setValue('unit', entry.unit)
    setValue('jenis_material', entry.jenis_material)
    setValue('volume', entry.volume)
    setValue('satuan', entry.satuan)
    setValue('catatan', entry.catatan || '')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteEntry(deleteTarget.id)
      addNotification('Entri stok dihapus', 'success')
      if (editId === deleteTarget.id) handleReset()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Gagal menghapus', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_1fr] gap-6 items-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Boxes size={15} className="text-primary" />
              {editId ? 'Edit Stok Masuk' : 'Input Stok Masuk'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
              <div>
                <Label className="text-xs">Tanggal *</Label>
                <Input type="date" {...register('tanggal')} />
                {errors.tanggal && <p className="text-xs text-red-500 mt-1">{errors.tanggal.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Unit *</Label>
                <NativeSelect {...register('unit')}>
                  <option value="">-- Pilih Unit --</option>
                  {units.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </NativeSelect>
                {errors.unit && <p className="text-xs text-red-500 mt-1">{errors.unit.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Jenis Material *</Label>
                <NativeSelect {...register('jenis_material')}>
                  <option value="">-- Pilih Material --</option>
                  {materialOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </NativeSelect>
                {errors.jenis_material && <p className="text-xs text-red-500 mt-1">{errors.jenis_material.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Volume *</Label>
                  <Input type="number" step="any" {...register('volume')} />
                  {errors.volume && <p className="text-xs text-red-500 mt-1">{errors.volume.message}</p>}
                </div>
                <div>
                  <Label className="text-xs">Satuan</Label>
                  <NativeSelect {...register('satuan')}>
                    <option value="Kg">Kg</option>
                    <option value="Butir">Butir</option>
                  </NativeSelect>
                </div>
              </div>
              <div>
                <Label className="text-xs">Catatan</Label>
                <Textarea {...register('catatan')} rows={2} placeholder="Opsional" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting || !canEdit()} className="gap-2">
                  <Save size={14} />
                  {isSubmitting ? 'Menyimpan...' : !canEdit() ? 'Read-Only (Tamu)' : editId ? 'Simpan Perubahan' : 'Simpan Stok'}
                </Button>
                <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                  <RotateCcw size={14} /> Reset
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold">Saldo Saat Ini</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Stok masuk per tanggal input. DO lama otomatis mengurangi stok per tanggal DO.
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                    <Button
                      type="button"
                      variant={saldoView === 'heatmap' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs gap-1 px-2"
                      onClick={() => setSaldoView('heatmap')}
                    >
                      <Map size={12} />
                      Peta
                    </Button>
                    <Button
                      type="button"
                      variant={saldoView === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs gap-1 px-2"
                      onClick={() => setSaldoView('grid')}
                    >
                      <LayoutGrid size={12} />
                      Kartu
                    </Button>
                  </div>
                {canEdit() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    disabled={syncing}
                    onClick={async () => {
                      setSyncing(true)
                      try {
                        const r = await backfillDO()
                        addNotification(
                          r.created > 0
                            ? `Sinkron DO: ${r.created} pengurangan stok ditambahkan`
                            : 'Semua DO sudah tersinkron',
                          'success',
                        )
                      } catch (err: unknown) {
                        addNotification(err instanceof Error ? err.message : 'Sinkron gagal', 'error')
                      } finally {
                        setSyncing(false)
                      }
                    }}
                  >
                    <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                    Sinkron DO
                  </Button>
                )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Memuat...</p>
              ) : saldos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada saldo stok. Input stok masuk terlebih dahulu.</p>
              ) : saldoView === 'heatmap' ? (
                <StokSaldoHeatmap saldos={saldos} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[...saldos]
                    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))
                    .map((s) => (
                    <div
                      key={`${s.unit}-${s.jenis_material}-${s.satuan}`}
                      className="rounded-md border px-3 py-2"
                    >
                      <p className="text-xs text-muted-foreground truncate">{s.unit}</p>
                      <p className="text-sm font-medium truncate">{s.jenis_material}</p>
                      <p className={cn('text-lg font-bold mt-0.5', s.saldo <= 0 ? 'text-red-600' : 'text-emerald-700')}>
                        {formatNumber(s.saldo)} <span className="text-xs font-normal text-muted-foreground">{s.satuan}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Riwayat Stok</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-6 text-center">Belum ada riwayat.</p>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card border-b">
                      <tr className="text-muted-foreground">
                        <th className="text-left py-2 px-3 font-medium">Tanggal</th>
                        <th className="text-left py-2 px-2 font-medium">Unit</th>
                        <th className="text-left py-2 px-2 font-medium hidden md:table-cell">Material</th>
                        <th className="text-right py-2 px-2 font-medium">Volume</th>
                        <th className="text-center py-2 px-2 font-medium">Arah</th>
                        <th className="text-center py-2 pr-3 font-medium w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2 px-3 whitespace-nowrap">{e.tanggal}</td>
                          <td className="py-2 px-2">{e.unit}</td>
                          <td className="py-2 px-2 hidden md:table-cell max-w-[140px] truncate">{e.jenis_material}</td>
                          <td className="py-2 px-2 text-right font-medium">
                            {formatNumber(e.volume)} {e.satuan}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px]',
                                e.arah === 'MASUK'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-amber-200 bg-amber-50 text-amber-800',
                              )}
                            >
                              {e.arah === 'MASUK' ? 'Masuk' : 'Keluar'}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-center">
                            {e.sumber === 'manual' && canEdit() && (
                              <div className="flex justify-center gap-0.5">
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(e)}>
                                  <Pencil size={12} />
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => setDeleteTarget(e)}>
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            )}
                            {e.sumber === 'do' && (
                              <span className="text-[10px] text-muted-foreground">{e.referensi_id}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus entri stok?"
        description={`Hapus stok masuk ${deleteTarget?.unit} / ${deleteTarget?.jenis_material} pada ${deleteTarget?.tanggal}?`}
        onConfirm={handleDelete}
      />
    </div>
  )
}