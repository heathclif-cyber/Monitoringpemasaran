import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCurrencyDec(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  // Handle YYYY-MM-DD format
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  const MONTHS_ID = [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ]
  return `${parseInt(d)} ${MONTHS_ID[parseInt(m)]} ${y}`
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0'
  return new Intl.NumberFormat('id-ID').format(value)
}

export function formatNumberDec(value: number | null | undefined): string {
  if (value == null) return '0,00'
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function parseLocaleFloat(str: string | null | undefined): number {
  if (!str) return 0
  let clean = String(str).replace(/\s/g, '')
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.')
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.')
  }
  return parseFloat(clean) || 0
}

export function safe(v: unknown, fb = '-'): string {
  if (v == null) return fb
  const s = String(v).trim()
  return s || fb
}

export function formatBulan(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const [y, m] = dateStr.split('-')
  if (!y || !m) return dateStr
  const MONTHS_ID = [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ]
  return `${MONTHS_ID[parseInt(m)]} ${y}`
}

export function formatShortNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} M`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} jt`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} rb`
  return value.toString()
}
