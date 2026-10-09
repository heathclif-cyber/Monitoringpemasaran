const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const filename = path.join(__dirname, '../src/utils/sapReconciliation.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
const moduleInstance = new Module(filename, module)
moduleInstance._compile(compiled.outputText, filename)
const { parseSapNumber, parseSapDate, reconcileSapRows, suggestSapMapping, invoiceTaxEstimate, pphEvidenceLabel } = moduleInstance.exports

const local = {
  No_DO: 'DO-1', No_Invoice: 'INV-1', No_Kontrak: 'K-1',
  Billing: '00900001', DO_SAP: '00800001', SO_SAP: '00500001',
  Satuan: 'KG', Komoditi: 'Karet', Deskripsi_Produk: 'RSS1',
  Volume_Invoice: 100, Jumlah_DO: 40, Harga_Satuan: 2000, Jumlah_Invoice: 222000,
  PPN_Persen: 11, PPh_Persen: 0.25, PPh_Setor: 'false', Pajak_PPN: 8800, PPh_Nominal: 200,
}
const check = (data, mapping, scope = 'billing', rows = [local]) => reconcileSapRows(data, mapping, scope, 'id', rows)

test('invoice tax estimates use invoice scope, never DO tax allocations', () => {
  const tax = invoiceTaxEstimate(local)
  assert.ok(Math.abs(tax.net - 200000) < 0.000001)
  assert.ok(Math.abs(tax.vat - 22000) < 0.000001)
  assert.ok(Math.abs(tax.withholding - 500) < 0.000001)
  assert.equal(invoiceTaxEstimate({ ...local, PPN_Persen: undefined }), null)
  assert.equal(invoiceTaxEstimate({ ...local, PPN_Persen: 0 }).vat, 0)
})
test('manual PPh flags never imply evidence verification', () => {
  for (const flag of ['true', 'Disetor', 'Sudah']) assert.equal(pphEvidenceLabel({ ...local, PPh_Setor: flag }), 'Ditandai disetor — belum diverifikasi')
  assert.equal(pphEvidenceLabel(local), 'Belum ada bukti tercatat')
  assert.equal(pphEvidenceLabel({ ...local, PPh_Persen: 0, PPh_Setor: 'true' }), 'Tidak berlaku')
})
test('separate DPP PPN PPh match estimates without double counting or claiming payment', () => {
  const mapping = { documentNumber: 0, netAmount: 1, vatAmount: 2, withholdingAmount: 3, currency: 4 }
  const result = check([['900001', 200000, 22000, 500, 'IDR']], mapping, 'billing', [local, { ...local, No_DO: 'DO-2', Pajak_PPN: 13200 }])[0]
  assert.equal(result.status, 'matched')
  assert.equal(result.checks.find((field) => field.label === 'Bukti penyetoran PPh').state, 'info')
  assert.equal(check([['900001', 200000, 8800, 500, 'IDR']], mapping)[0].status, 'difference')
  assert.equal(check([['900001', 200000, 22000, 500, 'USD']], mapping)[0].status, 'partial')
  assert.throws(() => check([['800001', 22000]], { documentNumber: 0, vatAmount: 1 }, 'delivery'))
})
test('inconsistent or missing invoice tax rates require checking', () => {
  const mapping = { documentNumber: 0, vatAmount: 1, currency: 2 }
  assert.equal(check([['900001', 22000, 'IDR']], mapping, 'billing', [local, { ...local, No_DO: 'DO-2', PPN_Persen: 12 }])[0].status, 'partial')
  assert.equal(check([['900001', 22000, 'IDR']], mapping, 'billing', [{ ...local, PPN_Persen: undefined }])[0].status, 'partial')
})

test('preserves numeric Excel cells and validates both textual number formats', () => {
  assert.equal(parseSapNumber(1234.56, 'id'), 1234.56)
  assert.equal(parseSapNumber('1.234,56', 'id'), 1234.56)
  assert.equal(parseSapNumber('1,234.56', 'en'), 1234.56)
  assert.throws(() => parseSapNumber('12abc', 'id'))
  assert.throws(() => parseSapNumber('1,234.56', 'id'))
  assert.throws(() => parseSapNumber('1.23', 'id'))
})
test('normalizes calendar dates and Excel serials without timezone shift', () => {
  assert.equal(parseSapDate('29.02.2024'), '2024-02-29')
  assert.equal(parseSapDate('2026-10-06'), '2026-10-06')
  assert.equal(parseSapDate(45292), '2024-01-01')
  assert.throws(() => parseSapDate('29.02.2025'))
  assert.throws(() => parseSapDate('2026-13-01'))
  assert.throws(() => parseSapDate('10/06/26'))
})
test('matches leading-zero SAP references and never sums repeated invoice totals across DOs', () => {
  const results = check([['900001', 222000, 'IDR', 100, 'KG']], { documentNumber: 0, grossAmount: 1, currency: 2, quantity: 3, unit: 4 }, 'billing', [local, { ...local, No_DO: 'DO-2', Jumlah_DO: 60 }])
  assert.equal(results[0].status, 'matched')
  assert.equal(results[0].checks.find((field) => field.label.startsWith('Total invoice')).local, '222000')
})
test('duplicate SAP item rows require aggregation rather than false matches', () => {
  const results = check([['900001'], ['00900001']], { documentNumber: 0 })
  assert.ok(results.every((result) => result.status === 'ambiguous'))
})
test('normalizes base price per 100 units and reports price differences', () => {
  const mapping = { documentNumber: 0, unitPrice: 1, pricingUnit: 2, currency: 3, unit: 4 }
  assert.equal(check([['900001', 200000, 100, 'IDR', 'KG']], mapping)[0].status, 'matched')
  assert.equal(check([['900001', 210000, 100, 'IDR', 'KG']], mapping)[0].status, 'difference')
})
test('missing price denominator, foreign currency or unsupported unit cannot yield a price match', () => {
  const mapping = { documentNumber: 0, unitPrice: 1, pricingUnit: 2, currency: 3, unit: 4 }
  for (const cells of [['900001', 2000, '', 'IDR', 'KG'], ['900001', 2000, 1, 'USD', 'KG'], ['900001', 2000, 1, 'IDR', 'TON']]) {
    assert.equal(check([cells], mapping)[0].status, 'partial')
  }
})
test('delivery compares actual DO scope rather than full invoice quantity', () => {
  const mapping = { documentNumber: 0, quantity: 1, unit: 2 }
  assert.equal(check([['800001', 40, 'KG']], mapping, 'delivery')[0].status, 'matched')
  assert.equal(check([['800001', 100, 'KG']], mapping, 'delivery')[0].status, 'difference')
})

test('canonical BA rows do not replace issued DO quantity in SAP comparison', () => {
  const mapping = { documentNumber: 0, quantity: 1, unit: 2 }
  assert.equal(check([['800001', 40, 'KG']], mapping, 'delivery', [{ ...local, Row_Type: 'REALISASI', Jumlah_DO: 10, Volume_DO_Dokumen: 40 }])[0].status, 'matched')
})
test('local invoice reference alone is ambiguous when it contains several deliveries', () => {
  const results = check([['800099', 'INV-1']], { documentNumber: 0, localInvoice: 1 }, 'delivery', [local, { ...local, No_DO: 'DO-2' }])
  assert.equal(results[0].status, 'ambiguous')
})
test('conflicting existing SAP mapping is rejected; absent pairs never match by amount', () => {
  assert.equal(check([['900001', 'INV-2']], { documentNumber: 0, localInvoice: 1 })[0].status, 'invalid')
  assert.equal(check([['900099', 222000]], { documentNumber: 0, grossAmount: 1 })[0].status, 'unmatched')
})
test('explicit local reference can locate a document but does not silently fill its SAP number', () => {
  const result = check([['900099', 'INV-1', 222000, 'IDR']], { documentNumber: 0, localInvoice: 1, grossAmount: 2, currency: 3 }, 'billing', [{ ...local, Billing: '' }])[0]
  assert.equal(result.status, 'partial')
  assert.equal(result.localInvoice, 'INV-1')
})
test('imported dates and statuses are informative, not fabricated local equivalents', () => {
  const result = check([['900001', '2026-10-06', 'C']], { documentNumber: 0, actualGiDate: 1, giStatus: 2 })[0]
  assert.equal(result.status, 'partial')
  assert.equal(result.checks.find((field) => field.label === 'Actual GI Date').state, 'info')
})
test('invalid dates, negative credit amounts and zero pricing unit are rejected', () => {
  assert.equal(check([['900001', '31.02.2026']], { documentNumber: 0, billingDate: 1 })[0].status, 'invalid')
  assert.equal(check([['900001', -222000, 'IDR']], { documentNumber: 0, grossAmount: 1, currency: 2 })[0].status, 'invalid')
  assert.equal(check([['900001', 2000, 0]], { documentNumber: 0, unitPrice: 1, pricingUnit: 2 })[0].status, 'invalid')
})
test('known cancelled documents cannot appear as matched active billing', () => {
  const result = check([['900001', 222000, 'IDR', 'Cancelled']], { documentNumber: 0, grossAmount: 1, currency: 2, billingStatus: 3 })[0]
  assert.equal(result.status, 'partial')
})
test('mapping validation does not guess ambiguous generic document columns', () => {
  assert.equal(suggestSapMapping(['VBELN']).documentNumber, undefined)
  assert.equal(suggestSapMapping(['Billing document', 'Delivery']).documentNumber, undefined)
  assert.throws(() => check([['900001']], {}))
  assert.throws(() => check([['900001']], { documentNumber: 0, quantity: 0 }))
})
test('multiple billing references for one local invoice need explicit partial-billing handling', () => {
  const results = check([['900001']], { documentNumber: 0 }, 'billing', [local, { ...local, No_DO: 'DO-2', Billing: '900002' }])
  assert.equal(results[0].status, 'invalid')
})
test('several imported bills cannot each match the full value of one invoice', () => {
  const results = check([['900098', 'INV-1', 222000, 'IDR'], ['900099', 'INV-1', 222000, 'IDR']], { documentNumber: 0, localInvoice: 1, grossAmount: 2, currency: 3 }, 'billing', [{ ...local, Billing: '' }])
  assert.ok(results.every((result) => result.status === 'ambiguous'))
})
