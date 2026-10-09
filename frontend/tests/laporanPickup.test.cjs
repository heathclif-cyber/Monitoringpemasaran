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
const { calculateLaporanSummary, pickupRemainingRatio } = instance.exports

test('canonical BA events sum each pickup once, invoice outstanding only once', () => {
  const row = { Row_Type: 'REALISASI', No_Kontrak: 'K1', No_Invoice: 'I1', No_DO: 'D1', Satuan: 'Kg',
    Jumlah_DO: 30, Volume_Pengambilan: 30, Outstanding_Pengambilan: 30, Pendapatan_Pokok: 300 }
  const summary = calculateLaporanSummary([row, { ...row, Jumlah_DO: 20, Volume_Pengambilan: 20, Pendapatan_Pokok: 200 },
    { ...row, Row_Type: 'PEMBAYARAN', Jumlah_DO: 0, Volume_Pengambilan: null, Pendapatan_Pokok: 0, Jumlah_Transfer: 100 }])
  assert.equal(summary.barangTerkirimKg, 50)
  assert.equal(summary.sisaVolume, 30)
  assert.equal(summary.pendapatan, 500)
  assert.equal(summary.cashIn, 100)
})

test('canonical month is event date, not transfer mode', () => {
  const row = { Row_Type: 'REALISASI', Report_Date: '2026-09-30', Raw_Date: '2026-10-01' }
  for (const mode of ['TRANSFER', 'RENCANA']) assert.deepEqual(instance.exports.extractPeriodKeys(row, mode), { year: '2026', month: '09' })
})

test('pickup totals count once per invoice, never once per contract or per DO', () => {
  const row = { No_Kontrak: 'K1', No_Invoice: 'I1', No_DO: 'D1', Satuan: 'Kg',
    Jumlah_DO: 80, Volume_Pengambilan: 60, Outstanding_Pengambilan: 40 }
  const summary = calculateLaporanSummary([row, { ...row, No_DO: 'D2' }, { ...row, No_Invoice: 'I2', No_DO: 'D3', Volume_Pengambilan: 10, Outstanding_Pengambilan: 90 }])
  assert.equal(summary.barangTerkirimKg, 70)
  assert.equal(summary.sisaVolume, 130)
})

test('invoice without DO is not outstanding', () => {
  const row = { No_Kontrak: 'K1', No_Invoice: 'I1', No_DO: '', Satuan: 'EA',
    Jumlah_DO: 0, Volume_Pengambilan: null, Outstanding_Pengambilan: 0 }
  const summary = calculateLaporanSummary([row])
  assert.equal(summary.barangTerkirimButir, 0)
  assert.equal(summary.sisaVolumeButir, 0)
})

test('remaining ratio uses total issued DO, not contract or invoice quantity', () => {
  assert.equal(pickupRemainingRatio({ Volume_DO_Invoice: 80, Outstanding_Pengambilan: 40, Volume_Invoice: 100 }), 0.5)
  assert.equal(pickupRemainingRatio({ Volume_DO_Invoice: 100, Outstanding_Pengambilan: 10 }), 0.1)
  assert.equal(pickupRemainingRatio({ Volume_DO_Invoice: 100, Outstanding_Pengambilan: 0 }), 0)
  assert.equal(pickupRemainingRatio({ Volume_DO_Invoice: 0, Outstanding_Pengambilan: 0 }), 0)
})
