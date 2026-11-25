import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { LineChart as LineChartIcon, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { useHargaStore } from '@/store/hargaStore'
import type { HargaBulananSeries } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { EmptyState } from '@/components/common/EmptyState'
import { CardSkeleton } from '@/components/common/LoadingSkeleton'
import {
  FilterToolbar,
  ListPanel,
  PageHeader,
  PageShell,
  StatPills,
  StatusPill,
} from '@/components/patterns'
import type { StatPillItem } from '@/components/patterns'
import { cn, formatCurrency, formatDate, formatNumberDec } from '@/lib/utils'

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]
const DASHES = ['', '6 3', '2 3']

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y.slice(2)}`
}

function seriesLabel(s: HargaBulananSeries): string {
  return `${s.material} (${s.satuan})`
}

function pctChange(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null
  return ((curr - prev) / prev) * 100
}

function formatPct(v: number | null): string {
  if (v == null) return '-'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
}

function ChangeText({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">-</span>
  const up = value > 0
  const flat = Math.abs(value) < 0.05
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 tabular-nums',
        flat ? 'text-muted-foreground' : up ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
      )}
    >
      {!flat && (up ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
      {formatPct(value)}
    </span>
  )
}

interface MaterialSummary {
  series: HargaBulananSeries
  last: number | null
  lastMonth: string | null
  prev: number | null
  change: number | null
  min: number | null
  max: number | null
  avg: number | null
  volume: number
  count: number
}

function summarize(s: HargaBulananSeries): MaterialSummary {
  const filled = s.points.filter((p) => p.harga_rata != null)
  const last = filled[filled.length - 1]
  const prev = filled[filled.length - 2]
  const volume = filled.reduce((a, p) => a + p.volume, 0)
  const weighted = filled.reduce((a, p) => a + (p.harga_rata ?? 0) * p.volume, 0)
  const simple = filled.reduce((a, p) => a + (p.harga_rata ?? 0), 0)
  return {
    series: s,
    last: last?.harga_rata ?? null,
    lastMonth: last?.bulan ?? null,
    prev: prev?.harga_rata ?? null,
    change: pctChange(last?.harga_rata, prev?.harga_rata),
    min: filled.length ? Math.min(...filled.map((p) => p.harga_min ?? Infinity)) : null,
    max: filled.length ? Math.max(...filled.map((p) => p.harga_max ?? -Infinity)) : null,
    avg: filled.length ? (volume > 0 ? weighted / volume : simple / filled.length) : null,
    volume,
    count: filled.reduce((a, p) => a + p.jumlah_transaksi, 0),
  }
}

export default function HargaPage() {
  const { data, isLoading, error, fetchHarga } = useHargaStore()
  const [periode, setPeriode] = useState(12)
  const [komoditi, setKomoditi] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [trxMaterial, setTrxMaterial] = useState('')

  useEffect(() => {
    fetchHarga(periode)
  }, [periode, fetchHarga])

  const komoditiList = useMemo(
    () => Array.from(new Set((data?.series ?? []).map((s) => s.komoditi))).sort(),
    [data],
  )

  useEffect(() => {
    if (komoditiList.length && !komoditiList.includes(komoditi)) setKomoditi(komoditiList[0])
  }, [komoditiList, komoditi])

  useEffect(() => {
    setHidden(new Set())
    setTrxMaterial('')
  }, [komoditi])

  const seriesInKomoditi = useMemo(
    () => (data?.series ?? []).filter((s) => s.komoditi === komoditi),
    [data, komoditi],
  )
  const visibleSeries = seriesInKomoditi.filter((s) => !hidden.has(s.key))
  const summaries = useMemo(() => seriesInKomoditi.map(summarize), [seriesInKomoditi])

  const chartData = useMemo(() => {
    const months = data?.months ?? []
    return months.map((m, i) => {
      const row: Record<string, string | number | null> = { bulan: m, label: monthLabel(m) }
      for (const s of seriesInKomoditi) row[s.key] = s.points[i]?.harga_rata ?? null
      return row
    })
  }, [data, seriesInKomoditi])

  const transaksi = useMemo(
    () =>
      (data?.transaksi ?? []).filter(
        (t) =>
          t.komoditi === komoditi &&
          (!trxMaterial || `${t.komoditi}|${t.material}|${t.satuan}` === trxMaterial),
      ),
    [data, komoditi, trxMaterial],
  )

  const pills: StatPillItem[] = useMemo(() => {
    const withChange = summaries.filter((s) => s.change != null)
    const naik = withChange.filter((s) => (s.change ?? 0) > 0.05).length
    const turun = withChange.filter((s) => (s.change ?? 0) < -0.05).length
    return [
      { label: 'Material', value: seriesInKomoditi.length },
      { label: 'Transaksi', value: summaries.reduce((a, s) => a + s.count, 0) },
      { label: 'Naik', value: naik, tone: naik ? 'success' : 'default' },
      { label: 'Turun', value: turun, tone: turun ? 'danger' : 'default' },
    ]
  }, [summaries, seriesInKomoditi.length])

  const colorOf = (key: string) => {
    const idx = seriesInKomoditi.findIndex((s) => s.key === key)
    return {
      stroke: CHART_COLORS[idx % CHART_COLORS.length],
      dash: DASHES[Math.floor(idx / CHART_COLORS.length) % DASHES.length],
    }
  }

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const months = data?.months ?? []
  const hasData = (data?.series.length ?? 0) > 0

  return (
    <PageShell width="wide">
      <PageHeader
        title="Tren Harga Komoditi"
        description="Harga satuan rata-rata (tertimbang volume, excl. PPN & premi) per bulan dari kontrak dan BA payung."
        actions={
          <Button variant="outline" size="sm" onClick={() => fetchHarga(periode)} disabled={isLoading}>
            <RefreshCw size={14} className={cn('mr-1.5', isLoading && 'animate-spin')} /> Muat ulang
          </Button>
        }
      />

      <FilterToolbar end={hasData ? <StatPills items={pills} /> : null}>
        <div className="flex items-center gap-2">
          <Label htmlFor="harga-komoditi" className="text-xs text-muted-foreground">Komoditi</Label>
          <NativeSelect
            id="harga-komoditi"
            className="w-44"
            value={komoditi}
            onChange={(e) => setKomoditi(e.target.value)}
            disabled={!komoditiList.length}
          >
            {komoditiList.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="harga-periode" className="text-xs text-muted-foreground">Periode</Label>
          <NativeSelect
            id="harga-periode"
            className="w-40"
            value={periode}
            onChange={(e) => setPeriode(Number(e.target.value))}
          >
            <option value={6}>6 bulan terakhir</option>
            <option value={12}>12 bulan terakhir</option>
            <option value={24}>24 bulan terakhir</option>
          </NativeSelect>
        </div>
      </FilterToolbar>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {isLoading && !data ? (
        <CardSkeleton />
      ) : !hasData ? (
        <Card>
          <EmptyState
            icon={LineChartIcon}
            title="Belum ada data harga"
            description="Belum ada kontrak atau BA dengan harga satuan dalam periode ini."
          />
        </Card>
      ) : (
        <>
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Harga rata-rata per bulan — {komoditi}
              </CardTitle>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {seriesInKomoditi.map((s) => {
                  const { stroke } = colorOf(s.key)
                  const off = hidden.has(s.key)
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggleSeries(s.key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-opacity',
                        off ? 'opacity-40' : 'bg-muted/50',
                      )}
                      title={off ? 'Tampilkan' : 'Sembunyikan'}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: stroke }} />
                      {seriesLabel(s)}
                    </button>
                  )
                })}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(v: number) => v.toLocaleString('id-ID', { notation: 'compact' })}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {visibleSeries.map((s) => {
                    const { stroke, dash } = colorOf(s.key)
                    return (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={seriesLabel(s)}
                        stroke={stroke}
                        strokeDasharray={dash}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
              <p className="pt-1 text-[11px] text-muted-foreground">
                Garis menyambung antar bulan yang punya transaksi; bulan tanpa transaksi tidak memiliki titik.
                Klik nama material di atas untuk menyembunyikan/menampilkan.
              </p>
            </CardContent>
          </Card>

          <ListPanel
            header={
              <div className="border-b px-4 py-2.5 text-sm font-semibold">Ringkasan per material</div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Material</th>
                    <th className="px-3 py-2 text-right font-medium">Harga terakhir</th>
                    <th className="px-3 py-2 text-right font-medium">vs sebelumnya</th>
                    <th className="px-3 py-2 text-right font-medium">Rata-rata</th>
                    <th className="px-3 py-2 text-right font-medium">Terendah</th>
                    <th className="px-3 py-2 text-right font-medium">Tertinggi</th>
                    <th className="px-3 py-2 text-right font-medium">Volume</th>
                    <th className="px-3 py-2 text-right font-medium">Transaksi</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((m) => (
                    <tr key={m.series.key} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(m.series.key).stroke }} />
                          {seriesLabel(m.series)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(m.last)}
                        {m.lastMonth && (
                          <span className="ml-1 text-muted-foreground">({monthLabel(m.lastMonth)})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right"><ChangeText value={m.change} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.avg)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.min)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.max)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumberDec(m.volume)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ListPanel>

          <ListPanel
            header={
              <div className="border-b px-4 py-2.5 text-sm font-semibold">
                Harga rata-rata bulanan &amp; perubahan antar bulan
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 bg-muted px-3 py-2 text-left font-medium">Material</th>
                    {months.map((m) => (
                      <th key={m} className="whitespace-nowrap px-3 py-2 text-right font-medium">{monthLabel(m)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seriesInKomoditi.map((s) => {
                    let prev: number | null = null
                    return (
                      <tr key={s.key} className="border-t">
                        <td className="sticky left-0 whitespace-nowrap bg-card px-3 py-2">{seriesLabel(s)}</td>
                        {s.points.map((p) => {
                          const change = pctChange(p.harga_rata, prev)
                          if (p.harga_rata != null) prev = p.harga_rata
                          return (
                            <td key={p.bulan} className="whitespace-nowrap px-3 py-2 text-right align-top">
                              {p.harga_rata == null ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <div
                                  title={`${p.jumlah_transaksi} transaksi · min ${formatCurrency(p.harga_min)} · maks ${formatCurrency(p.harga_max)}`}
                                >
                                  <div className="tabular-nums">{formatCurrency(p.harga_rata)}</div>
                                  <div className="text-[10px]"><ChangeText value={change} /></div>
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </ListPanel>

          <ListPanel
            empty={!transaksi.length}
            emptyTitle="Tidak ada transaksi"
            header={
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                <span className="text-sm font-semibold">Rincian transaksi ({transaksi.length})</span>
                <NativeSelect
                  className="h-8 w-60 text-xs"
                  value={trxMaterial}
                  onChange={(e) => setTrxMaterial(e.target.value)}
                  aria-label="Filter material"
                >
                  <option value="">Semua material</option>
                  {seriesInKomoditi.map((s) => (
                    <option key={s.key} value={s.key}>{seriesLabel(s)}</option>
                  ))}
                </NativeSelect>
              </div>
            }
          >
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Tanggal</th>
                    <th className="px-3 py-2 text-left font-medium">Material</th>
                    <th className="px-3 py-2 text-left font-medium">Sumber</th>
                    <th className="px-3 py-2 text-left font-medium">Referensi</th>
                    <th className="px-3 py-2 text-left font-medium">Pembeli</th>
                    <th className="px-3 py-2 text-right font-medium">Volume</th>
                    <th className="px-3 py-2 text-right font-medium">Harga satuan</th>
                  </tr>
                </thead>
                <tbody>
                  {transaksi.map((t) => (
                    <tr key={`${t.sumber}-${t.referensi}`} className="border-t">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(t.tanggal)}</td>
                      <td className="px-3 py-2">{t.material} ({t.satuan})</td>
                      <td className="px-3 py-2">
                        <StatusPill tone={t.sumber === 'BA' ? 'warning' : 'neutral'} icon={false}>{t.sumber}</StatusPill>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {t.referensi}
                        {t.sumber === 'BA' && (
                          <div className="text-muted-foreground">{t.no_kontrak}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{t.pembeli || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumberDec(t.volume)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(t.harga_satuan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ListPanel>
        </>
      )}
    </PageShell>
  )
}
