export const TAX_RATE_PPN_DEFAULT = 11.0
export const TAX_RATE_PPH_DEFAULT = 0.25

export function isPayungBA(tipeAlur?: string | null): boolean {
  return String(tipeAlur || 'STANDAR').toUpperCase() === 'PAYUNG_BA'
}

export interface PricingResult {
  pokok: number
  nominalPpn: number
  nominalPph: number
  nilaiTransaksi: number
  totalTagihan: number
}

export function calculateKontrakPricing(
  volume: number,
  hargaSatuan: number,
  premi: number,
  isPpn: string,
  ppnPersen: number,
  isPph: string,
  pphPersen: number,
): PricingResult {
  const pokok = volume * hargaSatuan + premi
  const nominalPpn = isPpn === 'true' ? pokok * (ppnPersen / 100) : 0
  const nominalPph = isPph === 'true' ? pokok * (pphPersen / 100) : 0
  const nilaiTransaksi = pokok + nominalPpn
  const totalTagihan = nilaiTransaksi - nominalPph

  return { pokok, nominalPpn, nominalPph, nilaiTransaksi, totalTagihan }
}

export function calculateJatuhTempo(tanggalKontrak: string, lamaBayarHari: number): string {
  if (!tanggalKontrak) return ''
  const d = new Date(tanggalKontrak)
  d.setDate(d.getDate() + (lamaBayarHari || 15))
  return d.toISOString().split('T')[0]
}

export function generateSyaratSyarat(lamaBayarHari: number, ambilHari: number): string {
  const lama = lamaBayarHari || 15
  const ambil = ambilHari || 15
  return [
    `a. Pembayaran dilaksanakan selambat-lambatnya ${lama} hari kalender setelah ditandatanganinya Kontrak penjualan`,
    `b. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran`,
    `c. Pengambilan barang selambat-lambatnya ${ambil} hari kalender dari batas akhir tanggal pembayaran`,
    `d. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli`,
  ].join('\n')
}

export const DEFAULT_SYARAT =
  'a. Pembayaran dilaksanakan selambat-lambatnya 15 hari kalender setelah ditandatanganinya Kontrak penjualan\nb. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran\nc. Pengambilan barang selambat-lambatnya 15 hari kalender dari batas akhir tanggal pembayaran\nd. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli'

export const DEFAULT_KETENTUAN =
  'Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)'

export const DEFAULT_PEMILIK_KOMODITAS = 'PT Perkebunan Nusantara I Regional 8'

export const DEFAULT_PENJUAL =
  'PT Perkebunan Nusantara I Regional 8\nJalan Urip Sumoharjo No. 72-76, Kota Makassar'
