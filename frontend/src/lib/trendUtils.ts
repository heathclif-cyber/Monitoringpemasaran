export interface TrendDelta {
  pct: number
  label: string
}

/** Month-over-month trend from a 12-element monthly array (Jan=0). */
export function calcMonthOverMonthTrend(
  monthlyValues: number[],
  label = 'vs bln lalu',
  referenceYear?: number,
): TrendDelta | undefined {
  const now = new Date()
  const year = referenceYear ?? now.getFullYear()

  if (year > now.getFullYear()) return undefined

  const idx = year < now.getFullYear() ? 11 : now.getMonth()
  const current = monthlyValues[idx] ?? 0
  const previous = idx > 0 ? (monthlyValues[idx - 1] ?? 0) : 0

  if (current === 0 && previous === 0) return undefined
  if (previous === 0) return { pct: current > 0 ? 100 : 0, label }

  const pct = ((current - previous) / Math.abs(previous)) * 100
  return { pct, label }
}

export function formatTrendPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}