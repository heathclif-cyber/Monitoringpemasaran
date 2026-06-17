import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, RotateCcw, Zap } from 'lucide-react'
import { useLaporanStore } from '@/store/laporanStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const bypassSchema = z.object({
  unit: z.string().min(1, 'Unit wajib diisi'),
  komoditi: z.string().min(1, 'Komoditi wajib diisi'),
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  volume: z.coerce.number().min(0),
  satuan: z.string().optional(),
  nominal: z.coerce.number().min(0),
  pembeli: z.string().min(1, 'Pembeli wajib diisi'),
  deskripsi: z.string().optional(),
})

type BypassFormData = z.infer<typeof bypassSchema>

export default function BypassPage() {
  const { createBypass } = useLaporanStore()
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [editId, setEditId] = useState<number | null>(null)

  const form = useForm<BypassFormData>({
    resolver: zodResolver(bypassSchema),
    defaultValues: {
      unit: '',
      komoditi: '',
      tanggal: new Date().toISOString().split('T')[0],
      volume: 0,
      satuan: 'Kg',
      nominal: 0,
      pembeli: '',
      deskripsi: '',
    },
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = form

  const onSubmit = async (data: BypassFormData) => {
    try {
      const payload: any = {
        Unit: data.unit,
        Komoditi: data.komoditi,
        Tanggal: data.tanggal,
        Volume: data.volume,
        Satuan: data.satuan || 'Kg',
        Nominal: data.nominal,
        Pembeli: data.pembeli,
        Deskripsi: data.deskripsi || '',
      }
      if (editId) {
        await useLaporanStore.getState().updateBypass(editId, payload)
        addNotification('Bypass berhasil diupdate', 'success')
      } else {
        await createBypass(payload)
        addNotification('Bypass berhasil dibuat', 'success')
      }
      handleReset()
    } catch (err: any) {
      addNotification(err.message || 'Gagal menyimpan bypass', 'error')
    }
  }

  const handleReset = () => {
    reset()
    setEditId(null)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Informasi Dasar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap size={15} className="text-brand-600" />
                Informasi Dasar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Unit *</Label>
                <NativeSelect {...register('unit')}>
                  <option value="">-- Pilih Unit --</option>
                  <option value="Minahasa-Halmahera">Minahasa-Halmahera</option>
                  <option value="Awaya-Telpaputih">Awaya-Telpaputih</option>
                  <option value="Beteleme">Beteleme</option>
                  <option value="Kabaru">Kabaru</option>
                  <option value="Takalar">Takalar</option>
                  <option value="Camming">Camming</option>
                </NativeSelect>
                {errors.unit && <p className="text-xs text-red-500 mt-1">{errors.unit.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Komoditi *</Label>
                <Input {...register('komoditi')} />
                {errors.komoditi && <p className="text-xs text-red-500 mt-1">{errors.komoditi.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Tanggal *</Label>
                <Input type="date" {...register('tanggal')} />
              </div>
            </CardContent>
          </Card>

          {/* Right: Detail Transaksi */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Detail Transaksi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Volume *</Label>
                  <Input type="number" step="any" {...register('volume')} />
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
                <Label className="text-xs">Nominal *</Label>
                <Input type="number" step="any" {...register('nominal')} />
              </div>
              <div>
                <Label className="text-xs">Pembeli *</Label>
                <Input {...register('pembeli')} />
                {errors.pembeli && <p className="text-xs text-red-500 mt-1">{errors.pembeli.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Deskripsi</Label>
                <Textarea {...register('deskripsi')} rows={2} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting || !canEdit()} className="gap-2">
            <Save size={14} />
            {isSubmitting ? 'Menyimpan...' : !canEdit() ? 'Read-Only (Tamu)' : editId ? 'Simpan Perubahan' : 'Simpan Data'}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw size={14} /> Reset
          </Button>
        </div>
      </form>
    </div>
  )
}
