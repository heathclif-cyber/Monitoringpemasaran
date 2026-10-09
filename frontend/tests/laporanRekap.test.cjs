const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.join(__dirname, '../src/utils/laporanUtils.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
const instance = new Module(filename, module)
instance._compile(compiled.outputText, filename)
const { buildLaporanRekap, rekapAveragePrice } = instance.exports

const base = { No_DO: 'D1', No_Invoice: 'I1', No_Kontrak: 'K1', Unit: 'Camming', Komoditi: 'Tebu', Deskripsi_Produk: 'Gula',
  Mitra_Pembeli: 'PT A', Satuan: 'Kg', Jumlah_DO: 0, Pendapatan_Pokok: 0, Jumlah_Transfer: 0, Outstanding_Pengambilan: 40 }

test('rekap sums sales and cash per event, balances once per invoice', () => {
  const rows = [
    { ...base, Row_Type: 'REALISASI', Report_Date: '2026-05-02', Jumlah_DO: 100, Pendapatan_Pokok: 1500 },
    { ...base, Row_Type: 'RENCANA', Report_Date: '2026-06-02', Jumlah_DO: 50, Pendapatan_Pokok: 750 },
    { ...base, Row_Type: 'PEMBAYARAN', Report_Date: '2026-06-10', Jumlah_Transfer: 1000 },
    { ...base, No_Invoice: 'I2', Komoditi: 'Kelapa', Unit: 'Awaya', Row_Type: 'REALISASI', Report_Date: '2026-06-03',
      Jumlah_DO: 10, Pendapatan_Pokok: 30, Jumlah_Transfer: 30, Outstanding_Pengambilan: 0 },
  ]
  const balances = [{ no_invoice: 'I1', piutang_pokok: 1250 }, { no_invoice: 'I2', piutang_pokok: 0 }]
  const { groups, total } = buildLaporanRekap(rows, 'komoditi', balances)
  assert.deepEqual(groups.map((g) => g.key), ['Tebu', 'Kelapa'])
  const tebu = groups[0]
  assert.equal(tebu.sales, 2250)
  assert.equal(tebu.salesRencana, 750)
  assert.equal(tebu.volumeKg, 150)
  assert.equal(tebu.cashIn, 1000)
  assert.equal(tebu.shortfall, 1250)
  assert.equal(tebu.pickupOutstandingKg, 40)
  assert.deepEqual(rekapAveragePrice(tebu), { value: 15, unit: 'Kg' })
  assert.equal(total.sales, 2280)
  assert.equal(total.cashIn, 1030)
  assert.equal(total.transferCount, 2)
  assert.equal(total.shortfall, 1250)
  assert.equal(total.unpaidInvoices, 1)
  assert.equal(total.komoditiCount, 2)
})

test('rekap per bulan is chronological, undated rows last', () => {
  const rows = [
    { ...base, Report_Date: '2026-06-01', Pendapatan_Pokok: 1 },
    { ...base, Report_Date: '', Pendapatan_Pokok: 5 },
    { ...base, Report_Date: '2026-02-01', Pendapatan_Pokok: 9 },
  ]
  const { groups } = buildLaporanRekap(rows, 'bulan', null)
  assert.deepEqual(groups.map((g) => g.label), ['Februari 2026', 'Juni 2026', 'Tanpa tanggal'])
  assert.equal(groups[0].shortfall, null)
})

test('EA volume is kept apart from Kg and bypass has no invoice balance', () => {
  const rows = [
    { ...base, Satuan: 'EA', Jumlah_DO: 20, Pendapatan_Pokok: 200 },
    { ...base, No_DO: 'BYPASS-1', No_Invoice: '-', Row_Type: 'BYPASS', Jumlah_DO: 5, Pendapatan_Pokok: 50, Jumlah_Transfer: 50 },
  ]
  const { total } = buildLaporanRekap(rows, 'unit', [{ no_invoice: '-', piutang_pokok: 999 }])
  assert.equal(total.volumeEa, 20)
  assert.equal(total.volumeKg, 5)
  assert.equal(total.shortfall, 0)
})

test('rincian merges sale and payment events into one row per invoice', () => {
  const { groupLaporanByInvoice } = instance.exports
  const rows = [
    { ...base, Row_Type: 'PEMBAYARAN', Report_Date: '2026-07-29', Jumlah_Transfer: 180 },
    { ...base, Row_Type: 'REALISASI', Report_Date: '2026-08-08', Jumlah_DO: 10, Pendapatan_Pokok: 180 },
    { ...base, No_Invoice: '', No_DO: '', Row_Type: 'KONTRAK', Row_ID: 'K:1', Report_Date: '2026-01-01' },
  ]
  const groups = groupLaporanByInvoice(rows, 'DESC')
  assert.equal(groups.length, 2)
  const inv = groups.find((g) => g.key === 'INV:I1')
  assert.equal(inv.rows.length, 2)
  assert.equal(inv.sales, 180)
  assert.equal(inv.cashIn, 180)
  assert.equal(inv.volume, 10)
  assert.equal(inv.main.Row_Type, 'REALISASI')
  assert.deepEqual(inv.rowTypes, ['REALISASI'])
})

test('merged invoice row sums sale and cash and keeps SAP numbers', () => {
  const { groupLaporanByInvoice, mergeInvoiceGroup } = instance.exports
  const rows = [
    { ...base, Row_Type: 'PEMBAYARAN', Report_Date: '2026-07-29', Tanggal_Transfer: '29/07/2026', Jumlah_Transfer: 180, Pelunasan: 180, Billing: 'B1' },
    { ...base, Row_Type: 'REALISASI', Report_Date: '2026-08-08', Jumlah_DO: 10, Pendapatan_Pokok: 180, Pajak_PPN: 0 },
  ]
  const merged = mergeInvoiceGroup(groupLaporanByInvoice(rows, 'DESC')[0])
  assert.equal(merged.Pendapatan_Pokok, 180)
  assert.equal(merged.Jumlah_Transfer, 180)
  assert.equal(merged.Pelunasan, 180)
  assert.equal(merged.Tanggal_Transfer, '29/07/2026')
  assert.equal(merged.Billing, 'B1')
})
