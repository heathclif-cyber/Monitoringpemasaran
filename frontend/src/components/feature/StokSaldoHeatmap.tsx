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
  stroke: 'rgba(0,0,0,0.45)',
  strokeWidth: 2.5,
  strokeLinejoin: 'round' as const,
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
  const showUnit = rw > 88 && rh > 48
  const showMaterial = rw > 100 && rh > 62
  const showValue = rw > 110 && rh > 78

  const unitLabel = unit.length > 16 ? `${unit.slice(0, 15)}…` : unit
  const materialLabel = name.length > 22 ? `${name.slice(0, 21)}…` : name

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
      {showUnit && (
        <text
          x={rx + 8}
          y={ry + 16}
          fill="#ffffff"
          fontSize={11}
          pointerEvents="none"
          style={LABEL_STYLE}
        >
          {unitLabel}
        </text>
      )}
      {showMaterial && (
        <text
          x={rx + 8}
          y={ry + 30}
          fill="rgba(255,255,255,0.95)"
          fontSize={10}
          pointerEvents="none"
          style={LABEL_STYLE}
        >
          {materialLabel}
        </text>
      )}
      {showValue && (
        <text
          x={rx + 8}
          y={ry + rh - 10}
          fill="#ffffff"
          fontSize={12}
          pointerEvents="none"
          style={{ ...LABEL_STYLE, fontWeight: 600 }}
        >
          {formatNumber(saldo)} {satuan}
        </text>
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
        <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Peringkat stok (terbesar)</p>
        <SaldoRanking nodes={nodes} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: heatFill(1, 1) }} />
          Stok positif (semakin gelap = semakin besar)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: heatFill(-1, 1) }} />
          Stok negatif / minus
        </span>
        <span>Luas kotak ∝ jumlah stok</span>
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