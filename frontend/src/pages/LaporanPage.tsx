import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RefreshCw,
  Download,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Package,
  BarChart3,
  Scale,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react'
import {
  useLaporanStore,
  canSaveSapFields,
  isInvoiceOnlySapRow,
  laporanRowKey,
} from '@/store/laporanStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { LaporanRincianTable } from '@/components/feature/LaporanRincianTable'
import { SapReconciliationDialog } from '@/components/feature/SapReconciliationDialog'
import { InvoiceOutstanding } from '@/components/feature/InvoiceOutstanding'
import { client } from '@/lib/client'
import type { PiutangRow, PiutangResponse } from '@/types'
import { StatCard } from '@/components/common/StatCard'
import { SearchInput } from '@/components/common/SearchInput'
import { MultiSelectFilter } from '@/components/common/MultiSelectFilter'
import { FilterSelect } from '@/components/common/FilterBar'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { FilterToolbar, PageHeader, PageShell } from '@/components/patterns'
import { normalizeSatuan } from '@/utils/satuanUtils'
import { invoiceTaxEstimate, pphEvidenceLabel } from '@/utils/sapReconciliation'
import {
  filterLaporanRows,
  buildLaporanRekap,
  groupLaporanByInvoice,
  mergeInvoiceGroup,
  rekapAveragePrice,
  createDefaultLaporanFilters,
  createInitialLaporanFilters,
  extractPeriodKeys,
  getInitialLaporanYearKey,
  MONTH_OPTIONS,
  MONTH_LABELS,
  type LaporanFilters,
} from '@/utils/laporanUtils'
import { formatCurrency, formatNumber, formatDate, safe, cn } from '@/lib/utils'
import type { LaporanRow } from '@/types'
import { exportLaporanHO } from '@/utils/laporanHoExport'

/** Kepadatan seimbang — antara padat & lega, nominal penuh tanpa ellipsis */
const TH = 'px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap'
const TD = 'px-3 py-2 text-[13px] align-middle leading-normal'
const TD_MONEY = 'px-3 py-2 text-[13px] text-right whitespace-nowrap tabular-nums min-w-[10.5rem] align-middle'
const TD_INPUT = 'w-full min-w-[6.5rem] h-8 text-[13px] border border-border/60 hover:border-border rounded-md px-2.5 py-1.5 bg-background text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30'

/** Kolom identitas dibekukan saat scroll horizontal (Kontrak + Unit + Mitra Pembeli — No. DO & No. Invoice ikut scroll biasa) */
const FROZEN_W_DO = 'w-[12rem] min-w-[12rem] max-w-[12rem]'
const W_INV = 'w-[11rem] min-w-[11rem] max-w-[11rem]'
const FROZEN_W_KONTRAK = 'w-[13rem] min-w-[13rem] max-w-[13rem]'
const FROZEN_W_UNIT = 'w-[9rem] min-w-[9rem] max-w-[9rem]'
const FROZEN_W_MITRA = 'w-[11rem] min-w-[11rem] max-w-[11rem]'
const STICKY_LEFT_KONTRAK = 'left-0'
const STICKY_LEFT_UNIT = 'left-[13rem]'
const STICKY_LEFT_MITRA = 'left-[22rem]'
const STICKY_SHADOW = 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]'
const STICKY_TH = 'sticky top-0 z-30 bg-muted border-b border-border'
const STICKY_TH_FROZEN = 'sticky top-0 z-40 bg-muted border-b border-border'
const STICKY_TD = 'sticky z-20 bg-card'

function volumeLabel(kg: number, ea: number): string {
  if (kg <= 0 && ea <= 0) return '0 Kg'
  return [kg > 0 && `${formatNumber(Math.round(kg))} Kg`, ea > 0 && `${formatNumber(Math.round(ea))} EA`].filter(Boolean).join(' + ')
}

export default function LaporanPage() {
  const { rows, isLoading, fetch, patchRow, updateSapField, deleteBypass } = useLaporanStore()
  const { addNotification } = useAppStore()
  const [filters, setFilters] = useState<LaporanFilters>(createInitialLaporanFilters)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [isExportingHo, setIsExportingHo] = useState(false)
  const [showFullTable, setShowFullTable] = useState(false)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [sapReconciliationOpen, setSapReconciliationOpen] = useState(false)
  const [balances, setBalances] = useState<PiutangRow[] | null>(null)
  const [balanceError, setBalanceError] = useState(false)
  const detailRow = rows.find((row) => (row.Row_ID || JSON.stringify(laporanRowKey(row))) === detailKey)

  useEffect(() => { fetch() }, [])
  useEffect(() => {
    let active = true
    setBalances(null); setBalanceError(false)
    client.get<PiutangResponse>('/api/piutang').then((data) => {
      if (active) setBalances(data.rows)
    }).catch(() => { if (active) setBalanceError(true) })
    return () => { active = false }
  }, [rows])

  const units = useMemo(() => [...new Set(rows.map((r) => r.Unit).filter(Boolean))].sort(), [rows])
  const pembelis = useMemo(() => [...new Set(rows.map((r) => r.Mitra_Pembeli).filter(Boolean))].sort(), [rows])
  const komoditas = useMemo(() => [...new Set(rows.map((r) => r.Komoditi).filter(Boolean))].sort(), [rows])
  const jenisKomoditas = useMemo(() => [...new Set(rows.map((r) => r.Deskripsi_Produk).filter(Boolean))].sort(), [rows])
  const years = useMemo(() => {
    const set = new Set<string>([getInitialLaporanYearKey()])
    for (const row of rows) {
      const { year } = extractPeriodKeys(row, filters.modeTanggal)
      if (year) set.add(year)
    }
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [rows, filters.modeTanggal])

  const filtered = useMemo(() => filterLaporanRows(rows, filters), [rows, filters])
  const rekap = useMemo(() => buildLaporanRekap(filtered, 'komoditi', balances), [filtered, balances])
  const total = rekap.total
  const averagePrice = rekapAveragePrice(total)

  /** Penjualan tanpa tanggal (DO belum ada rencana/BA) tidak masuk filter periode */
  const undatedSales = useMemo(() => {
    if (!filters.year && filters.months.length === 0) return 0
    return filterLaporanRows(rows, { ...filters, year: '', months: [] })
      .filter((row) => !row.Report_Date && (row.Pendapatan_Pokok || 0) > 0).length
  }, [rows, filters])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const dateA = a.Report_Date || a.Raw_Date || ''
      const dateB = b.Report_Date || b.Raw_Date || ''
      return filters.sort === 'DESC' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB)
    })
    return arr
  }, [filtered, filters.sort])

  const invoiceGroups = useMemo(() => groupLaporanByInvoice(filtered, filters.sort), [filtered, filters.sort])

  const mergedRows = useMemo(() => invoiceGroups.map(mergeInvoiceGroup), [invoiceGroups])

  const periodLabel = useMemo(() => {
    if (!filters.year && filters.months.length === 0) return 'Semua periode'

    let monthPart = 'semua bulan'
    if (filters.months.length === 1) monthPart = MONTH_LABELS[filters.months[0]] || filters.months[0]
    else if (filters.months.length === 2) {
      monthPart = filters.months.map((m) => MONTH_LABELS[m] || m).join(' & ')
    } else if (filters.months.length > 2) {
      monthPart = `${filters.months.length} bulan terpilih`
    }

    if (filters.year) return `${monthPart} ${filters.year}`
    return monthPart
  }, [filters.year, filters.months])

  const advancedFilterCount = [
    filters.jenisKomoditi.length > 0,
    filters.tipe !== 'ALL',
    filters.sap !== 'ALL',
    filters.statusBayar !== 'ALL',
  ].filter(Boolean).length

  const handleSapSave = async (row: LaporanRow, field: string, value: string) => {
    if (!canSaveSapFields(row)) {
      addNotification('Belum ada invoice — nomor SAP tidak bisa disimpan', 'error')
      return
    }
    try {
      await updateSapField(laporanRowKey(row), field, value)
      patchRow(laporanRowKey(row), { [field]: value } as Partial<LaporanRow>)
      addNotification(`${field} tersimpan`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan'
      addNotification(msg, 'error')
    }
  }

  const handleDeleteBypass = async () => {
    if (deleteId == null) return
    try {
      await deleteBypass(deleteId)
      addNotification('Bypass dihapus', 'success')
    } catch {
      addNotification('Gagal menghapus', 'error')
    }
    setDeleteTarget(null)
    setDeleteId(null)
  }

  const handleExportExcel = async () => {
    const { exportLaporanExcel } = await import('@/utils/laporanExport')
    exportLaporanExcel(
      mergedRows,
      `Laporan_Digital_${periodLabel.replace(/\s+/g, '_')}.xlsx`,
    )
  }

  const handleExportHO = async () => {
    setIsExportingHo(true)
    try {
      const result = await exportLaporanHO(filterLaporanRows(rows, { ...filters, year: '', months: [] }), {
        year: filters.year,
        months: filters.months,
        modeTanggal: filters.modeTanggal,
        filters: {
          ...filters,
          units: filters.unit,
          komoditis: filters.komoditi,
        },
      })
      if (!result.ok) {
        addNotification(result.message, 'error')
        return
      }
      addNotification('Export format HO berhasil', 'success')
    } catch {
      addNotification('Gagal export format HO', 'error')
    } finally {
      setIsExportingHo(false)
    }
  }

  const handleResetFilters = () => setFilters(createDefaultLaporanFilters())
  const hoReady = !!filters.year && filters.months.length > 0

  return (
    <PageShell width="full" density="compact">
      <PageHeader
        title="Laporan Digital"
        description={isLoading ? 'Memuat data...' : `${periodLabel} · ${invoiceGroups.length} invoice/transaksi`}
        actions={
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSapReconciliationOpen(true)}>Rekonsiliasi SAP</Button>
            <Button variant="outline" size="sm" onClick={() => void fetch({ fresh: true })} disabled={isLoading} className="gap-1.5">
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportHO}
              disabled={isExportingHo || !hoReady}
              title={hoReady ? undefined : 'Pilih tahun dan bulan terlebih dahulu'}
              className="gap-1.5"
            >
              <Download size={14} className={isExportingHo ? 'animate-pulse' : ''} /> Export HO
            </Button>
            <Button variant="default" size="sm" onClick={handleExportExcel} disabled={sorted.length === 0} className="gap-1.5">
              <Download size={14} /> Export Excel
            </Button>
          </div>
        }
      />

      <FilterToolbar
        end={
          <>
            <Button variant={showAdvanced ? 'secondary' : 'outline'} size="sm" className="h-9 gap-1.5" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Filter lanjutan{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}
            </Button>
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={handleResetFilters}>Reset</Button>
          </>
        }
        contentClassName="sm:items-start"
      >
        <FilterSelect
          value={filters.year}
          onChange={(year) => setFilters((f) => ({ ...f, year }))}
          options={[{ value: '', label: 'Semua Tahun' }, ...years.map((y) => ({ value: y, label: y }))]}
          className="w-32"
        />
        <MultiSelectFilter label="Bulan" allLabel="Semua Bulan" options={MONTH_OPTIONS} optionLabels={MONTH_LABELS}
          selected={filters.months} onChange={(months) => setFilters((f) => ({ ...f, months }))} className="w-40" />
        <MultiSelectFilter label="Komoditi" allLabel="Semua Komoditi" options={komoditas}
          selected={filters.komoditi} onChange={(komoditi) => setFilters((f) => ({ ...f, komoditi }))} className="w-40" />
        <MultiSelectFilter label="Unit" allLabel="Semua Unit" options={units}
          selected={filters.unit} onChange={(unit) => setFilters((f) => ({ ...f, unit }))} className="w-44" />
        <MultiSelectFilter label="Pembeli" allLabel="Semua Mitra Pembeli" options={pembelis} contentWidth="w-72"
          selected={filters.pembeli} onChange={(pembeli) => setFilters((f) => ({ ...f, pembeli }))} className="w-48" />
        <SearchInput
          value={filters.search}
          onChange={(v) => setFilters((f) => ({ ...f, search: v }))}
          placeholder="Cari No DO, Invoice, Kontrak, Mitra Pembeli, SAP..."
          className="min-w-[220px]"
        />
        {showAdvanced && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t pt-2">
            <MultiSelectFilter label="Material" allLabel="Semua Jenis Material" options={jenisKomoditas} contentWidth="w-72"
              selected={filters.jenisKomoditi} onChange={(jenisKomoditi) => setFilters((f) => ({ ...f, jenisKomoditi }))} className="w-48" />
            <FilterSelect
              value={filters.statusBayar}
              onChange={(v) => setFilters((f) => ({ ...f, statusBayar: v }))}
              options={[
                { value: 'ALL', label: 'Semua Status Bayar' },
                { value: 'BELUM', label: 'Belum Bayar' },
                { value: 'SEBAGIAN', label: 'Pembayaran Sebagian' },
                { value: 'LUNAS', label: 'Lunas' },
              ]}
              className="w-48"
            />
            <FilterSelect
              value={filters.sap}
              onChange={(v) => setFilters((f) => ({ ...f, sap: v }))}
              options={[
                { value: 'ALL', label: 'Semua Status SAP' },
                { value: 'MISSING_SAP', label: 'SAP Belum Lengkap' },
                { value: 'NO_KONTRAK_SAP', label: 'Tanpa Kontrak SAP' },
                { value: 'NO_SO_SAP', label: 'Tanpa SO SAP' },
                { value: 'NO_DO_SAP', label: 'Tanpa DO SAP' },
                { value: 'NO_BILLING_SAP', label: 'Tanpa Billing SAP' },
                { value: 'ALL_COMPLETE', label: 'SAP Lengkap' },
              ]}
              className="w-44"
            />
            <FilterSelect
              value={filters.tipe}
              onChange={(v) => setFilters((f) => ({ ...f, tipe: v as LaporanFilters['tipe'] }))}
              options={[
                { value: 'ALL', label: 'Termasuk Bypass' },
                { value: 'NO_BYPASS', label: 'Tanpa Bypass' },
                { value: 'ONLY_BYPASS', label: 'Hanya Bypass' },
              ]}
              className="w-40"
            />
          </div>
        )}
      </FilterToolbar>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard fitValue label="Pendapatan Pokok" value={formatCurrency(total.sales)}
          subtitle={total.salesRencana > 0 ? `Termasuk rencana DO ${formatCurrency(total.salesRencana)}` : 'Seluruhnya dari BA'} icon={TrendingUp} />
        <StatCard fitValue label="Volume BA / Rencana DO" value={volumeLabel(total.volumeKg, total.volumeEa)} subtitle="Sebelum PPN · BA selesai + rencana DO" icon={Scale} />
        <StatCard fitValue label="Harga Rata-Rata"
          value={total.komoditiCount > 1 ? 'Lihat rekap' : averagePrice ? `${formatCurrency(averagePrice.value)}/${averagePrice.unit}` : '—'}
          subtitle={total.komoditiCount > 1 ? `${total.komoditiCount} komoditi — pilih satu komoditi` : 'Pendapatan Pokok ÷ volume'} icon={BarChart3} />
        <StatCard fitValue label="Total Cash In" value={formatCurrency(total.cashIn)} subtitle={`${total.transferCount} transfer diterima`} icon={Wallet} />
        <StatCard fitValue label="Sisa Kurang Bayar" value={total.shortfall == null ? (balanceError ? 'Gagal dimuat' : '…') : formatCurrency(total.shortfall)}
          subtitle={`${total.unpaidInvoices} invoice belum lunas · posisi saat ini`} icon={AlertTriangle} />
        <StatCard fitValue label="Outstanding Pengambilan" value={volumeLabel(total.pickupOutstandingKg, total.pickupOutstandingEa)} subtitle="DO terbit − BA selesai" icon={Package} />
      </div>

      <p className="text-xs text-muted-foreground">
        Rekap per komoditi/unit/mitra pembeli ada di Dashboard. Pendapatan Pokok dihitung pada tanggal BA (realisasi) atau rencana DO bila belum ada BA. Cash in dihitung pada tanggal transfer.
        Kurang bayar dan sisa ambil adalah posisi saat ini untuk invoice yang tampil.
        {undatedSales > 0 && <span className="text-amber-700 dark:text-amber-400"> {undatedSales} DO belum punya tanggal rencana/BA sehingga tidak masuk periode ini.</span>}
        {balanceError && <span className="text-destructive"> Data piutang gagal dimuat, klik Refresh.</span>}
      </p>

      {isLoading ? (
        <Card><CardContent className="p-4"><TableSkeleton rows={6} cols={7} /></CardContent></Card>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState title="Tidak ada data" description={`Tidak ada transaksi untuk ${periodLabel}. Ubah filter atau reset.`} />
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleResetFilters}>Reset Filter</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && sorted.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Rincian Transaksi</p>
              <p className="text-xs text-muted-foreground">
                {showFullTable ? 'Semua kolom · nomor SAP dapat diisi langsung.' : 'Satu baris per invoice; Pendapatan Pokok (BA / rencana DO) dan Cash In dari periode terpilih digabung.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant={showFullTable ? 'outline' : 'default'} onClick={() => setShowFullTable(false)}>Ringkas</Button>
              <Button type="button" size="sm" variant={showFullTable ? 'default' : 'outline'} onClick={() => setShowFullTable(true)}>Kolom lengkap (SAP)</Button>
            </div>
          </div>
          <CardContent className="p-0">
            {!showFullTable ? (
              <LaporanRincianTable
                groups={invoiceGroups}
                balances={balances}
                sort={filters.sort}
                onToggleSort={() => setFilters((f) => ({ ...f, sort: f.sort === 'DESC' ? 'ASC' : 'DESC' }))}
                onDetail={(row) => setDetailKey(row.Row_ID || JSON.stringify(laporanRowKey(row)))}
              />
            ) : (
              <div className="overflow-auto max-h-[76vh]">
              <table className="text-[13px] border-separate border-spacing-0 w-full" style={{ minWidth: '4420px' }}>
                <thead>
                  <tr className="text-muted-foreground">
                    <th className={cn(TH, STICKY_TH, FROZEN_W_DO, 'text-left')}>No. DO</th>
                    <th className={cn(TH, STICKY_TH, W_INV, 'text-left')}>No Invoice</th>
                    <th className={cn(TH, STICKY_TH_FROZEN, STICKY_LEFT_KONTRAK, FROZEN_W_KONTRAK, 'text-left')}>No Kontrak</th>
                    <th className={cn(TH, STICKY_TH_FROZEN, STICKY_LEFT_UNIT, FROZEN_W_UNIT, 'text-left')}>Unit</th>
                    <th className={cn(TH, STICKY_TH_FROZEN, STICKY_LEFT_MITRA, STICKY_SHADOW, FROZEN_W_MITRA, 'text-left')}>Mitra Pembeli</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[7.5rem]')}>Komoditi</th>
                    <th className={cn(TH, STICKY_TH, 'text-center min-w-[4.5rem]')}>Satuan</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[8rem]')}>Tanggal Acuan Laporan</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[8rem]')}>Tgl Transfer</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[11rem]')}>Pelunasan Efektif</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[11rem]')}>Kewajiban Transfer (Cash In)</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[10.5rem]')}>Jumlah Transfer</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[12rem]')}>Jenis Material</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[10.5rem]')}>Jml Invoice</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[9.5rem]')}>Harga Satuan</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[7.5rem]')}>Volume Invoice</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[7.5rem]')}>Volume DO</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[10.5rem]')}>Pendapatan Pokok</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[10.5rem]')}>Setelah PPN</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[9.5rem]')}>Pajak PPN</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[8.5rem]')}>PPh</th>
                    <th className={cn(TH, STICKY_TH, 'text-center min-w-[12rem]')}>Status Setor PPh</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[9.5rem]')}>Sisa Kurang Bayar</th>
                    <th className={cn(TH, STICKY_TH, 'text-right min-w-[8rem]')}>Sisa Volume</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[8rem]')}>Bulan Buku</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[9rem]')}>Superman</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[8rem]')}>Kontrak SAP</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[7rem]')}>SO SAP</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[7rem]')}>DO SAP</th>
                    <th className={cn(TH, STICKY_TH, 'text-left min-w-[7.5rem]')}>Billing</th>
                    <th className={cn(TH, STICKY_TH, 'text-center min-w-[6.5rem]')}>Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {mergedRows.map((row, idx) => {
                    const isBypass = row.No_DO.startsWith('BYPASS-')
                    return (
                      <LaporanTableRow
                        key={`${row.No_DO}-${idx}`}
                        row={row}
                        balances={balances}
                        isBypass={isBypass}
                        onSapSave={(field, value) => handleSapSave(row, field, value)}
                        onDeleteBypass={(noDo, id) => {
                          setDeleteTarget(noDo)
                          setDeleteId(id)
                        }}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
            )}
          </CardContent>
        </Card>
      )}

      <SapReconciliationDialog open={sapReconciliationOpen} onOpenChange={setSapReconciliationOpen} rows={rows} loading={isLoading} />

      <Dialog open={!!detailRow} onOpenChange={(open) => { if (!open) setDetailKey(null) }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Transaksi</DialogTitle>
            <DialogDescription>{detailRow?.Mitra_Pembeli} · {detailRow?.No_Invoice || detailRow?.No_DO || detailRow?.No_Kontrak}</DialogDescription>
          </DialogHeader>
          {detailRow && <LaporanDetail row={detailRow} balances={balances} onSapSave={(field, value) => handleSapSave(detailRow, field, value)} />}
          {detailRow?.No_Kontrak && detailRow.No_Kontrak !== '-' && <Button variant="outline" asChild><Link to={`/kontrak-trace?id=${encodeURIComponent(detailRow.No_Kontrak)}`}>Document Flow · Alur Dokumen</Link></Button>}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => { setDeleteTarget(null); setDeleteId(null) }}
        title="Hapus Data Bypass"
        description="Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        isDestructive
        onConfirm={handleDeleteBypass}
      />
    </PageShell>
  )
}

function LaporanDetail({ row, balances, onSapSave }: { row: LaporanRow; balances: PiutangRow[] | null; onSapSave: (field: string, value: string) => Promise<void> }) {
  const canEdit = useAuthStore((s) => s.canEdit)
  const tax = row.No_DO.startsWith('BYPASS-') ? null : invoiceTaxEstimate(row)
  const sections = [
    { title: 'Dokumen & Periode', fields: [
      ['Kontrak', row.No_Kontrak], ['Invoice', row.No_Invoice], ['DO', row.No_DO],
      ['Volume pengambilan (BA terkait invoice/DO)', row.Volume_Pengambilan == null ? 'Belum tercatat' : `${formatNumber(row.Volume_Pengambilan)} ${normalizeSatuan(row.Satuan)}`],
      ['Sisa pengambilan (DO terbit)', !row.No_DO ? 'Belum ada DO' : row.Outstanding_Pengambilan == null ? '—' : `${formatNumber(row.Outstanding_Pengambilan)} ${normalizeSatuan(row.Satuan)}`],
      ['Unit', row.Unit], ['Komoditi / Material', [row.Komoditi, row.Deskripsi_Produk].filter(Boolean).join(' · ')],
      ['Tanggal Acuan Laporan (BA/invoice/kontrak)', formatDate(row.Billing_Date)], ['Tanggal Transfer', formatDate(row.Tanggal_Transfer)], ['Bulan Buku', row.Bulan_Buku],
    ] },
    { title: 'Pembayaran & Pajak', fields: [
      ['Nilai Invoice', formatCurrency(row.Jumlah_Invoice)], ['Cash In', formatCurrency(row.Jumlah_Transfer)],
      ['Pelunasan Efektif', formatCurrency(row.Pelunasan)], ['Kewajiban Transfer', formatCurrency(row.Kewajiban_Pembayaran)],
      ['Pendapatan Pokok', formatCurrency(row.Pendapatan_Pokok)], ['Setelah PPN', formatCurrency(row.Pendapatan_Setelah_PPN)],
      ['PPN alokasi baris (bukan total invoice)', formatCurrency(row.Pajak_PPN)], ['PPh alokasi baris (bukan total invoice)', formatCurrency(row.PPh_Nominal)],
      ['Nilai sebelum PPN (estimasi tarif kontrak)', tax ? formatCurrency(tax.net) : '—'],
      ['PPN invoice (estimasi tarif kontrak)', tax ? formatCurrency(tax.vat) : '—'],
      ['PPh invoice (estimasi tarif kontrak)', tax ? formatCurrency(tax.withholding) : '—'],
      ['Jenis PPh', 'Belum tersedia dalam data laporan'],
      ['Status bukti PPh', pphEvidenceLabel(row)],
      ['Verifikasi pajak', 'Nominal estimasi bukan DPP faktur pajak terverifikasi. Bukti potong/pungut, bukti setor/NTPN, dan verifikasi belum dicatat oleh fitur ini.'],
    ] },
    { title: 'Volume', fields: [
      ['Harga Satuan', formatCurrency(row.Harga_Satuan)],
      ['Volume Invoice', `${formatNumber(row.Volume_Invoice)} ${normalizeSatuan(row.Satuan)}`],
      ['Volume DO', `${formatNumber(row.Volume_DO_Dokumen ?? row.Jumlah_DO)} ${normalizeSatuan(row.Satuan)}`],
      ['Volume Pengambilan BA', `${formatNumber(row.Volume_Pengambilan ?? 0)} ${normalizeSatuan(row.Satuan)}`],
      ['Outstanding Pengambilan', `${formatNumber(row.Outstanding_Pengambilan ?? row.Sisa_Volume)} ${normalizeSatuan(row.Satuan)}`],
    ] },
  ]
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="border-b pb-2 text-sm font-semibold">{section.title}</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm break-words tabular-nums">{safe(value)}</dd></div>)}
          </dl>
        </section>
      ))}
      <section>
        <h3 className="border-b pb-2 text-sm font-semibold">Sisa per Invoice — Transfer & PPh</h3>
        <div className="mt-3"><InvoiceOutstanding row={row} balances={balances} /></div>
        <p className="mt-2 text-xs text-muted-foreground">Kekurangan bayar adalah sisa pelunasan setelah PPh diperhitungkan. PPh tertunda dihitung dari termin yang belum ditandai disetor, bukan seluruh estimasi PPh invoice. Penandaan disetor tetap memerlukan verifikasi bukti terpisah.</p>
      </section>
      <section>
        <h3 className="border-b pb-2 text-sm font-semibold">Administrasi</h3>
        <p className="mt-3 text-sm">Superman: {row.Superman?.trim() || 'Belum terisi'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Nomor SAP disimpan setelah kolom selesai diisi. DO belum wajib terbit.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['Kontrak_SAP', 'SO_SAP', 'DO_SAP', 'Billing'] as const).map((field) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`detail-${field}`} className="text-xs">{field.replace('_', ' ')}</Label>
              <Input id={`detail-${field}`} key={`${laporanRowKey(row)}-${field}-${row[field]}`} defaultValue={row[field] || ''} readOnly={!canEdit() || !canSaveSapFields(row)}
                onBlur={(event) => { if (canEdit() && canSaveSapFields(row) && event.target.value !== (row[field] || '')) void onSapSave(field, event.target.value) }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function MoneyCell({ value, className }: { value: number; className?: string }) {
  const formatted = formatCurrency(value)
  return (
    <td className={cn(TD_MONEY, className)} title={formatted}>
      {formatted}
    </td>
  )
}

function LaporanTableRow({
  row,
  balances,
  isBypass,
  onSapSave,
  onDeleteBypass,
}: {
  row: LaporanRow
  balances: PiutangRow[] | null
  isBypass: boolean
  onSapSave: (field: string, value: string) => Promise<void>
  onDeleteBypass: (noDo: string, id: number) => void
}) {
  const canEdit = useAuthStore((s) => s.canEdit)
  return (
    <tr className={cn(
      'group transition-colors',
      isBypass
        ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900'
        : 'hover:bg-muted/50',
    )}>
      <td className={cn(
        TD,
        FROZEN_W_DO,
        'font-medium whitespace-normal break-words',
        isBypass
          ? 'bg-amber-50 group-hover:bg-amber-100 dark:bg-amber-950 dark:group-hover:bg-amber-900'
          : 'bg-card group-hover:bg-muted',
      )}>
        {row.No_DO ? (
          row.No_DO
        ) : row.No_Invoice ? (
          <span
            className="inline-flex flex-col gap-0.5 text-amber-700 dark:text-amber-400"
            title="Invoice sudah ada — kolom SAP di kanan bisa langsung diisi"
          >
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium dark:bg-amber-900/50">
              Belum DO
            </span>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
              SAP via invoice
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground text-[12px]">—</span>
        )}
      </td>
      <td className={cn(TD, W_INV, 'whitespace-normal break-words')}>{row.No_Invoice}</td>
      <td className={cn(
        TD,
        STICKY_TD,
        STICKY_LEFT_KONTRAK,
        FROZEN_W_KONTRAK,
        'font-medium text-primary whitespace-normal break-words',
        isBypass
          ? 'bg-amber-50 group-hover:bg-amber-100 dark:bg-amber-950 dark:group-hover:bg-amber-900'
          : 'bg-card group-hover:bg-muted',
      )}>
        {row.No_Kontrak}
      </td>
      <td className={cn(
        TD,
        STICKY_TD,
        STICKY_LEFT_UNIT,
        FROZEN_W_UNIT,
        'whitespace-normal break-words',
        isBypass
          ? 'bg-amber-50 group-hover:bg-amber-100 dark:bg-amber-950 dark:group-hover:bg-amber-900'
          : 'bg-card group-hover:bg-muted',
      )}>
        {row.Unit}
      </td>
      <td className={cn(
        TD,
        STICKY_TD,
        STICKY_LEFT_MITRA,
        STICKY_SHADOW,
        FROZEN_W_MITRA,
        'whitespace-normal break-words',
        isBypass
          ? 'bg-amber-50 group-hover:bg-amber-100 dark:bg-amber-950 dark:group-hover:bg-amber-900'
          : 'bg-card group-hover:bg-muted',
      )}>
        {safe(row.Mitra_Pembeli)}
      </td>
      <td className={cn(TD, 'min-w-[7.5rem] whitespace-normal break-words')}>{row.Komoditi}</td>
      <td className={cn(TD, 'text-center min-w-[4.5rem]')}>{normalizeSatuan(row.Satuan)}</td>
      <td className={cn(TD, 'whitespace-nowrap min-w-[8rem]')}>{formatDate(row.Billing_Date)}</td>
      <td className={cn(TD, 'whitespace-nowrap min-w-[8rem]')}>{formatDate(row.Tanggal_Transfer)}</td>
      <MoneyCell value={row.Pelunasan} className="text-blue-600 dark:text-blue-400 font-medium" />
      <MoneyCell value={row.Kewajiban_Pembayaran} className="font-semibold" />
      <MoneyCell value={row.Jumlah_Transfer} className="text-emerald-600 dark:text-emerald-400 font-medium" />
      <td className={cn(TD, 'min-w-[12rem] whitespace-normal break-words')}>{safe(row.Deskripsi_Produk)}</td>
      <td className={TD_MONEY} title={row.Jumlah_Invoice > 0 ? formatCurrency(row.Jumlah_Invoice) : undefined}>
        {row.Jumlah_Invoice > 0 ? formatCurrency(row.Jumlah_Invoice) : '-'}
      </td>
      <MoneyCell value={row.Harga_Satuan} />
      <td className={cn(TD_MONEY, 'font-medium')}>{formatNumber(row.Volume_Invoice)}</td>
      <td className={cn(TD_MONEY, 'font-medium')}>{formatNumber(row.Jumlah_DO)}</td>
      <MoneyCell value={row.Pendapatan_Pokok} />
      <MoneyCell value={row.Pendapatan_Setelah_PPN} />
      <MoneyCell value={row.Pajak_PPN} />
      <MoneyCell value={row.PPh_Nominal} />
      <td className={cn(TD, 'text-center min-w-[5.5rem]')}>
        <InvoiceOutstanding row={row} balances={balances} mode="status" />
      </td>
      <td className={cn(TD_MONEY)}>
        <InvoiceOutstanding row={row} balances={balances} mode="shortfall" />
      </td>
      <td className={cn(
        TD_MONEY,
        'font-semibold',
        (row.Sisa_Volume || 0) <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
      )}>
        {(row.Sisa_Volume || 0) <= 0 ? 'Selesai' : formatNumber(row.Sisa_Volume)}
      </td>
      <td className={cn(TD, 'whitespace-nowrap min-w-[8rem]')}>{row.Bulan_Buku}</td>
      <td className={cn(TD, 'min-w-[9rem]')}>
        {(row.Superman || '').trim() ? (
          <span
            className="inline-flex items-start gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400 break-words"
            title={row.Superman || undefined}
          >
            <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
            {row.Superman}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">Belum</span>
        )}
      </td>
      {(['Kontrak_SAP', 'SO_SAP', 'DO_SAP', 'Billing'] as const).map((field) => {
        const sapEditable = canEdit() && canSaveSapFields(row)
        const invoiceOnly = isInvoiceOnlySapRow(row)
        return (
          <td key={field} className={cn(TD, 'min-w-[7.5rem]')}>
            <input
              key={`${row.No_Invoice}-${row.No_DO}-${field}-${row[field] || ''}`}
              className={cn(
                TD_INPUT,
                !sapEditable && 'opacity-60 cursor-not-allowed bg-muted/40',
                sapEditable && invoiceOnly && 'border-emerald-300/80 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20',
              )}
              defaultValue={row[field] || ''}
              readOnly={!sapEditable}
              title={
                !canSaveSapFields(row)
                  ? 'Buat invoice terlebih dahulu'
                  : invoiceOnly
                    ? 'Disimpan ke invoice — bisa diisi sebelum DO dibuat'
                    : undefined
              }
              onBlur={(e) => {
                if (sapEditable && e.target.value !== (row[field] || '')) {
                  void onSapSave(field, e.target.value)
                }
              }}
              placeholder={sapEditable ? (invoiceOnly ? 'Isi SAP' : '-') : '—'}
            />
          </td>
        )
      })}
      <td className={cn(TD, 'text-center min-w-[6.5rem]')}>
        {isBypass && canEdit() ? (
          <div className="flex gap-1 justify-center">
            <Button size="sm" variant="ghost" className="h-8 px-2.5 text-[13px]" onClick={() => {
              const id = parseInt(row.No_DO.replace('BYPASS-', ''))
              window.location.href = `/bypass?edit=${id}`
            }}>Edit</Button>
            <Button size="sm" variant="ghost" className="h-8 px-2.5 text-[13px] text-destructive" onClick={() => {
              onDeleteBypass(row.No_DO, parseInt(row.No_DO.replace('BYPASS-', '')))
            }}>Hapus</Button>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
    </tr>
  )
}
