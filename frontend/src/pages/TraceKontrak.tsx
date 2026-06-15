import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Package,
  Banknote,
  Truck,
  Receipt,
  Calendar,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { formatCurrency, formatDate, safe } from '@/lib/utils'
import { client } from '@/lib/client'
import type { KontrakTrace, TraceInvoice, PaymentStatus } from '@/types'

// ── helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: PaymentStatus) {
  if (s === 'LUNAS') return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
  if (s === 'SEBAGIAN') return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
  return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusColor(status)}`}>
      {status}
    </span>
  )
}

function ProgressBar({ pct, color = 'bg-emerald-500' }: { pct: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div
        className={`${color} h-2 rounded-full transition-all duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function TraceKontrak() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const noKontrak = params.get('id') || ''

  const [data, setData] = useState<KontrakTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allOpen, setAllOpen] = useState(false)

  useEffect(() => {
    if (!noKontrak) { setError('No kontrak tidak ditemukan'); setLoading(false); return }
    setLoading(true)
    client
      .get<KontrakTrace>(`/api/kontrak/trace?no_kontrak=${encodeURIComponent(noKontrak)}`)
      .then((res) => { setData(res); setLoading(false) })
      .catch(() => { setError('Gagal memuat data trace kontrak'); setLoading(false) })
  }, [noKontrak])

  if (loading) return (
    <div className="space-y-4 max-w-4xl">
      <LoadingSkeleton rows={6} />
    </div>
  )

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
      <AlertCircle size={32} className="text-red-400" />
      <p>{error || 'Data tidak ditemukan'}</p>
      <Button variant="secondary" onClick={() => navigate('/repo/kontrak')}>Kembali</Button>
    </div>
  )

  const { summary, invoices } = data
  const satuan = data.satuan || 'Kg'

  return (
    <div className="space-y-5">
      {/* breadcrumb / back */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-gray-500 hover:text-gray-800 -ml-2"
          onClick={() => navigate('/repo/kontrak')}
        >
          <ArrowLeft size={15} />
          Repositori Kontrak
        </Button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-700 truncate">{data.no_kontrak}</span>
      </div>

      {/* header card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-gray-800">{data.no_kontrak}</h2>
                <StatusBadge status={summary.overall_status} />
              </div>
              <div className="text-sm text-gray-600 font-medium">{(data.pembeli || '-').split('\n')[0]}</div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Package size={12} />
                  {safe(data.komoditi)}
                </span>
                {data.kebun_produsen && (
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    {data.kebun_produsen}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {formatDate(data.tanggal_kontrak)}
                </span>
                {data.jatuh_tempo_pembayaran && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Calendar size={12} />
                    Jatuh tempo: {formatDate(data.jatuh_tempo_pembayaran)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Nilai Kontrak</div>
              <div className="text-lg font-bold text-gray-800">{formatCurrency(data.nilai_transaksi)}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {data.volume.toLocaleString('id-ID')} {satuan}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* summary progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* pembayaran */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-gray-700">
              <Banknote size={15} className="text-emerald-600" />
              Progress Pembayaran
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <ProgressBar
              pct={summary.persen_terbayar}
              color={summary.overall_status === 'LUNAS' ? 'bg-emerald-500' : summary.overall_status === 'SEBAGIAN' ? 'bg-amber-400' : 'bg-red-400'}
            />
            <div className="flex justify-between text-xs">
              <div>
                <div className="text-gray-400">Terbayar</div>
                <div className="font-semibold text-emerald-700">{formatCurrency(summary.total_terbayar)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400">Progress</div>
                <div className="font-bold text-lg text-gray-700">{summary.persen_terbayar.toFixed(1)}%</div>
              </div>
              <div className="text-right">
                <div className="text-gray-400">Sisa</div>
                <div className={`font-semibold ${summary.sisa_pembayaran > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatCurrency(Math.max(0, summary.sisa_pembayaran))}
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-400 pt-1 border-t">
              {summary.jumlah_invoice} invoice · {summary.jumlah_do} delivery order
            </div>
          </CardContent>
        </Card>

        {/* volume */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-gray-700">
              <Truck size={15} className="text-sky-600" />
              Progress Volume Barang
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <ProgressBar
              pct={summary.persen_volume}
              color={summary.persen_volume >= 100 ? 'bg-sky-500' : summary.persen_volume > 0 ? 'bg-sky-400' : 'bg-gray-300'}
            />
            <div className="flex justify-between text-xs">
              <div>
                <div className="text-gray-400">Diambil</div>
                <div className="font-semibold text-sky-700">
                  {summary.total_volume_do.toLocaleString('id-ID')} {satuan}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-400">Progress</div>
                <div className="font-bold text-lg text-gray-700">{summary.persen_volume.toFixed(1)}%</div>
              </div>
              <div className="text-right">
                <div className="text-gray-400">Sisa</div>
                <div className={`font-semibold ${summary.sisa_volume > 0 ? 'text-orange-600' : 'text-sky-600'}`}>
                  {Math.max(0, summary.sisa_volume).toLocaleString('id-ID')} {satuan}
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-400 pt-1 border-t">
              Total kontrak: {summary.total_volume.toLocaleString('id-ID')} {satuan}
            </div>
          </CardContent>
        </Card>

        {/* ringkasan */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-gray-700">
              <Receipt size={15} className="text-indigo-500" />
              Ringkasan Transaksi
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-gray-500">Status Keseluruhan</span>
                <StatusBadge status={summary.overall_status} />
              </div>
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-gray-500">Jumlah Invoice</span>
                <span className="font-semibold">{summary.jumlah_invoice}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-gray-500">Jumlah DO</span>
                <span className="font-semibold">{summary.jumlah_do}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-gray-500">Total Terbayar</span>
                <span className="font-semibold text-emerald-700">{formatCurrency(summary.total_terbayar)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-gray-500">Sisa Kewajiban</span>
                <span className={`font-semibold ${summary.sisa_pembayaran > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatCurrency(Math.max(0, summary.sisa_pembayaran))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* invoice list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-gray-700">
            Daftar Invoice & Delivery Order
          </h3>
          {invoices.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-gray-500 gap-1"
              onClick={() => setAllOpen(!allOpen)}
            >
              <ChevronDown size={13} className={`transition-transform ${allOpen ? 'rotate-180' : ''}`} />
              {allOpen ? 'Tutup semua' : 'Buka semua'}
            </Button>
          )}
        </div>

        {invoices.length === 0 ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-2 text-gray-400">
              <Receipt size={28} />
              <p className="text-sm">Belum ada invoice untuk kontrak ini</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <InvoiceExpandable key={inv.no_invoice} inv={inv} satuan={satuan} forceOpen={allOpen} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// wrapper agar forceOpen bekerja sebagai controlled toggle
function InvoiceExpandable({
  inv,
  satuan,
  forceOpen,
}: {
  inv: TraceInvoice
  satuan: string
  forceOpen: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(forceOpen)
  }, [forceOpen])

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/60 transition-colors"
      >
        <span className={`transition-transform duration-200 text-gray-400 shrink-0 ${open ? 'rotate-90' : ''}`}>
          <ChevronRight size={15} />
        </span>

        <Receipt size={15} className="text-indigo-500 shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">{inv.no_invoice}</span>
            {inv.nama_unit && (
              <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {inv.nama_unit}
              </span>
            )}
            <StatusBadge status={inv.payment_status} />
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {formatDate(inv.tanggal_transaksi)} · Kewajiban {formatCurrency(inv.kewajiban)}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xs font-semibold text-gray-700">
            {formatCurrency(inv.total_terbayar)}{' '}
            <span className="font-normal text-gray-400">/ {formatCurrency(inv.kewajiban)}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {inv.persen_terbayar.toFixed(1)}% terbayar · {inv.jumlah_do} DO
          </div>
        </div>
      </button>

      {/* progress bar */}
      <div className="px-4 pb-2">
        <ProgressBar
          pct={inv.persen_terbayar}
          color={
            inv.payment_status === 'LUNAS'
              ? 'bg-emerald-500'
              : inv.payment_status === 'SEBAGIAN'
              ? 'bg-amber-400'
              : 'bg-red-400'
          }
        />
      </div>

      {/* DO list */}
      {open && (
        <div className="border-t bg-gray-50/60">
          {inv.delivery_orders.length === 0 ? (
            <div className="flex items-center gap-2 px-6 py-4 text-sm text-gray-400">
              <AlertCircle size={14} />
              Belum ada Delivery Order untuk invoice ini
            </div>
          ) : (
            <div className="divide-y">
              {inv.delivery_orders.map((do_) => (
                <div key={do_.no_do} className="px-6 py-3 flex flex-wrap gap-4 text-sm">
                  <div className="min-w-[140px]">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-700">
                      <Truck size={13} className="text-sky-500 shrink-0" />
                      {do_.no_do}
                    </div>
                    {do_.kepada_unit && (
                      <div className="text-xs text-gray-500 mt-0.5">{do_.kepada_unit}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 flex-1">
                    <div>
                      <div className="text-xs text-gray-400">Tgl DO</div>
                      <div className="text-xs font-medium">{formatDate(do_.tanggal_do) || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Tgl Transfer</div>
                      <div
                        className={`text-xs font-medium ${
                          do_.tanggal_pembayaran ? 'text-emerald-700' : 'text-red-500'
                        }`}
                      >
                        {do_.tanggal_pembayaran ? formatDate(do_.tanggal_pembayaran) : 'Belum transfer'}
                      </div>
                    </div>
                    {do_.rencana_pengambilan && (
                      <div>
                        <div className="text-xs text-gray-400">Rencana Ambil</div>
                        <div className="text-xs font-medium">{formatDate(do_.rencana_pengambilan)}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-gray-400">Nominal Transfer</div>
                      <div className="text-xs font-semibold">{formatCurrency(do_.nominal_transfer)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Volume</div>
                      <div className="text-xs font-semibold">
                        {do_.volume_do.toLocaleString('id-ID')} {satuan}
                      </div>
                    </div>
                    {do_.selisih > 0 && (
                      <div>
                        <div className="text-xs text-gray-400">Selisih</div>
                        <div className="text-xs font-medium text-amber-600">
                          {formatCurrency(do_.selisih)}
                        </div>
                      </div>
                    )}
                    {do_.is_pph_disetor === 'true' && (
                      <div className="self-end">
                        <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full">
                          PPh Disetor
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
