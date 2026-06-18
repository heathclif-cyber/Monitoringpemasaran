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
  const showLabel = width > 56 && height > 40
  const showValue = width > 72 && height > 56

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="hsl(var(--background))"
        strokeWidth={2}
        rx={4}
        className="transition-opacity hover:opacity-90"
      />
      {showLabel && (
        <>
          <text
            x={x + 6}
            y={y + 14}
            fill="#fff"
            fontSize={10}
            fontWeight={600}
            pointerEvents="none"
          >
            {unit.length > 14 ? `${unit.slice(0, 13)}…` : unit}
          </text>
          <text
            x={x + 6}
            y={y + 26}
            fill="rgba(255,255,255,0.9)"
            fontSize={9}
            pointerEvents="none"
          >
            {name.length > 18 ? `${name.slice(0, 17)}…` : name}
          </text>
        </>
      )}
      {showValue && (
        <text
          x={x + 6}
          y={y + height - 8}
          fill="#fff"
          fontSize={11}
          fontWeight={700}
          pointerEvents="none"
        >
          {formatNumber(saldo)} {satuan}
        </text>
      )}
    </g>
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
      <div className="h-[220px] w-full rounded-lg border bg-muted/20 overflow-hidden">
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