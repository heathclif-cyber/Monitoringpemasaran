import { useMemo } from 'react'
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts'
import type { StokSaldo } from '@/types'
import { cn, formatNumber } from '@/lib/utils'

interface StokSaldoHeatmapProps {
  saldos: StokSaldo[]
  className?: string
}

interface TreemapNode {
  name: string
  unit: string
  saldo: number
  satuan: string
  size: number
  fill: string
}

function heatFill(saldo: number, maxAbs: number): string {
  const t = Math.min(Math.abs(saldo) / maxAbs, 1)
  if (saldo > 0) {
    const g = Math.round(120 + t * 80)
    return `rgb(16, ${g}, 90)`
  }
  if (saldo < 0) {
    const r = Math.round(160 + t * 75)
    return `rgb(${r}, 45, 45)`
  }
  return 'hsl(var(--muted))'
}

function buildNodes(items: StokSaldo[]): TreemapNode[] {
  if (items.length === 0) return []
  const maxAbs = Math.max(...items.map((s) => Math.abs(s.saldo)), 1)
  const minSize = maxAbs * 0.04

  return items
    .map((s) => ({
      name: s.jenis_material?.trim() || '(tanpa nama)',
      unit: s.unit,
      saldo: s.saldo,
      satuan: s.satuan,
      size: Math.max(Math.abs(s.saldo), minSize),
      fill: heatFill(s.saldo, maxAbs),
    }))
    .sort((a, b) => b.size - a.size)
}

interface TreemapContentProps {
  x?: number
  y?: number
  width?: number
  height?: number
  name?: string
  unit?: string
  saldo?: number
  satuan?: string
  fill?: string
}

const LABEL_STYLE = {
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  fontWeight: 500 as const,
  letterSpacing: '0.01em',
  paintOrder: 'stroke' as const,
  stroke: 'rgba(0,0,0,0.5)',
  strokeWidth: 2,
  strokeLinejoin: 'round' as const,
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return maxChars <= 3 ? text.slice(0, maxChars) : `${text.slice(0, maxChars - 1)}…`
}

function shortUnit(unit: string): string {
  const seg = unit.split('-')[0]?.trim() || unit
  return seg.length > 10 ? `${seg.slice(0, 9)}…` : seg
}

function shortMaterial(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 3) return `${words[0]} ${words[1]}…`
  if (name.length > 14) return `${name.slice(0, 13)}…`
  return name
}

function compactSaldo(saldo: number, satuan: string, compact: boolean): string {
  const sign = saldo < 0 ? '−' : ''
  const abs = Math.abs(saldo)
  const suf = satuan === 'Butir' ? ' Btr' : ' Kg'
  if (compact) {
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} jt`
    if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)} rb`
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)} rb`
    return `${sign}${Math.round(abs)}${satuan === 'Butir' ? ' B' : ''}`
  }
  return `${formatNumber(saldo)} ${satuan}`
}

type LabelTier = 'large' | 'medium' | 'small' | 'tiny'

function getLabelTier(rw: number, rh: number): LabelTier | null {
  if (rw < 14 || rh < 12) return null
  if (rw >= 96 && rh >= 64) return 'large'
  if (rw >= 64 && rh >= 40) return 'medium'
  if (rw >= 40 && rh >= 26) return 'small'
  return 'tiny'
}

function CellText({
  x,
  y,
  lines,
  fontSize,
  anchor = 'start',
  lineHeight = 1.25,
}: {
  x: number
  y: number
  lines: string[]
  fontSize: number
  anchor?: 'start' | 'middle'
  lineHeight?: number
}) {
  const startY = anchor === 'middle'
    ? y - ((lines.length - 1) * fontSize * lineHeight) / 2
    : y

  return (
    <text
      x={x}
      y={startY}
      fill="#ffffff"
      fontSize={fontSize}
      textAnchor={anchor}
      dominantBaseline="hanging"
      pointerEvents="none"
      style={LABEL_STYLE}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : fontSize * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

function TreemapCell({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = '',
  unit = '',
  saldo = 0,
  satuan = 'Kg',
  fill = '#ccc',
}: TreemapContentProps) {
  const rx = Math.round(x)
  const ry = Math.round(y)
  const rw = Math.round(width)
  const rh = Math.round(height)
  const tier = getLabelTier(rw, rh)
  const maxChars = Math.max(4, Math.floor(rw / (tier === 'tiny' ? 5.5 : 6.5)))

  let lines: string[] = []
  let fontSize = 9
  let anchor: 'start' | 'middle' = 'start'
  let tx = rx + 6
  let ty = ry + 12

  if (tier === 'large') {
    fontSize = 11
    lines = [
      truncateText(unit, maxChars),
      truncateText(name, maxChars),
      compactSaldo(saldo, satuan, false),
    ]
    ty = ry + 14
  } else if (tier === 'medium') {
    fontSize = 10
    lines = [
      truncateText(shortUnit(unit), maxChars),
      truncateText(shortMaterial(name), maxChars),
      compactSaldo(saldo, satuan, true),
    ]
    ty = ry + 12
  } else if (tier === 'small') {
    fontSize = 9
    anchor = 'middle'
    tx = rx + rw / 2
    ty = ry + rh / 2
    lines = [
      truncateText(`${shortUnit(unit)} · ${shortMaterial(name)}`, maxChars),
      compactSaldo(saldo, satuan, true),
    ]
  } else if (tier === 'tiny') {
    fontSize = 8
    anchor = 'middle'
    tx = rx + rw / 2
    ty = ry + rh / 2
    const mat = shortMaterial(name).split(' ')[0] || name.slice(0, 4)
    lines = rw >= 28
      ? [truncateText(mat, maxChars), compactSaldo(saldo, satuan, true)]
      : [compactSaldo(saldo, satuan, true)]
  }

  return (
    <g>
      <rect
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        fill={fill}
        stroke="hsl(var(--background))"
        strokeWidth={2}
        rx={4}
        className="transition-opacity hover:opacity-90"
      />
      {tier && lines.length > 0 && (
        <CellText x={tx} y={ty} lines={lines} fontSize={fontSize} anchor={anchor} />
      )}
    </g>
  )
}

function SaldoRanking({ nodes, limit = 6 }: { nodes: TreemapNode[]; limit?: number }) {
  const top = nodes.slice(0, limit)
  const maxSize = top[0]?.size ?? 1

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {top.map((n, i) => (
        <li
          key={`${n.unit}-${n.name}`}
          className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 min-w-0"
        >
          <span className="text-[10px] font-medium text-muted-foreground w-4 shrink-0 tabular-nums">
            {i + 1}.
          </span>
          <span
            className="h-2.5 shrink-0 rounded-full"
            style={{
              width: `${Math.max(12, Math.round((n.size / maxSize) * 40))}px`,
              background: n.fill,
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate leading-tight">
              {n.unit} · {n.name}
            </p>
            <p className={cn(
              'text-xs tabular-nums leading-tight',
              n.saldo <= 0 ? 'text-red-600' : 'text-emerald-700',
            )}>
              {formatNumber(n.saldo)} {n.satuan}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function SaldoTooltip({ active, payload }: { active?: boolean; payload?: { payload: TreemapNode }[] }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-popover-foreground">{d.unit}</p>
      <p className="text-muted-foreground">{d.name}</p>
      <p className={cn('font-bold mt-1', d.saldo <= 0 ? 'text-red-600' : 'text-emerald-700')}>
        {formatNumber(d.saldo)} {d.satuan}
      </p>
    </div>
  )
}

function SatuanHeatmap({ title, items }: { title: string; items: StokSaldo[] }) {
  const nodes = useMemo(() => buildNodes(items), [items])
  const top = nodes[0]

  if (nodes.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        {top && (
          <p className="text-[10px] text-muted-foreground truncate">
            Terbesar: <span className="font-medium text-foreground">{top.unit} · {top.name}</span>
            {' '}({formatNumber(top.saldo)} {top.satuan})
          </p>
        )}
      </div>
      <div className="h-[260px] w-full rounded-lg border bg-muted/20 overflow-hidden [&_svg]:overflow-visible">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={nodes}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="hsl(var(--background))"
            content={<TreemapCell />}
            isAnimationActive={false}
          >
            <Tooltip content={<SaldoTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-[10px] font-medium text-muted-foreground mb-1.5">
          Semua persediaan (terbesar → terkecil) — kotak kecil di peta pakai label singkat
        </p>
        <SaldoRanking nodes={nodes} limit={nodes.length} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: heatFill(1, 1) }} />
          Persediaan positif (semakin gelap = semakin besar)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: heatFill(-1, 1) }} />
          Persediaan negatif / minus
        </span>
        <span>Luas kotak ∝ jumlah persediaan</span>
      </div>
    </div>
  )
}

export function StokSaldoHeatmap({ saldos, className }: StokSaldoHeatmapProps) {
  const bySatuan = useMemo(() => {
    const kg = saldos.filter((s) => s.satuan !== 'Butir')
    const butir = saldos.filter((s) => s.satuan === 'Butir')
    return { kg, butir }
  }, [saldos])

  return (
    <div className={cn('space-y-5', className)}>
      <SatuanHeatmap title="Satuan Kg" items={bySatuan.kg} />
      {bySatuan.butir.length > 0 && (
        <SatuanHeatmap title="Satuan Butir" items={bySatuan.butir} />
      )}
    </div>
  )
}