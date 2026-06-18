import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw,
  Download,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Package,
  BarChart3,
  Box,
  ChevronDown,
  ChevronUp,
  X,
  SlidersHorizontal,
} from 'lucide-react'
import { useLaporanStore } from '@/store/laporanStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/common/StatCard'
import { SearchInput } from '@/components/common/SearchInput'
import { MultiSelectFilter } from '@/components/common/MultiSelectFilter'
import { FilterSelect } from '@/components/common/FilterBar'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import {
  filterLaporanRows,
  calculateLaporanSummary,
  createDefaultLaporanFilters,
  getDefaultLaporanMonthKeys,
  MONTH_OPTIONS,
  MONTH_LABELS,
  type LaporanFilters,
} from '@/utils/laporanUtils'
import { formatCurrency, formatNumber, formatDate, safe, cn } from '@/lib/utils'
import type { LaporanRow } from '@/types'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { SupermanDeklarasiButton } from '@/components/common/SupermanDeklarasiButton'
import * as XLSX from 'xlsx'

/** Kepadatan seimbang — antara padat & lega, nominal penuh tanpa ellipsis */
const TH = 'px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap'
const TD = 'px-3 py-2 text-[13px] align-middle leading-normal'
const TD_MONEY = 'px-3 py-2 text-[13px] text-right whitespace-nowrap tabular-nums min-w-[10.5rem] align-middle'
const TD_INPUT = 'w-full min-w-[6.5rem] h-8 text-[13px] border border-border/60 hover:border-border rounded-md px-2.5 py-1.5 bg-background text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30'

function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export default function LaporanPage() {
  const { rows, isLoading, fetch, updateSapField, deleteBypass } = useLaporanStore()
  const { addNotification } = useAppStore()
  const [filters, setFilters] = useState<LaporanFilters>(createDefaultLaporanFilters)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  useEffect(() => { fetch() }, [])

  const units = useMemo(() => [...new Set(rows.map((r) => r.Unit).filter(Boolean))].sort(), [rows])
  const pembelis = useMemo(() => [...new Set(rows.map((r) => r.Mitra_Pembeli).filter(Boolean))].sort(), [rows])
  const komoditas = useMemo(() => [...new Set(rows.map((r) => r.Komoditi).filter(Boolean))].sort(), [rows])
  const jenisKomoditas = useMemo(() => [...new Set(rows.map((r) => r.Deskripsi_Produk).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => filterLaporanRows(rows, filters), [rows, filters])
  const summary = useMemo(() => calculateLaporanSummary(filtered), [filtered])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const dateA = new Date(a.Raw_Date || a.Billing_Date || 0).getTime()
      const dateB = new Date(b.Raw_Date || b.Billing_Date || 0).getTime()
      return filters.sort === 'DESC' ? dateB - dateA : dateA - dateB
    })
    return arr
  }, [filtered, filters.sort])

  const periodLabel = useMemo(() => {
    if (filters.months.length === 0) return 'Semua bulan'
    if (filters.months.length === 1) return MONTH_LABELS[filters.months[0]] || filters.months[0]
    if (filters.months.length === 2) {
      return filters.months.map((m) => MONTH_LABELS[m] || m).join(' & ')
    }
    return `${filters.months.length} bulan terpilih`
  }, [filters.months])

  const activeChips = useMemo(() => {
    const chips: { id: string; label: string; onRemove: () => void }[] = []
    const patch = (partial: Partial<LaporanFilters>) => setFilters((f) => ({ ...f, ...partial }))

    if (filters.search) {
      chips.push({ id: 'search', label: `"${filters.search}"`, onRemove: () => patch({ search: '' }) })
    }
    if (filters.unit.length > 0) {
      chips.push({
        id: 'unit',
        label: filters.unit.length === 1 ? filters.unit[0] : `${filters.unit.length} unit`,
        onRemove: () => patch({ unit: [] }),
      })
    }
    if (filters.pembeli.length > 0) {
      chips.push({
        id: 'pembeli',
        label: filters.pembeli.length === 1 ? filters.pembeli[0] : `${filters.pembeli.length} pembeli`,
        onRemove: () => patch({ pembeli: [] }),
      })
    }
    if (filters.komoditi.length > 0) {
      chips.push({
        id: 'komoditi',
        label: filters.komoditi.length === 1 ? filters.komoditi[0] : `${filters.komoditi.length} komoditi`,
        onRemove: () => patch({ komoditi: [] }),
      })
    }
    if (filters.jenisKomoditi.length > 0) {
      chips.push({
        id: 'material',
        label: filters.jenisKomoditi.length === 1 ? '1 material' : `${filters.jenisKomoditi.length} material`,
        onRemove: () => patch({ jenisKomoditi: [] }),
      })
    }
    if (filters.tipe !== 'ALL') {
      const labels = { NO_BYPASS: 'Tanpa bypass', ONLY_BYPASS: 'Hanya bypass' }
      chips.push({ id: 'tipe', label: labels[filters.tipe], onRemove: () => patch({ tipe: 'ALL' }) })
    }
    if (filters.sap !== 'ALL') {
      chips.push({ id: 'sap', label: 'Filter SAP', onRemove: () => patch({ sap: 'ALL' }) })
    }
    if (filters.statusBayar !== 'ALL') {
      chips.push({ id: 'bayar', label: 'Filter bayar', onRemove: () => patch({ statusBayar: 'ALL' }) })
    }
    if (filters.modeTanggal !== 'TRANSFER') {
      chips.push({ id: 'mode', label: 'Rencana ambil', onRemove: () => patch({ modeTanggal: 'TRANSFER' }) })
    }

    return chips
  }, [filters])

  const advancedFilterCount = useMemo(() => {
    let n = 0
    if (filters.jenisKomoditi.length > 0) n++
    if (filters.modeTanggal !== 'TRANSFER') n++
    if (filters.sort !== 'DESC') n++
    if (filters.tipe !== 'ALL') n++
    if (filters.sap !== 'ALL') n++
    if (filters.statusBayar !== 'ALL') n++
    return n
  }, [filters])

  const handleSapSave = async (noDo: string, field: string, value: string) => {
    if (!value.trim()) return
    try {
      await updateSapField(noDo, field, value)
      addNotification(`${field} tersimpan`, 'success')
    } catch {
      addNotification('Gagal menyimpan', 'error')
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

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(sorted)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan')
    XLSX.writeFile(wb, `Laporan_Digital_${periodLabel.replace(/\s+/g, '_')}.xlsx`)
  }

  const handleResetFilters = () => setFilters(createDefaultLaporanFilters())

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Laporan Digital</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Memuat data...' : (
              <>
                <span className="font-medium text-foreground">{sorted.length}</span> baris ditampilkan
                {rows.length !== sorted.length && <> dari {rows.length} total</>}
                {' · '}{periodLabel}
                {filters.modeTanggal === 'TRANSFER' ? ' (tgl transfer)' : ' (rencana ambil)'}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={fetch} disabled={isLoading} className="gap-1.5">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </Button>
          <Button variant="default" size="sm" onClick={handleExportExcel} disabled={sorted.length === 0} className="gap-1.5">
            <Download size={14} /> Export Excel
          </Button>
        </div>
      </div>

      {/* Summary — nilai menyesuaikan lebar kartu */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard fitValue label="Total Cash In" value={formatCurrency(summary.cashIn)} icon={Wallet} />
        <StatCard fitValue label="Total Pendapatan" value={formatCurrency(summary.pendapatan)} icon={TrendingUp} />
        <StatCard fitValue label="Kekurangan Bayar" value={formatCurrency(summary.sisaBayar)} icon={AlertTriangle} iconClassName="text-amber-500" />
        <StatCard
          fitValue
          label="Sisa Barang (DO)"
          value={formatNumber(summary.sisaVolume)}
          subtitle={`Butir: ${formatNumber(summary.sisaVolumeButir)}`}
          icon={Package}
        />
        <StatCard
          fitValue
          label="Harga Rata-Rata"
          value={`${formatCurrency(summary.hargaRataKg)}/Kg`}
          subtitle={`${formatCurrency(summary.hargaRataButir)}/Butir`}
          icon={BarChart3}
        />
        <StatCard
          fitValue
          label="Barang Terkirim"
          value={formatNumber(summary.barangTerkirimKg)}
          subtitle={`Butir: ${formatNumber(summary.barangTerkirimButir)}`}
          icon={Box}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-muted-foreground" />
              Filter Data
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={handleResetFilters}>
              Reset ke default
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <SearchInput
            value={filters.search}
            onChange={(v) => setFilters((f) => ({ ...f, search: v }))}
            placeholder="Cari No DO, Invoice, Kontrak, Pembeli, SAP..."
            className="max-w-none w-full"
          />

          {/* Filter utama — grid proporsional */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 items-end">
            <FilterField label="Bulan">
              <MultiSelectFilter
                label="Bulan"
                allLabel="Semua Bulan"
                options={MONTH_OPTIONS}
                optionLabels={MONTH_LABELS}
                selected={filters.months}
                onChange={(months) => setFilters((f) => ({ ...f, months }))}
                className="w-full"
              />
            </FilterField>
            <FilterField label="Unit">
              <MultiSelectFilter
                label="Unit"
                allLabel="Semua Unit"
                options={units}
                selected={filters.unit}
                onChange={(unit) => setFilters((f) => ({ ...f, unit }))}
                className="w-full"
              />
            </FilterField>
            <FilterField label="Komoditi">
              <MultiSelectFilter
                label="Komoditi"
                allLabel="Semua Komoditi"
                options={komoditas}
                selected={filters.komoditi}
                onChange={(komoditi) => setFilters((f) => ({ ...f, komoditi }))}
                className="w-full"
              />
            </FilterField>
            <FilterField label="Pembeli">
              <MultiSelectFilter
                label="Pembeli"
                allLabel="Semua Pembeli"
                options={pembelis}
                selected={filters.pembeli}
                onChange={(pembeli) => setFilters((f) => ({ ...f, pembeli }))}
                className="w-full"
                contentWidth="w-64"
              />
            </FilterField>
            <FilterField label="Opsi">
              <Button
                variant={showAdvanced ? 'secondary' : 'outline'}
                size="sm"
                className="h-9 w-full justify-between gap-1.5 font-normal"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {showAdvanced ? <ChevronUp size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
                  Filter lanjutan
                </span>
                {advancedFilterCount > 0 && (
                  <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px] shrink-0">
                    {advancedFilterCount}
                  </Badge>
                )}
              </Button>
            </FilterField>
          </div>

          {showAdvanced && (
            <div className="rounded-lg border border-border/70 bg-muted/25 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Filter lanjutan</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <FilterField label="Jenis Material" className="sm:col-span-2 lg:col-span-1">
                  <MultiSelectFilter
                    label="Material"
                    allLabel="Semua Jenis Material"
                    options={jenisKomoditas}
                    selected={filters.jenisKomoditi}
                    onChange={(jenisKomoditi) => setFilters((f) => ({ ...f, jenisKomoditi }))}
                    className="w-full"
                    contentWidth="w-72"
                  />
                </FilterField>
                <FilterField label="Dasar Tanggal Bulan">
                  <FilterSelect
                    value={filters.modeTanggal}
                    onChange={(v) => setFilters((f) => ({ ...f, modeTanggal: v as 'TRANSFER' | 'RENCANA' }))}
                    options={[
                      { value: 'TRANSFER', label: 'Tgl Transfer' },
                      { value: 'RENCANA', label: 'Rencana Ambil' },
                    ]}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="Urutan Data">
                  <FilterSelect
                    value={filters.sort}
                    onChange={(v) => setFilters((f) => ({ ...f, sort: v as 'DESC' | 'ASC' }))}
                    options={[
                      { value: 'DESC', label: 'Terbaru → Terlama' },
                      { value: 'ASC', label: 'Terlama → Terbaru' },
                    ]}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="Tipe Data">
                  <FilterSelect
                    value={filters.tipe}
                    onChange={(v) => setFilters((f) => ({ ...f, tipe: v as 'ALL' | 'NO_BYPASS' | 'ONLY_BYPASS' }))}
                    options={[
                      { value: 'ALL', label: 'Semua Data' },
                      { value: 'NO_BYPASS', label: 'Sembunyikan Bypass' },
                      { value: 'ONLY_BYPASS', label: 'Hanya Bypass' },
                    ]}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="Status SAP">
                  <FilterSelect
                    value={filters.sap}
                    onChange={(v) => setFilters((f) => ({ ...f, sap: v }))}
                    options={[
                      { value: 'ALL', label: 'Semua Status SAP' },
                      { value: 'MISSING_SAP', label: 'Belum Lengkap' },
                      { value: 'NO_KONTRAK_SAP', label: 'Tanpa Kontrak SAP' },
                      { value: 'NO_SO_SAP', label: 'Tanpa SO SAP' },
                      { value: 'NO_DO_SAP', label: 'Tanpa DO SAP' },
                      { value: 'NO_BILLING_SAP', label: 'Tanpa Billing SAP' },
                      { value: 'ALL_COMPLETE', label: 'Sudah Lengkap' },
                    ]}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="Status Pembayaran">
                  <FilterSelect
                    value={filters.statusBayar}
                    onChange={(v) => setFilters((f) => ({ ...f, statusBayar: v }))}
                    options={[
                      { value: 'ALL', label: 'Semua Status Bayar' },
                      { value: 'BELUM', label: 'Belum Bayar' },
                      { value: 'SEBAGIAN', label: 'Pembayaran Sebagian' },
                      { value: 'LUNAS', label: 'Lunas' },
                    ]}
                    className="w-full"
                  />
                </FilterField>
              </div>
            </div>
          )}

          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Filter aktif:</span>
              {activeChips.map((chip) => (
                <Badge key={chip.id} variant="secondary" className="gap-1 pr-1 font-normal">
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                    aria-label={`Hapus filter ${chip.label}`}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Default: bulan berjalan dan 1 bulan sebelumnya (
            {getDefaultLaporanMonthKeys().map((m) => MONTH_LABELS[m]).join(', ')}
            ). Kosongkan filter bulan untuk melihat semua periode.
          </p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="py-3 border-b">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Tabel Laporan</CardTitle>
            <p className="text-xs text-muted-foreground">
              Scroll horizontal · edit langsung di kolom SAP
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} cols={8} /></div>
          ) : sorted.length === 0 ? (
            <div className="py-8">
              <EmptyState
                title="Tidak ada data laporan"
                description={`Tidak ada baris untuk ${periodLabel}. Coba ubah filter bulan atau reset ke default.`}
              />
              <div className="flex justify-center mt-4">
                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                  Reset Filter
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-auto max-h-[76vh]">
              <table className="text-[13px] border-separate border-spacing-0 w-full" style={{ minWidth: '4300px' }}>
                <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-muted/90 [&_th]:backdrop-blur-sm [&_th]:border-b [&_th]:border-border [&_th:first-child]:left-0 [&_th:first-child]:z-30 [&_th]:text-muted-foreground">
                  <tr>
                    <th className={cn(TH, 'text-left min-w-[12rem] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]')}>No. DO</th>
                    <th className={cn(TH, 'text-left min-w-[11rem]')}>No Invoice</th>
                    <th className={cn(TH, 'text-left min-w-[13rem]')}>No Kontrak</th>
                    <th className={cn(TH, 'text-left min-w-[8rem]')}>Unit</th>
                    <th className={cn(TH, 'text-left min-w-[7.5rem]')}>Komoditi</th>
                    <th className={cn(TH, 'text-center min-w-[4.5rem]')}>Satuan</th>
                    <th className={cn(TH, 'text-left min-w-[8rem]')}>Billing Date</th>
                    <th className={cn(TH, 'text-left min-w-[8rem]')}>Tgl Transfer</th>
                    <th className={cn(TH, 'text-right min-w-[10.5rem]')}>Jumlah Transfer</th>
                    <th className={cn(TH, 'text-right min-w-[10.5rem]')}>Pelunasan (Inc. PPh)</th>
                    <th className={cn(TH, 'text-left min-w-[11rem]')}>Mitra Pembeli</th>
                    <th className={cn(TH, 'text-left min-w-[12rem]')}>Jenis Material</th>
                    <th className={cn(TH, 'text-right min-w-[10.5rem]')}>Jml Invoice</th>
                    <th className={cn(TH, 'text-right min-w-[9.5rem]')}>Harga Satuan</th>
                    <th className={cn(TH, 'text-right min-w-[7.5rem]')}>Jumlah DO</th>
                    <th className={cn(TH, 'text-right min-w-[10.5rem]')}>Pendapatan Pokok</th>
                    <th className={cn(TH, 'text-right min-w-[10.5rem]')}>Setelah PPN</th>
                    <th className={cn(TH, 'text-right min-w-[9.5rem]')}>Pajak PPN</th>
                    <th className={cn(TH, 'text-right min-w-[8.5rem]')}>PPh</th>
                    <th className={cn(TH, 'text-center min-w-[5.5rem]')}>PPh Setor?</th>
                    <th className={cn(TH, 'text-right min-w-[10.5rem]')}>Kewajiban (Gross)</th>
                    <th className={cn(TH, 'text-right min-w-[9.5rem]')}>Sisa Bayar</th>
                    <th className={cn(TH, 'text-right min-w-[8rem]')}>Sisa Volume</th>
                    <th className={cn(TH, 'text-left min-w-[8rem]')}>Bulan Buku</th>
                    <th className={cn(TH, 'text-left min-w-[7.5rem]')}>Superman</th>
                    <th className={cn(TH, 'text-left min-w-[8rem]')}>Kontrak SAP</th>
                    <th className={cn(TH, 'text-left min-w-[7rem]')}>SO SAP</th>
                    <th className={cn(TH, 'text-left min-w-[7rem]')}>DO SAP</th>
                    <th className={cn(TH, 'text-left min-w-[7.5rem]')}>Billing</th>
                    <th className={cn(TH, 'text-left min-w-[10rem]')}>Link Deklarasi</th>
                    <th className={cn(TH, 'text-left min-w-[10rem]')}>Berita Acara</th>
                    <th className={cn(TH, 'text-center min-w-[6.5rem]')}>Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {sorted.map((row, idx) => {
                    const isBypass = row.No_DO.startsWith('BYPASS-')
                    return (
                      <LaporanTableRow
                        key={`${row.No_DO}-${idx}`}
                        row={row}
                        isBypass={isBypass}
                        onSapSave={handleSapSave}
                        onRefresh={fetch}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => { setDeleteTarget(null); setDeleteId(null) }}
        title="Hapus Data Bypass"
        description="Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        isDestructive
        onConfirm={handleDeleteBypass}
      />
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
  isBypass,
  onSapSave,
  onRefresh,
  onDeleteBypass,
}: {
  row: LaporanRow
  isBypass: boolean
  onSapSave: (noDo: string, field: string, value: string) => Promise<void>
  onRefresh: () => void
  onDeleteBypass: (noDo: string, id: number) => void
}) {
  const canEdit = useAuthStore((s) => s.canEdit)
  return (
    <tr className={cn(
      'transition-colors',
      isBypass ? 'bg-amber-500/10 dark:bg-amber-500/15' : 'hover:bg-muted/50',
    )}>
      <td className={cn(
        TD,
        'font-medium min-w-[12rem] whitespace-normal break-words sticky left-0 z-10 bg-card shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]',
        isBypass && 'bg-amber-500/10 dark:bg-amber-500/15',
      )}>
        {row.No_DO}
      </td>
      <td className={cn(TD, 'min-w-[11rem] whitespace-normal break-words')}>{row.No_Invoice}</td>
      <td className={cn(TD, 'font-medium text-primary min-w-[13rem] whitespace-normal break-words')}>{row.No_Kontrak}</td>
      <td className={cn(TD, 'min-w-[8rem] whitespace-normal break-words')}>{row.Unit}</td>
      <td className={cn(TD, 'min-w-[7.5rem] whitespace-normal break-words')}>{row.Komoditi}</td>
      <td className={cn(TD, 'text-center min-w-[4.5rem]')}>{row.Satuan}</td>
      <td className={cn(TD, 'whitespace-nowrap min-w-[8rem]')}>{formatDate(row.Billing_Date)}</td>
      <td className={cn(TD, 'whitespace-nowrap min-w-[8rem]')}>{formatDate(row.Tanggal_Transfer)}</td>
      <MoneyCell value={row.Jumlah_Transfer} className="text-emerald-600 dark:text-emerald-400 font-medium" />
      <MoneyCell value={row.Pelunasan} className="text-blue-600 dark:text-blue-400 font-medium" />
      <td className={cn(TD, 'min-w-[11rem] whitespace-normal break-words')}>{safe(row.Mitra_Pembeli)}</td>
      <td className={cn(TD, 'min-w-[12rem] whitespace-normal break-words')}>{safe(row.Deskripsi_Produk)}</td>
      <td className={TD_MONEY} title={row.Jumlah_Invoice > 0 ? formatCurrency(row.Jumlah_Invoice) : undefined}>
        {row.Jumlah_Invoice > 0 ? formatCurrency(row.Jumlah_Invoice) : '-'}
      </td>
      <MoneyCell value={row.Harga_Satuan} />
      <td className={cn(TD_MONEY, 'font-medium')}>{formatNumber(row.Jumlah_DO)}</td>
      <MoneyCell value={row.Pendapatan_Pokok} />
      <MoneyCell value={row.Pendapatan_Setelah_PPN} />
      <MoneyCell value={row.Pajak_PPN} />
      <MoneyCell value={row.PPh_Nominal} />
      <td className={cn(TD, 'text-center min-w-[5.5rem]')}>
        {row.PPh_Setor === 'Disetor' ? <span className="text-emerald-600 dark:text-emerald-400">✓ Disetor</span> : '-'}
      </td>
      <MoneyCell value={row.Kewajiban_Pembayaran} className="font-semibold" />
      <td
        className={cn(
          TD_MONEY,
          'font-semibold',
          (row.Sisa_Pembayaran || 0) <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        )}
        title={(row.Sisa_Pembayaran || 0) <= 0 ? 'Lunas' : formatCurrency(row.Sisa_Pembayaran)}
      >
        {(row.Sisa_Pembayaran || 0) <= 0 ? 'Lunas' : formatCurrency(row.Sisa_Pembayaran)}
      </td>
      <td className={cn(
        TD_MONEY,
        'font-semibold',
        (row.Sisa_Volume || 0) <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
      )}>
        {(row.Sisa_Volume || 0) <= 0 ? 'Selesai' : formatNumber(row.Sisa_Volume)}
      </td>
      <td className={cn(TD, 'whitespace-nowrap min-w-[8rem]')}>{row.Bulan_Buku}</td>
      {(['Superman', 'Kontrak_SAP', 'SO_SAP', 'DO_SAP', 'Billing'] as const).map((field) => (
        <td key={field} className={cn(TD, 'min-w-[7.5rem]')}>
          <input
            className={TD_INPUT}
            defaultValue={row[field] || ''}
            readOnly={!canEdit()}
            onBlur={(e) => {
              if (canEdit() && e.target.value !== (row[field] || '')) {
                onSapSave(row.No_DO, field, e.target.value)
              }
            }}
            placeholder="-"
          />
        </td>
      ))}
      <td className={cn(TD, 'min-w-[10rem]')}>
        <div className="flex flex-col gap-1.5 min-w-[9rem]">
          {(row.Link_Deklarasi_Penerimaan || '').startsWith('http') && (
            <a
              href={row.Link_Deklarasi_Penerimaan!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-primary hover:underline"
            >
              Buka Link
            </a>
          )}
          <input
            className={TD_INPUT}
            defaultValue={row.Link_Deklarasi_Penerimaan || ''}
            readOnly={!canEdit()}
            onBlur={(e) => {
              if (canEdit() && e.target.value !== (row.Link_Deklarasi_Penerimaan || '')) {
                onSapSave(row.No_DO, 'Link_Deklarasi_Penerimaan', e.target.value)
              }
            }}
            placeholder="-"
          />
          {!isBypass && (
            <>
              <SupermanDeklarasiButton noDo={row.No_DO} compact />
              <DocumentUpload
                compact
                entityType="do"
                entityId={row.No_DO}
                docType="deklarasi"
                onUploaded={onRefresh}
              />
            </>
          )}
        </div>
      </td>
      <td className={cn(TD, 'min-w-[10rem]')}>
        <div className="flex flex-col gap-1.5 min-w-[9rem]">
          {(row.Link_Berita_Acara_Serah_Terima || '').startsWith('http') && (
            <a
              href={row.Link_Berita_Acara_Serah_Terima!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-primary hover:underline"
            >
              Buka Link
            </a>
          )}
          {!isBypass && (
            <>
              <input
                className={TD_INPUT}
                defaultValue={row.Link_Berita_Acara_Serah_Terima || ''}
                readOnly={!canEdit()}
                onBlur={(e) => {
                  if (canEdit() && e.target.value !== (row.Link_Berita_Acara_Serah_Terima || '')) {
                    onSapSave(row.No_DO, 'Link_Berita_Acara_Serah_Terima', e.target.value)
                  }
                }}
                placeholder="-"
              />
              <DocumentUpload
                compact
                entityType="do"
                entityId={row.No_DO}
                docType="berita_acara"
                onUploaded={onRefresh}
              />
            </>
          )}
        </div>
      </td>
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