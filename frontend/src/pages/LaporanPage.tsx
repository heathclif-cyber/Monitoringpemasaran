import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import { useLaporanStore } from '@/store/laporanStore'
import { useAppStore } from '@/store/appStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
  type LaporanFilters,
  DEFAULT_LAPORAN_FILTERS,
} from '@/utils/laporanUtils'
import { formatCurrency, formatNumber, formatDate, safe } from '@/lib/utils'
import type { LaporanRow } from '@/types'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import * as XLSX from 'xlsx'

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const MONTH_LABELS = Object.fromEntries(MONTH_OPTIONS.map((m, i) => [m, MONTHS_ID[i + 1]]))

export default function LaporanPage() {
  const { rows, isLoading, fetch, updateSapField, deleteBypass } = useLaporanStore()
  const { addNotification } = useAppStore()
  const [filters, setFilters] = useState<LaporanFilters>(DEFAULT_LAPORAN_FILTERS)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  useEffect(() => { fetch() }, [])

  // Derived filter options
  const units = useMemo(() => [...new Set(rows.map((r) => r.Unit).filter(Boolean))].sort(), [rows])
  const pembelis = useMemo(() => [...new Set(rows.map((r) => r.Mitra_Pembeli).filter(Boolean))].sort(), [rows])
  const komoditas = useMemo(() => [...new Set(rows.map((r) => r.Komoditi).filter(Boolean))].sort(), [rows])
  const jenisKomoditas = useMemo(() => [...new Set(rows.map((r) => r.Deskripsi_Produk).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => filterLaporanRows(rows, filters), [rows, filters])
  const summary = useMemo(() => calculateLaporanSummary(filtered), [filtered])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const dateA = new Date(a.Raw_Date || a.Billing_Date || 0).getTime()
      const dateB = new Date(b.Raw_Date || b.Billing_Date || 0).getTime()
      return filters.sort === 'DESC' ? dateB - dateA : dateA - dateB
    })
    return arr
  }, [filtered, filters.sort])

  // SAP field save
  const handleSapSave = async (noDo: string, field: string, value: string) => {
    if (!value.trim()) return
    try {
      await updateSapField(noDo, field, value)
      addNotification(`${field} tersimpan`, 'success')
    } catch {
      addNotification('Gagal menyimpan', 'error')
    }
  }

  // Bypass delete
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

  // Excel export
  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(sorted)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan')
    XLSX.writeFile(wb, 'Laporan_Digital.xlsx')
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2 -mt-2 mb-2">
        <Button variant="outline" size="sm" onClick={fetch} className="gap-1">
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button variant="secondary" size="sm" onClick={handleExportExcel} className="gap-1">
          <Download size={14} /> Export Excel
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Cash In" value={formatCurrency(summary.cashIn)} />
        <StatCard label="Total Pendapatan" value={formatCurrency(summary.pendapatan)} />
        <StatCard label="Kekurangan Bayar" value={formatCurrency(summary.sisaBayar)} />
        <StatCard
          label="Sisa Barang (DO)"
          value={formatNumber(summary.sisaVolume)}
          subtitle={`Butir: ${formatNumber(summary.sisaVolumeButir)}`}
        />
        <StatCard
          label="Harga Rata-Rata (excl. PPN)"
          value={`${formatCurrency(summary.hargaRataKg)}/Kg`}
          subtitle={`${formatCurrency(summary.hargaRataButir)}/Butir`}
        />
        <StatCard
          label="Barang Terkirim"
          value={formatNumber(summary.barangTerkirimKg)}
          subtitle={`Butir: ${formatNumber(summary.barangTerkirimButir)}`}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SearchInput
            value={filters.search}
            onChange={(v) => setFilters((f) => ({ ...f, search: v }))}
            placeholder="Cari No DO, No Invoice, No Kontrak, Pembeli, SAP..."
            className="max-w-none w-full"
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            <MultiSelectFilter
              label="Unit"
              allLabel="Semua Unit"
              options={units}
              selected={filters.unit}
              onChange={(unit) => setFilters((f) => ({ ...f, unit }))}
              className="w-full"
            />
            <MultiSelectFilter
              label="Pembeli"
              allLabel="Semua Pembeli"
              options={pembelis}
              selected={filters.pembeli}
              onChange={(pembeli) => setFilters((f) => ({ ...f, pembeli }))}
              className="w-full"
              contentWidth="w-64"
            />
            <MultiSelectFilter
              label="Komoditi"
              allLabel="Semua Komoditi"
              options={komoditas}
              selected={filters.komoditi}
              onChange={(komoditi) => setFilters((f) => ({ ...f, komoditi }))}
              className="w-full"
            />
            <MultiSelectFilter
              label="Material"
              allLabel="Semua Jenis Material"
              options={jenisKomoditas}
              selected={filters.jenisKomoditi}
              onChange={(jenisKomoditi) => setFilters((f) => ({ ...f, jenisKomoditi }))}
              className="w-full"
              contentWidth="w-64"
            />
            <MultiSelectFilter
              label="Bulan"
              allLabel="Semua Bulan"
              options={MONTH_OPTIONS}
              optionLabels={MONTH_LABELS}
              selected={filters.months}
              onChange={(months) => setFilters((f) => ({ ...f, months }))}
              className="w-full"
            />
            <FilterSelect
              value={filters.modeTanggal}
              onChange={(v) => setFilters((f) => ({ ...f, modeTanggal: v as 'TRANSFER' | 'RENCANA' }))}
              options={[
                { value: 'TRANSFER', label: 'Berdasarkan Tgl Transfer' },
                { value: 'RENCANA', label: 'Berdasarkan Rencana Ambil' },
              ]}
            />
            <FilterSelect
              value={filters.sort}
              onChange={(v) => setFilters((f) => ({ ...f, sort: v as 'DESC' | 'ASC' }))}
              options={[
                { value: 'DESC', label: 'Terbaru ke Terlama' },
                { value: 'ASC', label: 'Terlama ke Terbaru' },
              ]}
            />
            <FilterSelect
              value={filters.tipe}
              onChange={(v) => setFilters((f) => ({ ...f, tipe: v as 'ALL' | 'NO_BYPASS' | 'ONLY_BYPASS' }))}
              options={[
                { value: 'ALL', label: 'Semua Data' },
                { value: 'NO_BYPASS', label: 'Sembunyikan Bypass' },
                { value: 'ONLY_BYPASS', label: 'Hanya Bypass' },
              ]}
            />
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
            />
            <FilterSelect
              value={filters.statusBayar}
              onChange={(v) => setFilters((f) => ({ ...f, statusBayar: v }))}
              options={[
                { value: 'ALL', label: 'Semua Status Bayar' },
                { value: 'BELUM', label: 'Belum Bayar' },
                { value: 'SEBAGIAN', label: 'Pembayaran Sebagian' },
                { value: 'LUNAS', label: 'Pembayaran Penuh / Lunas' },
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => setFilters(DEFAULT_LAPORAN_FILTERS)} className="h-9">
              Reset Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton rows={5} cols={8} /> : sorted.length === 0 ? (
            <EmptyState title="Tidak ada data laporan" />
          ) : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="text-xs" style={{ minWidth: '3600px' }}>
                <thead>
                  <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0 z-10">
                    <th className="text-left px-3 py-2">No. DO</th>
                    <th className="text-left px-3 py-2">No Invoice</th>
                    <th className="text-left px-3 py-2">No Kontrak</th>
                    <th className="text-left px-3 py-2">Unit</th>
                    <th className="text-left px-3 py-2">Komoditi</th>
                    <th className="text-center px-3 py-2">Satuan</th>
                    <th className="text-left px-3 py-2">Billing Date</th>
                    <th className="text-left px-3 py-2">Tgl Transfer</th>
                    <th className="text-right px-3 py-2">Jumlah Transfer</th>
                    <th className="text-right px-3 py-2">Pelunasan (Inc. PPh)</th>
                    <th className="text-left px-3 py-2">Mitra Pembeli</th>
                    <th className="text-left px-3 py-2">Jenis Komoditi/Material</th>
                    <th className="text-right px-3 py-2">Jml Invoice</th>
                    <th className="text-right px-3 py-2">Harga Satuan</th>
                    <th className="text-right px-3 py-2">Jumlah DO</th>
                    <th className="text-right px-3 py-2">Pendapatan Pokok</th>
                    <th className="text-right px-3 py-2">Pendapatan Setelah PPN</th>
                    <th className="text-right px-3 py-2">Pajak PPN</th>
                    <th className="text-right px-3 py-2">PPh</th>
                    <th className="text-center px-3 py-2">PPh Setor?</th>
                    <th className="text-right px-3 py-2">Kewajiban (Gross)</th>
                    <th className="text-right px-3 py-2">Sisa Bayar</th>
                    <th className="text-right px-3 py-2">Sisa Volume</th>
                    <th className="text-left px-3 py-2">Bulan Buku</th>
                    <th className="text-left px-3 py-2">Superman</th>
                    <th className="text-left px-3 py-2">Kontrak SAP</th>
                    <th className="text-left px-3 py-2">SO SAP</th>
                    <th className="text-left px-3 py-2">DO SAP</th>
                    <th className="text-left px-3 py-2">Billing</th>
                    <th className="text-left px-3 py-2">Link Deklarasi</th>
                    <th className="text-left px-3 py-2">Berita Acara</th>
                    <th className="text-center px-3 py-2">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map((row, idx) => {
                    const isBypass = row.No_DO.startsWith('BYPASS-')
                    return (
                      <tr key={`${row.No_DO}-${idx}`} className={isBypass ? 'bg-amber-500/10 dark:bg-amber-500/15' : 'hover:bg-muted/60 transition-colors'}>
                        <td className="px-2 py-1.5 font-medium max-w-[180px] whitespace-normal break-words">{row.No_DO}</td>
                        <td className="px-2 py-1.5 max-w-[160px] whitespace-normal break-words">{row.No_Invoice}</td>
                        <td className="px-2 py-1.5 font-medium text-indigo-600 max-w-[200px] whitespace-normal break-words">{row.No_Kontrak}</td>
                        <td className="px-2 py-1.5 max-w-[140px] whitespace-normal break-words">{row.Unit}</td>
                        <td className="px-2 py-1.5 max-w-[120px] whitespace-normal break-words">{row.Komoditi}</td>
                        <td className="px-2 py-1.5 text-center">{row.Satuan}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(row.Billing_Date)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(row.Tanggal_Transfer)}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-600 font-medium whitespace-nowrap">{formatCurrency(row.Jumlah_Transfer)}</td>
                        <td className="px-2 py-1.5 text-right text-blue-600 font-medium whitespace-nowrap">{formatCurrency(row.Pelunasan)}</td>
                        <td className="px-2 py-1.5 max-w-[180px] whitespace-normal break-words">{safe(row.Mitra_Pembeli)}</td>
                        <td className="px-2 py-1.5 max-w-[180px] whitespace-normal break-words">{safe(row.Deskripsi_Produk)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{row.Jumlah_Invoice > 0 ? formatCurrency(row.Jumlah_Invoice) : '-'}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(row.Harga_Satuan)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatNumber(row.Jumlah_DO)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(row.Pendapatan_Pokok)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(row.Pendapatan_Setelah_PPN)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(row.Pajak_PPN)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(row.PPh_Nominal)}</td>
                        <td className="px-2 py-1.5 text-center">
                          {row.PPh_Setor === 'Disetor' ? <span className="text-green-600">✓ Disetor</span> : '-'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{formatCurrency(row.Kewajiban_Pembayaran)}</td>
                        <td className={`px-2 py-1.5 text-right font-bold whitespace-nowrap ${(row.Sisa_Pembayaran || 0) <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(row.Sisa_Pembayaran || 0) <= 0 ? 'Lunas' : formatCurrency(row.Sisa_Pembayaran)}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-bold whitespace-nowrap ${(row.Sisa_Volume || 0) <= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                          {(row.Sisa_Volume || 0) <= 0 ? 'Selesai' : formatNumber(row.Sisa_Volume)}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{row.Bulan_Buku}</td>
                        {/* SAP fields - editable */}
                        {(['Superman', 'Kontrak_SAP', 'SO_SAP', 'DO_SAP', 'Billing'] as const).map((field) => (
                          <td key={field} className="px-1 py-1">
                            <input
                              className="w-full text-xs border border-transparent hover:border-border rounded px-1 py-0.5 bg-transparent text-foreground focus:border-ring focus:outline-none"
                              defaultValue={row[field] || ''}
                              onBlur={(e) => {
                                if (e.target.value !== (row[field] || '')) {
                                  handleSapSave(row.No_DO, field, e.target.value)
                                }
                              }}
                              placeholder="-"
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <div className="flex flex-col gap-0.5 min-w-[140px]">
                            {(row.Link_Deklarasi_Penerimaan || '').startsWith('http') && (
                              <a
                                href={row.Link_Deklarasi_Penerimaan!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                Buka Link
                              </a>
                            )}
                            <input
                              className="flex-1 min-w-[120px] text-xs border border-transparent hover:border-border rounded px-1 py-0.5 bg-transparent text-foreground focus:border-ring focus:outline-none"
                              defaultValue={row.Link_Deklarasi_Penerimaan || ''}
                              onBlur={(e) => {
                                if (e.target.value !== (row.Link_Deklarasi_Penerimaan || '')) {
                                  handleSapSave(row.No_DO, 'Link_Deklarasi_Penerimaan', e.target.value)
                                }
                              }}
                              placeholder="-"
                            />
                            {!isBypass && (
                              <DocumentUpload
                                compact
                                entityType="do"
                                entityId={row.No_DO}
                                docType="deklarasi"
                                onUploaded={() => fetch()}
                              />
                            )}
                            {isBypass && (
                              <DocumentUpload
                                compact
                                entityType="bypass"
                                entityId={row.No_DO.replace('BYPASS-', '')}
                                docType="deklarasi"
                                onUploaded={() => fetch()}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex flex-col gap-0.5 min-w-[140px]">
                            {(row.Link_Berita_Acara_Serah_Terima || '').startsWith('http') && (
                              <a
                                href={row.Link_Berita_Acara_Serah_Terima!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                Buka Link
                              </a>
                            )}
                            {!isBypass && (
                              <>
                                <input
                                  className="flex-1 min-w-[120px] text-xs border border-transparent hover:border-border rounded px-1 py-0.5 bg-transparent text-foreground focus:border-ring focus:outline-none"
                                  defaultValue={row.Link_Berita_Acara_Serah_Terima || ''}
                                  onBlur={(e) => {
                                    if (e.target.value !== (row.Link_Berita_Acara_Serah_Terima || '')) {
                                      handleSapSave(row.No_DO, 'Link_Berita_Acara_Serah_Terima', e.target.value)
                                    }
                                  }}
                                  placeholder="-"
                                />
                                <DocumentUpload
                                  compact
                                  entityType="do"
                                  entityId={row.No_DO}
                                  docType="berita_acara"
                                  onUploaded={() => fetch()}
                                />
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {isBypass ? (
                            <div className="flex gap-1 justify-center">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                                const id = parseInt(row.No_DO.replace('BYPASS-', ''))
                                window.location.href = `/bypass?edit=${id}`
                              }}>Edit</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => {
                                setDeleteTarget(row.No_DO)
                                setDeleteId(parseInt(row.No_DO.replace('BYPASS-', '')))
                              }}>Hapus</Button>
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
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
