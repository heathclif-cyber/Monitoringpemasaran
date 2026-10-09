import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import type { LaporanRow, PiutangRow } from '@/types'

export function InvoiceOutstanding({ row, balances, mode = 'combined' }: { row: LaporanRow; balances: PiutangRow[] | null; mode?: 'combined' | 'shortfall' | 'status' }) {
  if (row.No_DO.startsWith('BYPASS-') || !row.No_Invoice || row.No_Invoice === '-') return <span>—</span>
  if (!balances) return <span className="text-xs text-muted-foreground">Rincian sisa belum tersedia</span>
  const balance = balances.find((item) => item.no_invoice === row.No_Invoice)
  const shortfall = balance?.piutang_pokok ?? 0
  const withholding = balance?.piutang_pph_belum_setor ?? 0
  if (mode === 'shortfall') return <span className={shortfall > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}>{formatCurrency(shortfall)}</span>
  if (mode === 'status') {
    if (row.PPh_Persen === 0) return <Badge variant="secondary">Tidak berlaku</Badge>
    if (row.PPh_Persen === undefined) return <Badge variant="secondary">Belum diketahui</Badge>
    const marked = withholding === 0 && (!balance || balance.total_dibayar_efektif > 0)
    return <div className="space-y-1 text-xs min-w-[160px]">
      <Badge variant={marked ? 'secondary' : 'warning'}>{marked ? 'Sudah ditandai setor' : 'Belum ditandai setor'}</Badge>
      {withholding > 0 && <p className="tabular-nums text-muted-foreground">PPh tertunda: {formatCurrency(withholding)}</p>}
      <p className="text-[10px] text-muted-foreground">Manual · belum diverifikasi</p>
    </div>
  }
  return <div className="space-y-1 text-xs min-w-[210px]">
    <p className={shortfall > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}>Kurang bayar: {formatCurrency(shortfall)}</p>
    <p className="text-muted-foreground">PPh belum ditandai setor: {formatCurrency(withholding)}</p>
    <Badge variant={shortfall > 0 || withholding > 0 ? 'warning' : 'secondary'}>
      {shortfall > 0 && withholding > 0 ? 'Kurang bayar + PPh' : shortfall > 0 ? 'Kurang bayar' : withholding > 0 ? 'Transfer cukup · PPh tertunda' : 'Tidak ada sisa tercatat'}
    </Badge>
    <p className="text-[10px] text-muted-foreground">Per invoice · status setor manual, bukan verifikasi bukti</p>
  </div>
}
