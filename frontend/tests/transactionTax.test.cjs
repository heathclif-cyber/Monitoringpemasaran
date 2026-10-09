const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.join(__dirname, '../src/utils/transactionTax.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
const loaded = new Module(filename, module)
loaded._compile(compiled.outputText, filename)
const { concludeTransactionTax } = loaded.exports
const input = { document: 'contract', partner: 'PT Pembeli', commodity: 'Kelapa', material: 'Kopra', date: '2026-07-17', isVat: 'true', vatRate: 11, isWithholding: 'true', withholdingRate: .25, priceBeforeVat: 100000000 }

test('summarizes the actual form values and computes amounts without altering inputs', () => {
  const before = { ...input }
  const r = concludeTransactionTax(input)
  assert.equal(r.category, 'Penjualan hasil perkebunan')
  assert.equal(r.vatAmount, 11000000)
  assert.equal(r.withholdingAmount, 250000)
  assert.match(r.withholding, /sesuai isian/)
  assert.deepEqual(input, before)
})
test('PT versus CV does not change the legally unknown collector role', () => {
  assert.deepEqual(concludeTransactionTax(input), concludeTransactionTax({ ...input, partner: 'CV Pembeli' }))
  assert.ok(concludeTransactionTax(input).notes.some(n => n.includes('pemungut industri/eksportir')))
})
test('disabled VAT never asserts legally verified exemption', () => {
  const r = concludeTransactionTax({ ...input, commodity: 'Tebu', material: 'Gula Gapoktan', isVat: 'false' })
  assert.equal(r.category, 'Penjualan gula')
  assert.equal(r.vatAmount, 0)
  assert.ok(r.notes.some(n => n.includes('gula kristal putih')))
  assert.match(r.vat, /dalam isian/)
  assert.ok(!r.vat.includes('dibebaskan'))
  assert.ok(r.indications.some(n => n.includes('kandidat pembebasan')))
})
test('BHPT rate does not silently prove seller election', () => {
  assert.ok(concludeTransactionTax({ ...input, vatRate: 1.1 }).notes.some(n => n.includes('tidak membuktikan')))
})
test('zero enabled rate and mixed materials are flagged', () => {
  const r = concludeTransactionTax({ ...input, vatRate: 0, multipleMaterials: true })
  assert.ok(r.notes.some(n => n.includes('tarif nol')))
  assert.ok(r.notes.some(n => n.includes('per material')))
})
test('missing fields do not become a tax exemption or manufactured zero amount', () => {
  const r = concludeTransactionTax({ document: 'invoice' })
  assert.equal(r.vatAmount, null)
  assert.equal(r.withholdingAmount, null)
  assert.equal(r.vat, 'Belum ditentukan dalam isian')
})
test('invoice nominal follows its actual amount not full contract', () => {
  const r = concludeTransactionTax({ ...input, document: 'invoice', priceBeforeVat: 20000000 })
  assert.equal(r.vatAmount, 2200000)
  assert.equal(r.withholdingAmount, 50000)
  assert.ok(r.notes.some(n => n.includes('satu masa pajak')))
})
test('bad numeric data and out of range dates are not certified', () => {
  const r = concludeTransactionTax({ ...input, vatRate: NaN, priceBeforeVat: Infinity, date: '2024-01-01' })
  assert.equal(r.vatAmount, null)
  assert.equal(r.withholdingAmount, null)
  assert.ok(r.notes.some(n => n.includes('periode aturan')))
})
