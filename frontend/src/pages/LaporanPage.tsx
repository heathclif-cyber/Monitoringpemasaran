import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download, Search } from 'lucide-react'
import { useLaporanStore } from '@/store/laporanStore'
import { useAppStore } from '@/store/appStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { StatCard } from '@/components/common/StatCard'
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
import * as XLSX from 'xlsx'

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export default function LaporanPage() {
  const { rows, isLoading, fetch, updateSapField, deleteBypass } = useLaporanStore()
  const { addNotification } = useAppStore()
  const [filters, setFilters] = useState<LaporanFilters>(DEFAULT_LAPORAN_FILTERS)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showMonths, setShowMonths] = useState(false)

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

  const handleToggleAllMonths = () => {
    if (filters.months.length === 12) {
      setFilters((f) => ({ ...f, months: [] }))
    } else {
      setFilters((f) => ({
        ...f,
        months: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
      }))
    }
  }

  const handleToggleMonth = (m: string) => {
    setFilters((f) => ({
      ...f,
      months: f.months.includes(m) ? f.months.filter((x) => x !== m) : [...f.months, m],
    }))
  }

  const selCls = 'h-9 rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm'

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-900">Rekapitulasi Laporan Terintegrasi</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetch} className="gap-1">
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportExcel} className="gap-1">
            <Download size={14} /> Export Excel
          </Button>
        </div>
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
          {/* Search bar — full width */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Cari No DO, No Invoice, No Kontrak, Pembeli, SAP..."
              className="h-9 w-full rounded-md border border-input bg-white pl-9 pr-8 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {filters.search && (
              <button
                onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-base leading-none"
              >
                ×
              </button>
            )}
          </div>
          {/* Dropdown filters — grid 4 kolom */}
          <div className="grid grid-cols-4 gap-2">
            <select value={filters.unit} onChange={(e) => setFilters((f) => ({ ...f, unit: e.target.value }))} className={selCls}>
              <option value="ALL">Semua Unit</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={filters.pembeli} onChange={(e) => setFilters((f) => ({ ...f, pembeli: e.target.value }))} className={selCls}>
              <option value="ALL">Semua Pembeli</option>
              {pembelis.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filters.komoditi} onChange={(e) => setFilters((f) => ({ ...f, komoditi: e.target.value }))} className={selCls}>
              <option value="ALL">Semua Komoditi</option>
              {komoditas.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select value={filters.jenisKomoditi} onChange={(e) => setFilters((f) => ({ ...f, jenisKomoditi: e.target.value }))} className={selCls}>
              <option value="ALL">Semua Jenis Komoditi/Material</option>
              {jenisKomoditas.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>

            <select value={filters.modeTanggal} onChange={(e) => setFilters((f) => ({ ...f, modeTanggal: e.target.value as 'TRANSFER' | 'RENCANA' }))} className={selCls}>
              <option value="TRANSFER">Berdasarkan Tgl Transfer</option>
              <option value="RENCANA">Berdasarkan Rencana Ambil</option>
            </select>
            {/* Month multi-select */}
            <div className="relative">
              <button type="button" onClick={() => setShowMonths(!showMonths)} className={`${selCls} w-full text-left`}>
                {filters.months.length === 0 ? 'Semua Bulan' : filters.months.length === 1 ? MONTHS_ID[parseInt(filters.months[0])] : `${filters.months.length} Bulan Terpilih`}
              </button>
              {showMonths && (
                <div className="absolute z-20 mt-1 bg-white border rounded-md shadow-lg p-2 w-48 max-h-60 overflow-y-auto"
                  onMouseLeave={() => setShowMonths(false)}
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setShowMonths(false) }}>
                  <label className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                    <input type="checkbox" checked={filters.months.length === 12} onChange={handleToggleAllMonths} />
                    Pilih Semua
                  </label>
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = String(i + 1).padStart(2, '0')
                    return (
                      <label key={m} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                        <input type="checkbox" checked={filters.months.includes(m)} onChange={() => handleToggleMonth(m)} />
                        {MONTHS_ID[i + 1]}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as 'DESC' | 'ASC' }))} className={selCls}>
              <option value="DESC">Terbaru ke Terlama</option>
              <option value="ASC">Terlama ke Terbaru</option>
            </select>
            <select value={filters.tipe} onChange={(e) => setFilters((f) => ({ ...f, tipe: e.target.value as 'ALL' | 'NO_BYPASS' | 'ONLY_BYPASS' }))} className={selCls}>
              <option value="ALL">Semua Data</option>
              <option value="NO_BYPASS">Sembunyikan Bypass</option>
              <option value="ONLY_BYPASS">Hanya Bypass</option>
            </select>

            <select value={filters.sap} onChange={(e) => setFilters((f) => ({ ...f, sap: e.target.value }))} className={selCls}>
              <option value="ALL">Semua Status SAP</option>
              <option value="MISSING_SAP">Belum Lengkap</option>
              <option value="NO_KONTRAK_SAP">Tanpa Kontrak SAP</option>
              <option value="NO_SO_SAP">Tanpa SO SAP</option>
              <option value="NO_DO_SAP">Tanpa DO SAP</option>
              <option value="NO_BILLING_SAP">Tanpa Billing SAP</option>
              <option value="ALL_COMPLETE">Sudah Lengkap</option>
            </select>
            <select value={filters.statusBayar} onChange={(e) => setFilters((f) => ({ ...f, statusBayar: e.target.value }))} className={selCls}>
              <option value="ALL">Semua Status Bayar</option>
              <option value="BELUM">Belum Bayar</option>
              <option value="SEBAGIAN">Pembayaran Sebagian</option>
              <option value="LUNAS">Pembayaran Penuh / Lunas</option>
            </select>
            <div className="flex items-center">
              <Button variant="outline" size="sm" onClick={() => setFilters(DEFAULT_LAPORAN_FILTERS)} className="w-full">
                Reset Filter
              </Button>
            </div>
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
                  <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0 z-10">
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
                    <th className="text-center px-3 py-2">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map((row, idx) => {
                    const isBypass = row.No_DO.startsWith('BYPASS-')
                    return (
                      <tr key={`${row.No_DO}-${idx}`} className={isBypass ? 'bg-amber-50/30' : 'hover:bg-gray-50 transition-colors'}>
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
                              className="w-full text-xs border border-transparent hover:border-slate-200 rounded px-1 py-0.5 bg-transparent focus:border-blue-300 focus:outline-none"
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
                          <div className="flex flex-col gap-0.5">
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
                              className="flex-1 min-w-[120px] text-xs border border-transparent hover:border-slate-200 rounded px-1 py-0.5 bg-transparent focus:border-blue-300 focus:outline-none"
                              defaultValue={row.Link_Deklarasi_Penerimaan || ''}
                              onBlur={(e) => {
                                if (e.target.value !== (row.Link_Deklarasi_Penerimaan || '')) {
                                  handleSapSave(row.No_DO, 'Link_Deklarasi_Penerimaan', e.target.value)
                                }
                              }}
                              placeholder="-"
                            />
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
