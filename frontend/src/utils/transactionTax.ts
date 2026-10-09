import type { TransactionTaxConclusion, TransactionTaxInput } from '@/types'

/** Existing form data are evidence of what was entered, not proof of legal eligibility. */
export function concludeTransactionTax(input: TransactionTaxInput): TransactionTaxConclusion {
  const goods = `${input.commodity ?? ''} ${input.material ?? ''}`.trim().toLowerCase()
  const sugar = /\bgula\b/.test(goods)
  const livestock = /\bsapi\b|\bternak\b/.test(goods)
  const crop = /kelapa|kopra|karet|lump|crepe|sawit|\btbs\b|tebu/.test(goods)
  const result: TransactionTaxConclusion = {
    category: input.multipleMaterials ? 'Penjualan beberapa material' : sugar ? 'Penjualan gula' : livestock ? 'Penjualan ternak' : crop ? 'Penjualan hasil perkebunan' : goods ? 'Penjualan barang / komoditi' : 'Material belum dipilih',
    indications: [], vat: 'Belum ditentukan dalam isian', withholding: 'Belum ditentukan dalam isian',
    vatAmount: null, withholdingAmount: null, notes: [], references: [],
  }
  const validRate = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100
  if (sugar) result.indications.push('PPN: kandidat pembebasan untuk gula kristal putih tebu yang memenuhi kriteria; jenis gula perlu dipastikan.')
  else if (livestock) result.indications.push('PPN: kandidat pembebasan untuk ternak yang memenuhi kriteria PP 49/2022.')
  else if (crop) result.indications.push('PPN: periksa skema umum nonmewah atau BHPT besaran tertentu sesuai produk dan status/pilihan PKP penjual.')
  if (crop || livestock) result.indications.push('PPh 22: berpotensi berlaku untuk bahan belum melalui manufaktur yang dibeli pemungut industri/eksportir. Peran pembeli dan tujuan pembelian belum ada di isian ini.')
  if (!result.indications.length) result.indications.push('Jenis pajak belum dapat disimpulkan dari material yang tersedia; isian tarif di bawah tetap ditampilkan sebagai data transaksi.')
  const validPrice = typeof input.priceBeforeVat === 'number' && Number.isFinite(input.priceBeforeVat) && input.priceBeforeVat > 0
  if (input.isVat === 'true' && validRate(input.vatRate)) {
    result.vat = `PPN ${input.vatRate}% — sesuai isian kontrak`
    result.vatAmount = validPrice ? input.priceBeforeVat! * input.vatRate! / 100 : null
    if (input.vatRate === 11) result.notes.push('Tarif efektif 11% cocok dengan skema umum nonmewah (12% × DPP nilai lain 11/12); status PKP dan kelayakan objek tetap perlu dipastikan.')
    else if (input.vatRate === 1.1) result.notes.push('Tarif 1,1% mengindikasikan skema BHPT besaran tertentu; tidak membuktikan bahwa PKP penjual telah memilih skema tersebut.')
    else if (input.vatRate === 0) result.notes.push('PPN diaktifkan tetapi tarif nol: periksa isian. Tarif nol berbeda dari PPN dibebaskan.')
    result.references.push({ label: 'Ketentuan PPN', url: 'https://jdih.kemenkeu.go.id/dok/pmk-131-tahun-2024' })
  } else if (input.isVat === 'false') {
    result.vat = 'PPN tidak dikenakan dalam isian kontrak'
    result.vatAmount = validPrice ? 0 : null
    result.notes.push('Isian Non-PPN saja belum membedakan PPN dibebaskan, tidak dipungut, atau bukan objek PPN.')
  }
  if (sugar || livestock) {
    result.notes.push(sugar ? 'Nama gula belum cukup untuk menetapkan pembebasan: periksa apakah gula kristal putih tebu memenuhi kriteria PP 49/2022.' : 'Penjualan ternak berpotensi mendapat pembebasan PPN sesuai PP 49/2022; kriteria ternak harus sesuai, tidak cukup dari nama sapi saja.')
    result.references.push({ label: 'Pembebasan PPN', url: 'https://jdih.kemenkeu.go.id/dok/pp-49-tahun-2022' })
  }
  if (input.isWithholding === 'true' && validRate(input.withholdingRate)) {
    result.withholding = `PPh ${input.withholdingRate}% — sesuai isian kontrak`
    result.withholdingAmount = validPrice ? input.priceBeforeVat! * input.withholdingRate! / 100 : null
    if (input.withholdingRate === .25) result.notes.push('Tarif 0,25% mengindikasikan PPh 22 bahan baku tertentu. Pastikan produk belum melalui manufaktur dan pembeli adalah pemungut industri/eksportir untuk kegiatan tersebut; nama PT/CV bukan penentu.')
  } else if (input.isWithholding === 'false') {
    result.withholding = 'PPh tidak diperhitungkan dalam isian kontrak'
    result.withholdingAmount = validPrice ? 0 : null
    result.notes.push('Isian PPh “Tidak” bukan bukti bahwa transaksi bebas PPh. Peran pembeli sebagai pemungut belum tercantum pada isian ini.')
  }
  if (crop || livestock || input.isWithholding === 'true') {
    result.references.push({ label: 'PPh 22', url: 'https://jdih.kemenkeu.go.id/dok/pmk-51-tahun-2025' })
    if (validPrice && input.priceBeforeVat! <= 20000000) result.notes.push('Pengecualian Rp20 juta PPh 22 bahan baku menggunakan total pembelian satu masa pajak, bukan nilai satu invoice saja.')
  }
  if (input.multipleMaterials) result.notes.push('Material campuran perlu ditelaah per material; jangan menganggap satu perlakuan pajak berlaku untuk semuanya.')
  if (!validPrice) result.notes.push('Nominal pajak muncul setelah nilai sebelum PPN tersedia.')
  if (input.date && (input.date < '2025-08-01' || input.date > '2026-10-07')) result.notes.push('Tanggal di luar periode aturan yang ditelaah: penetapan pajak memerlukan pemeriksaan aturan pada tanggal transaksi.')
  result.notes.push('Ringkasan ini membaca isian transaksi, bukan bukti potong/pungut, penyetoran PPh, atau posting SAP.')
  return result
}
