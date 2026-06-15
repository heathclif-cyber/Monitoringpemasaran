import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { TrendingUp, Wallet, Box, FileText, AlertTriangle, RefreshCw } from 'lucide-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useAppStore } from '@/store/appStore'
import { StatCard } from '@/components/common/StatCard'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CardSkeleton } from '@/components/common/LoadingSkeleton'
import { formatCurrency, formatNumber, formatNumberDec, formatShortNumber } from '@/lib/utils'
import { calcMonthOverMonthTrend } from '@/lib/trendUtils'

const CHART_COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#047857', '#065f46', '#0d9488', '#14b8a6']
const CHART_PRIMARY = '#059669'
const CHART_SECONDARY = '#10b981'
const CHART_TERTIARY = '#f59e0b'

function StatCards() {
  const data = useDashboardStore((s) => s.data)
  if (!data) return null
  const { summary, charts } = data
  const { bulanan } = charts

  const pendapatanTrend = calcMonthOverMonthTrend(bulanan.pendapatan)
  const cashInTrend = calcMonthOverMonthTrend(bulanan.cashin)
  const volumeTrend = calcMonthOverMonthTrend(
    bulanan.labels.map((_, i) => (bulanan.volume_kg[i] || 0) + (bulanan.volume_butir[i] || 0)),
  )
  const invoiceTrend = calcMonthOverMonthTrend(bulanan.invoice)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Pendapatan (Omset)"
        value={formatCurrency(summary.total_pendapatan)}
        icon={TrendingUp}
        trend={pendapatanTrend}
      />
      <StatCard
        label="Cash In"
        value={formatCurrency(summary.total_cash_in)}
        icon={Wallet}
        trend={cashInTrend}
      />
      <StatCard
        label="Volume Realisasi"
        value={formatNumber(summary.total_volume_all)}
        subtitle={`${formatNumberDec(summary.total_volume_kg)} Kg | ${formatNumberDec(summary.total_volume_butir)} Butir`}
        icon={Box}
        trend={volumeTrend}
      />
      <StatCard
        label="Invoice & DO"
        value={`${summary.total_invoice} / ${summary.total_do}`}
        subtitle="Invoice / DO"
        icon={FileText}
        trend={invoiceTrend}
      />
    </div>
  )
}

function TrendChart() {
  const data = useDashboardStore((s) => s.data)
  if (!data) return null

  const chartData = data.charts.bulanan.labels.map((label, i) => ({
    bulan: label,
    Pendapatan: data.charts.bulanan.pendapatan[i] || 0,
    Invoice: data.charts.bulanan.invoice[i] || 0,
    'Cash In': data.charts.bulanan.cashin[i] || 0,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Tren Bulanan</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatShortNumber(v)} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Pendapatan" stroke={CHART_PRIMARY} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Invoice" stroke={CHART_SECONDARY} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Cash In" stroke={CHART_TERTIARY} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function UnitChart() {
  const data = useDashboardStore((s) => s.data)
  if (!data) return null

  const chartData = data.charts.unit.labels.map((label, i) => ({
    unit: label,
    pendapatan: data.charts.unit.values[i] || 0,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Realisasi per Unit (DO)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatShortNumber(v)} />
            <YAxis type="category" dataKey="unit" tick={{ fontSize: 11 }} width={100} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Bar dataKey="pendapatan" radius={[0, 3, 3, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function VolumeChart() {
  const data = useDashboardStore((s) => s.data)
  if (!data) return null

  const chartData = data.charts.bulanan.labels.map((label, i) => ({
    bulan: label,
    'Volume Kg': data.charts.bulanan.volume_kg[i] || 0,
    'Volume Butir': data.charts.bulanan.volume_butir[i] || 0,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Tren Realisasi Volume (DO)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatShortNumber(v)} />
            <Tooltip formatter={(value: number) => formatNumberDec(value)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Volume Kg" fill="#f97316" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Volume Butir" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function CommodityChart() {
  const data = useDashboardStore((s) => s.data)
  if (!data) return null

  const chartData = data.charts.komoditas.labels
    .map((label, i) => ({
      name: label,
      value: data.charts.komoditas.values[i] || 0,
    }))
    .filter((d) => d.value > 0)

  const total = chartData.reduce((s, d) => s + d.value, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Portofolio Komoditas</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              label={({ name, value }) =>
                total > 0 && value > 0 ? `${name} (${((value / total) * 100).toFixed(0)}%)` : ''
              }
              labelLine={{ strokeWidth: 1 }}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function MonthlyBreakdown() {
  const data = useDashboardStore((s) => s.data)
  if (!data) return null

  const { bulanan } = data.charts
  const rows = bulanan.labels.map((label, i) => {
    const pendapatan = bulanan.pendapatan[i] || 0
    const invoice = bulanan.invoice[i] || 0
    const cashin = bulanan.cashin[i] || 0
    const selisih = invoice - cashin
    return { bulan: label, pendapatan, invoice, cashin, selisih }
  })

  const totals = rows.reduce(
    (acc, r) => ({
      pendapatan: acc.pendapatan + r.pendapatan,
      invoice: acc.invoice + r.invoice,
      cashin: acc.cashin + r.cashin,
      selisih: acc.selisih + r.selisih,
    }),
    { pendapatan: 0, invoice: 0, cashin: 0, selisih: 0 },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Rincian Bulanan</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs font-medium text-muted-foreground">
              <th className="text-left px-4 py-2.5">Bulan</th>
              <th className="text-right px-4 py-2.5">Pendapatan (Omset)</th>
              <th className="text-right px-4 py-2.5">Nilai Invoice</th>
              <th className="text-right px-4 py-2.5">Cash In</th>
              <th className="text-right px-4 py-2.5">Selisih</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.bulan} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2 font-medium text-gray-700">{row.bulan}</td>
                <td className="px-4 py-2 text-right">
                  {row.pendapatan > 0 ? formatCurrency(row.pendapatan) : <span className="text-gray-300">-</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.invoice > 0 ? formatCurrency(row.invoice) : <span className="text-gray-300">-</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.cashin > 0 ? formatCurrency(row.cashin) : <span className="text-gray-300">-</span>}
                </td>
                <td className={`px-4 py-2 text-right font-medium ${row.selisih <= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                  {row.pendapatan > 0 || row.cashin > 0 ? (
                    row.selisih <= 0 ? 'Lunas' : formatCurrency(row.selisih)
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-gray-50 font-semibold">
              <td className="px-4 py-2">TOTAL</td>
              <td className="px-4 py-2 text-right">{formatCurrency(totals.pendapatan)}</td>
              <td className="px-4 py-2 text-right">{formatCurrency(totals.invoice)}</td>
              <td className="px-4 py-2 text-right">{formatCurrency(totals.cashin)}</td>
              <td className="px-4 py-2 text-right">{formatCurrency(totals.selisih)}</td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  )
}

function SapStatus() {
  const data = useDashboardStore((s) => s.data)
  if (!data) return null

  const { sap_stats } = data.summary
  const sap_bulanan = data.charts.sap_bulanan

  const summary = [
    { label: 'Kontrak SAP', value: sap_stats.missing_kontrak },
    { label: 'SO SAP (Inv)', value: sap_stats.missing_so },
    { label: 'DO SAP', value: sap_stats.missing_do },
    { label: 'Billing SAP', value: sap_stats.missing_billing },
  ]

  const rows = (sap_bulanan?.labels ?? []).map((label, i) => ({
    bulan: label,
    monthIndex: i + 1,
    kontrak: sap_bulanan?.missing_kontrak[i] || 0,
    so: sap_bulanan?.missing_so[i] || 0,
    do_: sap_bulanan?.missing_do[i] || 0,
    billing: sap_bulanan?.missing_billing[i] || 0,
  })).filter((r) => {
    const hasData = r.kontrak + r.so + r.do_ + r.billing > 0
    const now = new Date()
    const selYear = data.selected_year || now.getFullYear()
    const isPastOrCurrent = selYear < now.getFullYear() || (selYear === now.getFullYear() && r.monthIndex <= now.getMonth() + 1)
    return hasData || isPastOrCurrent
  }).reverse()

  const MissingBadge = ({ val }: { val: number }) =>
    val > 0 ? (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
        {val}
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 text-xs">
        ✓
      </span>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Status Kelengkapan SAP</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summary.map((item) => (
            <div key={item.label} className="text-center">
              <p className={`text-2xl font-bold ${item.value > 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {rows.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Per bulan · berdasarkan rencana pengambilan</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-medium text-muted-foreground">
                  <th className="text-left px-3 py-2.5">Bulan</th>
                  <th className="text-center px-3 py-2.5">Kontrak SAP</th>
                  <th className="text-center px-3 py-2.5">SO SAP</th>
                  <th className="text-center px-3 py-2.5">DO SAP</th>
                  <th className="text-center px-3 py-2.5">Billing SAP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.bulan} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-medium text-gray-700">{row.bulan}</td>
                    <td className="px-3 py-2 text-center"><MissingBadge val={row.kontrak} /></td>
                    <td className="px-3 py-2 text-center"><MissingBadge val={row.so} /></td>
                    <td className="px-3 py-2 text-center"><MissingBadge val={row.do_} /></td>
                    <td className="px-3 py-2 text-center"><MissingBadge val={row.billing} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { data, filters, isLoading, fetch, setFilters } = useDashboardStore()
  const { availableYears, availableUnits, availableKomoditas, fetchDropdownData } = useAppStore()
  const [fetchError, setFetchError] = useState<string | null>(null)

  const doFetch = async () => {
    setFetchError(null)
    try {
      await fetch()
    } catch {
      setFetchError('Gagal memuat data dashboard')
    }
  }

  useEffect(() => {
    doFetch()
    fetchDropdownData()
  }, [])

  useEffect(() => {
    doFetch()
  }, [filters.year, filters.unit, filters.komoditi])

  return (
    <div className="space-y-6">
      <FilterBar>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">Tahun</Label>
          <FilterSelect
            value={String(filters.year)}
            onChange={(v) => setFilters({ year: Number(v) })}
            options={availableYears.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">Unit</Label>
          <FilterSelect
            value={filters.unit}
            onChange={(v) => setFilters({ unit: v })}
            options={[{ value: 'ALL', label: 'Semua Unit' }, ...availableUnits.map((u) => ({ value: u, label: u }))]}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">Komoditi</Label>
          <FilterSelect
            value={filters.komoditi}
            onChange={(v) => setFilters({ komoditi: v })}
            options={[{ value: 'ALL', label: 'Semua Komoditi' }, ...availableKomoditas.map((k) => ({ value: k, label: k }))]}
          />
        </div>
      </FilterBar>

      {fetchError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle size={40} className="text-rose-400 mb-3" />
            <p className="text-sm font-medium text-slate-700">{fetchError}</p>
            <p className="text-xs text-slate-400 mt-1">Periksa koneksi database atau coba lagi</p>
            <Button variant="outline" size="sm" onClick={doFetch} className="mt-4 gap-2">
              <RefreshCw size={14} /> Coba Lagi
            </Button>
          </CardContent>
        </Card>
      ) : isLoading && !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          <StatCards />
          <SapStatus />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TrendChart />
            <UnitChart />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <VolumeChart />
            <CommodityChart />
          </div>

          <MonthlyBreakdown />
        </>
      ) : null}
    </div>
  )
}
