import type { TransactionTaxInput } from '@/types'
import { concludeTransactionTax } from '@/utils/transactionTax'
import { formatCurrency, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function TransactionTaxSummary({ input }: { input: TransactionTaxInput }) {
  const result = concludeTransactionTax(input)
  return <section aria-label="Kesimpulan pajak transaksi" className={cn('rounded-md border bg-muted/30 p-3 text-xs space-y-2')}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Kesimpulan pajak dari isian {input.document === 'contract' ? 'kontrak' : 'invoice'}</h3><Badge variant="outline">{result.category}</Badge></div>
    {input.partner && <p className="text-muted-foreground">{input.partner.split('\n')[0]} · {input.material || input.commodity || 'Material belum dipilih'}</p>}
    <div className="space-y-1">{result.indications.map((note, i) => <p key={i}>{note}</p>)}</div>
    <p className="font-medium pt-1">Perhitungan yang tercatat di transaksi</p>
    <p>{result.vat}{result.vatAmount !== null && ` · ${formatCurrency(result.vatAmount)}`}</p>
    <p>{result.withholding}{result.withholdingAmount !== null && ` · ${formatCurrency(result.withholdingAmount)}`}</p>
    <p className="text-muted-foreground">Dihitung otomatis dari data di atas. Ringkasan isian belum merupakan penetapan hukum atas kelayakan pajak.</p>
    <details><summary className="cursor-pointer font-medium">Dasar pertimbangan / data yang perlu dipastikan</summary><div className="pt-2 space-y-1 text-muted-foreground">{result.notes.map((note, i) => <p key={i}>{note}</p>)}<div className="flex flex-wrap gap-3 pt-1">{result.references.map(ref => <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer" className="underline">{ref.label}</a>)}</div></div></details>
    <p className="text-muted-foreground">{input.document === 'contract' ? 'Jika hasil tidak sesuai, koreksi pilihan/tarif PPN dan PPh pada form kontrak ini.' : 'PPN dan PPh mengikuti kontrak yang dipilih. Koreksi sumber tarif melalui form kontrak, bukan dengan mengganti angka di ringkasan invoice.'}</p>
  </section>
}
