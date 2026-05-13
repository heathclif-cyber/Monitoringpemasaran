const ANGKA: Record<number, string> = {
  0: '',
  1: 'Satu',
  2: 'Dua',
  3: 'Tiga',
  4: 'Empat',
  5: 'Lima',
  6: 'Enam',
  7: 'Tujuh',
  8: 'Delapan',
  9: 'Sembilan',
  10: 'Sepuluh',
  11: 'Sebelas',
}

export function angkaTerbilang(n: number): string {
  const num = Math.floor(n)
  if (num < 0) return ''

  if (num <= 11) return ANGKA[num] || ''
  if (num < 20) return `${angkaTerbilang(num - 10)} Belas`
  if (num < 100) {
    const puluhan = Math.floor(num / 10)
    const satuan = num % 10
    return `${ANGKA[puluhan]} Puluh ${angkaTerbilang(satuan)}`.trim()
  }
  if (num < 200) return `Seratus ${angkaTerbilang(num - 100)}`.trim()
  if (num < 1000) {
    const ratusan = Math.floor(num / 100)
    const sisa = num % 100
    return `${ANGKA[ratusan]} Ratus ${angkaTerbilang(sisa)}`.trim()
  }
  if (num < 2000) return `Seribu ${angkaTerbilang(num - 1000)}`.trim()
  if (num < 1_000_000) {
    const ribuan = Math.floor(num / 1000)
    const sisa = num % 1000
    return `${angkaTerbilang(ribuan)} Ribu ${angkaTerbilang(sisa)}`.trim()
  }
  if (num < 1_000_000_000) {
    const jutaan = Math.floor(num / 1_000_000)
    const sisa = num % 1_000_000
    return `${angkaTerbilang(jutaan)} Juta ${angkaTerbilang(sisa)}`.trim()
  }
  if (num < 1_000_000_000_000) {
    const miliaran = Math.floor(num / 1_000_000_000)
    const sisa = num % 1_000_000_000
    return `${angkaTerbilang(miliaran)} Miliar ${angkaTerbilang(sisa)}`.trim()
  }
  return String(num)
}

export function terbilangRupiah(angka: number): string {
  if (angka === 0) return 'Nol Rupiah'
  return `${angkaTerbilang(angka)} Rupiah`
}
