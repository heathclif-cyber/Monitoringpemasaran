import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, RefreshCw, Wallet } from 'lucide-react'
import { usePiutangStore } from '@/store/piutangStore'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { PageShell, PageHeader, FilterToolbar, StatPills, ListPanel, StatusPill } from '@/components/patterns'
import { cn, formatCurrency, formatDate, safe } from '@/lib/utils'
import { exportPiutangExcel } from '@/utils/piutangExport'
import type { PiutangRow, PiutangSummary } from '@/types'

type KategoriFilter = 'ALL' | 'pokok' | 'pph_belum_setor'

const KATEGORI_LABEL: Record<KategoriFilter, string> = {
  ALL: 'Semua',
  pokok: 'Piutang Pokok',
  pph_belum_setor: 'PPh Belum Setor',
}

export default function PiutangPage() {
  const { data, isLoading, fetch } = usePiutangStore()
  const { addNotification } = useAppStore()
  const [mitraFilter, setMitraFilter] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState<KategoriFilter>('ALL')
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    fetch()
  }, [fetch])

  const rows = data?.rows ?? []
  const summary = data?.summary

  const mitraOptions = useMemo(
    () => (data?.mitra ?? []).map((m) => ({ value: m, label: m })),
    [data?.mitra],
  )

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (mitraFilter && r.mitra !== mitraFilter) return false
      if (kategoriFilter !== 'ALL' && !r.kategori.includes(kategoriFilter)) return false
      return true
    })
  }, [rows, mitraFilter, kategoriFilter])

  const filteredSummary = useMemo<PiutangSummary>(() => {
    return {
      total_invoice_outstanding: filteredRows.length,
      total_piutang_pokok: filteredRows.reduce((s, r) => s + r.piutang_pokok, 0),
      total_piutang_pph_belum_setor: filteredRows.reduce((s, r) => s + r.piutang_pph_belum_setor, 0),
      jumlah_invoice_pokok: filteredRows.filter((r) => r.kategori.includes('pokok')).length,
      jumlah_invoice_pph_belum_setor: filteredRows.filter((r) => r.kategori.includes('pph_belum_setor')).length,
      jumlah_mitra_terdampak: new Set(filteredRows.map((r) => r.mitra)).size,
      by_mitra: [],
    }
  }, [filteredRows])

  const handleExport = async () => {
    if (filteredRows.length === 0) {
      addNotification('Tidak ada data piutang untuk diekspor pada filter ini', 'error')
      return
    }
    setIsExporting(true)
    try {
      const stamp = new Intl.DateTimeFormat('sv-SE').format(new Date())
      await exportPiutangExcel(
        filteredRows,
        filteredSummary,
        {
          mitra: mitraFilter || 'Semua mitra',
          kategori: KATEGORI_LABEL[kategoriFilter],
        },
        `Monitoring_Piutang_${stamp}.xlsx`,
      )
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'Gagal export Excel', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <PageShell density="compact">
      <PageHeader
        title="Monitoring Piutang"
        description="Piutang pokok yang belum lunas dan termin PPh yang belum dikonfirmasi setor pembeli"
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => fetch()}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Muat Ulang
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleExport}
              disabled={isExporting || filteredRows.length === 0}
            >
              {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Export Excel
            </Button>
          </div>
        }
      />

      <StatPills
        items={[
          { label: 'Total Piutang Pokok', value: formatCurrency(summary?.total_piutang_pokok ?? 0), tone: 'danger' },
          {
            label: 'Total Piutang PPh Belum Setor',
            value: formatCurrency(summary?.total_piutang_pph_belum_setor ?? 0),
            tone: 'warning',
          },
          { label: 'Mitra Terdampak', value: summary?.jumlah_mitra_terdampak ?? 0 },
          { label: 'Invoice Terdampak', value: summary?.total_invoice_outstanding ?? 0 },
        ]}
      />

      <FilterToolbar>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Mitra</Label>
          <SearchableSelect
            options={mitraOptions}
            value={mitraFilter}
            onChange={setMitraFilter}
            placeholder="Cari / pilih mitra..."
            className="h-8 w-56 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Jenis Piutang</Label>
          <NativeSelect
            value={kategoriFilter}
            onChange={(e) => setKategoriFilter(e.target.value as KategoriFilter)}
            className="h-8 w-auto min-w-40 text-xs"
          >
            <option value="ALL">Semua</option>
            <option value="pokok">Piutang Pokok</option>
            <option value="pph_belum_setor">PPh Belum Setor</option>
          </NativeSelect>
        </div>
      </FilterToolbar>

      <ListPanel
        loading={isLoading && rows.length === 0}
        empty={!isLoading && filteredRows.length === 0}
        emptyIcon={Wallet}
        emptyTitle="Tidak ada piutang"
        emptyDescription="Semua invoice pada filter ini sudah lunas dan PPh sudah dikonfirmasi setor."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10 border-b">
              <tr className="text-muted-foreground">
                <th className="text-left py-2.5 px-3 font-medium">No Invoice</th>
                <th className="text-left py-2.5 px-2 font-medium hidden lg:table-cell">No Kontrak</th>
                <th className="text-left py-2.5 px-2 font-medium">Mitra</th>
                <th className="text-left py-2.5 px-2 font-medium hidden md:table-cell">Komoditi / Unit</th>
                <th className="text-left py-2.5 px-2 font-medium hidden sm:table-cell">Tanggal</th>
                <th className="text-right py-2.5 px-2 font-medium">Jumlah Pembayaran</th>
                <th className="text-right py-2.5 px-2 font-medium">Piutang Pokok</th>
                <th className="text-right py-2.5 px-2 font-medium">PPh Belum Setor</th>
                <th className="text-left py-2.5 px-2 font-medium">Kategori</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row: PiutangRow) => (
                <tr key={row.row_key} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-2.5 px-3 font-medium text-foreground">{row.no_invoice}</td>
                  <td className="py-2.5 px-2 hidden lg:table-cell text-muted-foreground">{row.no_kontrak}</td>
                  <td className="py-2.5 px-2">{safe(row.mitra)}</td>
                  <td className="py-2.5 px-2 hidden md:table-cell max-w-[160px]">
                    <div className="truncate">{safe(row.komoditi)}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{safe(row.unit)}</div>
                  </td>
                  <td className="py-2.5 px-2 hidden sm:table-cell text-muted-foreground">
                    {row.tanggal_invoice ? formatDate(row.tanggal_invoice) : '-'}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    {formatCurrency(row.jumlah_pembayaran)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 px-2 text-right tabular-nums',
                      row.piutang_pokok > 0 && 'font-semibold text-red-600 dark:text-red-400',
                    )}
                  >
                    {row.piutang_pokok > 0 ? formatCurrency(row.piutang_pokok) : '-'}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 px-2 text-right tabular-nums',
                      row.piutang_pph_belum_setor > 0 && 'font-semibold text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {row.piutang_pph_belum_setor > 0 ? formatCurrency(row.piutang_pph_belum_setor) : '-'}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex flex-wrap gap-1">
                      {row.kategori.includes('pokok') && <StatusPill tone="danger">Pokok</StatusPill>}
                      {row.kategori.includes('pph_belum_setor') && (
                        <StatusPill tone="warning">PPh Belum Setor</StatusPill>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListPanel>
    </PageShell>
  )
}
