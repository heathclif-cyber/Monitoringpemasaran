import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { cn, formatCurrency, formatCurrencyDec, formatDate, formatNumber } from '@/lib/utils'
import type { DocumentFlow } from '@/types'

const routes = { KONTRAK: '/repo/kontrak', BA: '/berita-acara', INVOICE: '/repo/invoice', PEMBAYARAN: '/pembayaran', DO: '/repo/do' }

export function DocumentFlowPanel({ flow, unit }: { flow: DocumentFlow; unit: string }) {
  const nodes = new Map(flow.nodes.map(node => [node.id, node]))
  const targets = new Set(flow.edges.map(edge => edge.target))
  const renderNode = (id: string, parents: string[] = []): React.ReactNode => {
    const node = nodes.get(id)
    if (!node || parents.includes(id)) return null
    const children = flow.edges.filter(edge => edge.source === id)
    return <li key={id} className="space-y-2">
      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{node.kind === 'PEMBAYARAN' ? 'Pembayaran' : node.kind}</Badge>
          <Link to={routes[node.kind]} className="font-medium text-primary break-all hover:underline">{node.number}</Link>
          <Badge variant={node.status === 'Draft' ? 'warning' : 'outline'}>{node.status}</Badge>
        </div>
        <p className="text-muted-foreground tabular-nums">
          {node.date ? formatDate(node.date) : 'Tanggal belum tersedia'}
          {node.volume > 0 && ` · ${formatNumber(node.volume)} ${unit}`}
          {node.amount > 0 && ` · ${formatCurrency(node.amount)}`}
        </p>
        {node.unit_price != null && <p className="text-muted-foreground tabular-nums">Harga: {formatCurrencyDec(node.unit_price)} / {unit} · sebelum PPN</p>}
      </div>
      {children.length > 0 && <ul className={cn('ml-4 border-l border-border pl-4 space-y-2')}>
        {children.map(edge => renderNode(edge.target, [...parents, id]))}
      </ul>}
    </li>
  }
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="text-sm">Document Flow · Alur Dokumen</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-xs text-muted-foreground">{flow.mode === 'PAYUNG_BA'
        ? 'Kontrak payung → BA realisasi → Invoice → Pembayaran → DO'
        : 'Kontrak → Invoice → Pembayaran → DO → BA pengambilan'}</p>
      <ul className="space-y-3">{flow.nodes.filter(node => !targets.has(node.id)).map(node => renderNode(node.id))}</ul>
      {flow.warnings.length > 0 && <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2">
        <p className="font-medium">Perlu diperiksa ({flow.warnings.length})</p>
        <ul className="list-disc pl-4 space-y-1 text-muted-foreground">{flow.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        <p className="text-muted-foreground">Peringatan tidak menghapus atau menggabungkan dokumen.</p>
      </div>}
    </CardContent>
  </Card>
}
