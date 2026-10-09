import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTaxStore } from '@/store/taxStore'
import { useAuthStore, useCanEdit } from '@/store/authStore'
import { client } from '@/lib/client'
import { cn, formatCurrency } from '@/lib/utils'
import { PageShell, PageHeader, FilterToolbar, ListPanel, StatPills } from '@/components/patterns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { TaxAuditEntry, TaxProfile, TaxRow } from '@/types'

const statusLabel = { review: 'Perlu verifikasi', automatic: 'Usulan otomatis', manual: 'Koreksi manual' }
const profileSchema = z.object({
  verified: z.boolean(), effective_from: z.string().min(10), effective_until: z.string(),
  evidence: z.string(), reason: z.string().trim().min(10, 'Alasan minimal 10 karakter'),
  settings: z.object({
    role: z.enum(['unknown', 'industry_exporter', 'trader', 'government', 'designated']),
    domestic: z.boolean(), industrial_use: z.boolean(), tax_identity_confirmed: z.boolean(),
    seller_pkp_confirmed: z.boolean(), bhpt_election_confirmed: z.boolean(), specification_confirmed: z.boolean(), pph22_agri_eligible: z.boolean(),
    vat_scheme: z.enum(['unknown', 'general_nonluxury', 'bhpt_specific', 'exempt_sugar', 'exempt_livestock']),
    manufacturing: z.enum(['unknown', 'unprocessed', 'processed']),
  }),
}).refine(v => !v.verified || v.evidence.trim().length >= 10, { message: 'Profil terverifikasi wajib referensi bukti minimal 10 karakter', path: ['evidence'] })
const decisionSchema = z.object({
  mode: z.enum(['automatic', 'manual']),
  vat_scheme: z.enum(['general_nonluxury', 'bhpt_specific', 'exempt', 'other']),
  vat_rate: z.coerce.number().finite().min(0).max(100),
  pph_type: z.enum(['PPh 22', 'Tidak dipungut', 'Lainnya']),
  pph_rate: z.coerce.number().finite().min(0).max(100),
  legal_basis: z.string(), reason: z.string().trim().min(10, 'Alasan minimal 10 karakter'),
}).refine(v => v.mode === 'automatic' || v.legal_basis.trim().length >= 10, { message: 'Dasar hukum/telaah minimal 10 karakter', path: ['legal_basis'] })

export default function TaxPage() {
  const { data, loading, error, fetch } = useTaxStore()
  const admin = useAuthStore(s => s.user?.role === 'admin')
  const canEdit = useCanEdit()
  const [tab, setTab] = useState('assessment')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [profile, setProfile] = useState<TaxProfile | null>(null)
  const [row, setRow] = useState<TaxRow | null>(null)
  useEffect(() => { void fetch() }, [fetch])
  const rows = (data?.rows ?? []).filter(r => `${r.source.no_invoice} ${r.source.partner} ${r.source.product}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || r.result.status === status))
  const profiles = (data?.profiles ?? []).filter(p => p.kind === tab && p.label.toLowerCase().includes(query.toLowerCase()))
  return <PageShell width="wide" density="compact">
    <PageHeader title="Pajak Otomatis" description="Profil diverifikasi sekali, transaksi berikutnya mendapat usulan pajak otomatis." actions={<Button variant="outline" onClick={() => void fetch()} disabled={loading}>Muat ulang</Button>} />
    <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
      <p>Penilaian terpisah dari pembukuan: tidak mengubah tagihan, dokumen lama, atau status setor PPh. Tarif kosong berarti belum diketahui, bukan bebas pajak.</p>
      <p className="text-xs text-muted-foreground">Cakupan: penjualan barang domestik, 1 Agustus 2025–7 Oktober 2026. Harga sebelum PPN masih estimasi; tanggal proforma bukan konfirmasi saat terutang pajak. Transaksi di luar cakupan perlu telaah.</p>
      <p className="text-xs text-muted-foreground">Admin memverifikasi peran mitra serta spesifikasi/skema produk dengan bukti. Nama PT/CV dan kelompok komoditi saja tidak cukup.</p>
    </div>
    <StatPills items={(['automatic', 'review', 'manual'] as const).map(s => ({ label: statusLabel[s], value: data?.rows.filter(r => r.result.status === s).length ?? 0 }))} />
    <FilterToolbar>
      <div className="flex flex-wrap gap-2">{[['assessment', 'Penilaian Invoice'], ['partner', 'Master Mitra'], ['product', 'Master Produk']].map(([value, label]) => <Button key={value} variant={tab === value ? 'default' : 'outline'} onClick={() => { setTab(value); setQuery('') }}>{label}</Button>)}</div>
      <Input aria-label="Cari pajak" placeholder="Cari invoice, mitra, produk…" value={query} onChange={e => setQuery(e.target.value)} className="max-w-sm h-10" />
      {tab === 'assessment' && <NativeSelect aria-label="Status penilaian" value={status} onChange={e => setStatus(e.target.value)} className="w-auto"><option value="all">Semua status</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect>}
    </FilterToolbar>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <ListPanel loading={loading} empty={!error && (tab === 'assessment' ? !rows.length : !profiles.length)} emptyTitle="Tidak ada hasil penilaian">
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted text-left"><tr>{(tab === 'assessment' ? ['Invoice / Acuan', 'Mitra / Produk', 'PPN / PPh usulan', 'Status / Perhatian', 'Tindakan'] : ['Mitra / Produk', 'Verifikasi', 'Berlaku / Revisi', 'Bukti', 'Tindakan']).map(h => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead><tbody>
        {tab === 'assessment' ? rows.map(r => <tr key={r.source.no_invoice} className="border-t align-top"><td className="p-3"><p className="font-medium">{r.source.no_invoice}</p><p className="text-muted-foreground">{r.source.reference_date}</p></td><td className="p-3 max-w-xs"><p>{r.source.partner}</p><p className="text-muted-foreground">{r.source.product}</p></td><td className="p-3 whitespace-nowrap"><p>PPN: {r.result.vat_rate === null ? 'Belum ditentukan' : `${r.result.vat_rate}%`}{r.result.vat_scheme?.startsWith('exempt') ? ' · dibebaskan' : ''}</p><p>PPh: {r.result.pph_rate === null ? 'Belum ditentukan' : `${r.result.pph_rate}%`}</p><p className="text-muted-foreground mt-1">Tercatat: {r.source.stored_vat_rate}% / {r.source.stored_pph_rate}%</p></td><td className="p-3 max-w-md"><Badge variant="outline">{statusLabel[r.result.status]}</Badge>{r.changed_since_decision && <p className="text-destructive mt-1">Sumber/master berubah; tinjau keputusan sebelumnya.</p>}<p className="mt-1 text-muted-foreground">{r.result.warnings.filter(w => !w.startsWith('Tanggal proforma') && !w.startsWith('Estimasi dari')).join(' ') || 'Usulan; belum pembukuan pajak.'}</p></td><td className="p-3"><Button variant="outline" size="sm" onClick={() => setRow(r)}>Detail{canEdit ? ' / Koreksi' : ''}</Button></td></tr>) : profiles.map(p => <tr key={p.source_key} className="border-t align-top"><td className="p-3 max-w-sm">{p.label}</td><td className="p-3"><Badge variant="outline">{p.verified ? 'Terverifikasi' : 'Belum diverifikasi'}</Badge></td><td className="p-3">{p.effective_from} s.d. {p.effective_until || 'seterusnya'}<p className="text-muted-foreground">Revisi {p.revision}</p></td><td className="p-3 max-w-sm break-words">{p.evidence || 'Belum ada bukti'}</td><td className="p-3"><Button variant="outline" size="sm" onClick={() => setProfile(p)}>{admin ? 'Verifikasi / Ubah' : 'Detail'}</Button></td></tr>)}
      </tbody></table></div>
    </ListPanel>
    <p className="text-xs text-muted-foreground">Aturan {data?.rule_version}. Rujukan: {Object.entries(data?.legal_sources ?? {}).map(([key, url]) => <a key={key} href={url} target="_blank" rel="noreferrer" className="underline mr-3">{({ pph22: 'PMK 51/2025', vat_general: 'PMK 131/2024', vat_bhpt: 'PMK 11/2025', vat_exempt: 'PP 49/2022' } as Record<string, string>)[key]}</a>)}</p>
    {profile && <ProfileDialog key={profile.source_key} profile={profile} writable={admin} close={() => setProfile(null)} />}
    {row && <DecisionDialog key={row.source.no_invoice} row={row} writable={canEdit} close={() => setRow(null)} />}
  </PageShell>
}

function ProfileDialog({ profile, writable, close }: { profile: TaxProfile; writable: boolean; close: () => void }) {
  const save = useTaxStore(s => s.saveProfile)
  const [error, setError] = useState('')
  const form = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { ...profile, effective_until: profile.effective_until ?? '', reason: '' } })
  const submit = form.handleSubmit(async values => {
    try { await save({ ...profile, ...values, effective_until: values.effective_until || null }); close() }
    catch (e) { setError(e instanceof Error ? e.message : 'Gagal menyimpan') }
  })
  return <Dialog open onOpenChange={open => !open && close()}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Master {profile.kind === 'partner' ? 'Mitra' : 'Produk'}</DialogTitle><DialogDescription>{profile.label} · revisi {profile.revision}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-3"><fieldset disabled={!writable || form.formState.isSubmitting} className="space-y-3">
      {profile.kind === 'partner' ? <>
        <Label htmlFor="tax-role">Peran pembeli (bukan bentuk badan usaha)</Label><NativeSelect id="tax-role" {...form.register('settings.role')}><option value="unknown">Belum diketahui</option><option value="industry_exporter">Industri / eksportir pemungut bahan baku</option><option value="trader">Pedagang biasa, bukan pemungut yang ditunjuk</option><option value="government">Instansi pemerintah — telaah manual</option><option value="designated">BUMN / pemungut ditunjuk — telaah manual</option></NativeSelect>
        <BooleanField label="Transaksi domestik sudah dikonfirmasi" {...form.register('settings.domestic')} />
        <BooleanField label="Untuk kegiatan industri / ekspor, bukan pembelian lain" {...form.register('settings.industrial_use')} />
        <BooleanField label="Identitas / NPWP pembeli valid telah diverifikasi" {...form.register('settings.tax_identity_confirmed')} />
        <p className="text-xs text-muted-foreground">Pedagang biasa hanya dipilih jika tidak termasuk pemungut lain menurut PMK 51/2025. Bukti: identitas pajak, izin usaha dan tujuan pembelian; jangan menyimpulkan dari nama mitra.</p>
      </> : <>
        <Label htmlFor="vat-scheme">Skema PPN yang memenuhi ketentuan</Label><NativeSelect id="vat-scheme" {...form.register('settings.vat_scheme')}><option value="unknown">Belum diketahui</option><option value="general_nonluxury">Umum nonmewah: 12% × 11/12 (efektif 11%)</option><option value="bhpt_specific">BHPT besaran tertentu: 1,1% (pilihan PKP)</option><option value="exempt_sugar">Dibebaskan: gula kristal putih tebu sesuai kriteria</option><option value="exempt_livestock">Dibebaskan: ternak sesuai kriteria PP 49/2022</option></NativeSelect>
        <Label htmlFor="manufacturing">Proses produk untuk PPh 22</Label><NativeSelect id="manufacturing" {...form.register('settings.manufacturing')}><option value="unknown">Belum diketahui</option><option value="unprocessed">Belum melalui industri manufaktur</option><option value="processed">Sudah melalui industri manufaktur</option></NativeSelect>
        <BooleanField label="Spesifikasi produk dan kelayakan skema telah diperiksa" {...form.register('settings.specification_confirmed')} />
        <BooleanField label="Termasuk bahan kehutanan / perkebunan / pertanian / peternakan / perikanan objek PMK 51/2025" {...form.register('settings.pph22_agri_eligible')} />
        <BooleanField label="Status PKP penjual dikonfirmasi (skema PPN terutang)" {...form.register('settings.seller_pkp_confirmed')} />
        <BooleanField label="Pemilihan skema BHPT 1,1% oleh PKP dibuktikan" {...form.register('settings.bhpt_election_confirmed')} />
        <p className="text-xs text-muted-foreground">Kelapa, kopra, karet atau sapi tidak otomatis memiliki perlakuan yang sama. Periksa spesifikasi dan proses; PP 49/2022 membebaskan objek tertentu, bukan semua komoditi sejenis.</p>
      </>}
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="effective-from">Berlaku mulai</Label><Input id="effective-from" type="date" {...form.register('effective_from')} /></div><div><Label htmlFor="effective-until">Berlaku sampai (opsional)</Label><Input id="effective-until" type="date" {...form.register('effective_until')} /></div></div>
      <Label htmlFor="tax-evidence">Referensi bukti verifikasi</Label><Textarea id="tax-evidence" placeholder="Nomor/tanggal dokumen, identitas pajak, hasil telaah dan rujukan regulasi…" {...form.register('evidence')} />
      <BooleanField label="Saya telah memverifikasi profil berdasarkan bukti di atas" {...form.register('verified')} />
      <Label htmlFor="profile-reason">Alasan perubahan (tersimpan dalam audit)</Label><Textarea id="profile-reason" {...form.register('reason')} />
      {writable && <Button type="submit" disabled={form.formState.isSubmitting}>Simpan master</Button>}
    </fieldset><p role="alert" className="text-sm text-destructive">{error || form.formState.errors.reason?.message || form.formState.errors.evidence?.message || (Object.keys(form.formState.errors).length ? 'Periksa isian wajib.' : '')}</p></form>
    <AuditHistory entity="profile" entityKey={`${profile.kind}:${profile.source_key}`} />
  </DialogContent></Dialog>
}

// Native checkbox is an input primitive; forward RHF ref to preserve form registration.
const BooleanField = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string }>(({ label, ...props }, ref) => <Label className="flex items-start gap-2 font-normal"><Input ref={ref} type="checkbox" className="h-4 w-4 mt-0.5 shrink-0" {...props} /><span>{label}</span></Label>)
BooleanField.displayName = 'BooleanField'

function DecisionDialog({ row, writable, close }: { row: TaxRow; writable: boolean; close: () => void }) {
  const save = useTaxStore(s => s.saveDecision)
  const [error, setError] = useState('')
  const current = row.result
  const form = useForm<z.infer<typeof decisionSchema>>({ resolver: zodResolver(decisionSchema), defaultValues: {
    mode: row.decision?.mode ?? 'automatic',
    vat_scheme: current.vat_scheme === 'general_nonluxury' || current.vat_scheme === 'bhpt_specific' ? current.vat_scheme : current.vat_scheme?.startsWith('exempt') ? 'exempt' : 'other',
    vat_rate: current.vat_rate ?? 0,
    pph_type: current.pph_type === 'Tidak dipungut' || current.pph_type === 'Lainnya' ? current.pph_type : 'PPh 22', pph_rate: current.pph_rate ?? 0,
    legal_basis: current.legal_basis.join('\n'), reason: '',
  } })
  const submit = form.handleSubmit(async v => {
    try { await save({ no_invoice: row.source.no_invoice, revision: row.decision?.revision ?? 0, mode: v.mode, reason: v.reason,
      manual: v.mode === 'manual' ? { vat_scheme: v.vat_scheme, vat_rate: v.vat_rate, pph_type: v.pph_type, pph_rate: v.pph_rate, legal_basis: v.legal_basis } : undefined }); close() }
    catch (e) { setError(e instanceof Error ? e.message : 'Gagal menyimpan') }
  })
  return <Dialog open onOpenChange={open => !open && close()}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Penilaian Pajak Invoice</DialogTitle><DialogDescription>{row.source.no_invoice} · {row.source.partner}</DialogDescription></DialogHeader>
    <div className="text-sm space-y-1"><p>{row.source.product} · {row.source.reference_date}</p><p>Nilai sebelum PPN (estimasi): {formatCurrency(row.source.price_before_vat)}</p><p>DPP fiskal (usulan): {current.fiscal_dpp === null ? 'Belum ditetapkan / tidak berlaku untuk skema ini' : formatCurrency(current.fiscal_dpp)}</p><p>PPN usulan: {current.vat_amount === null ? 'Belum ditentukan' : formatCurrency(current.vat_amount)} · PPh usulan: {current.pph_amount === null ? 'Belum ditentukan' : formatCurrency(current.pph_amount)}</p><p>Pemungut: {current.collector || 'Belum ditentukan'}</p>{current.legal_basis.map((t, i) => <p className="text-xs text-muted-foreground" key={i}>{t}</p>)}{current.warnings.map((t, i) => <p className="text-xs text-muted-foreground" key={i}>• {t}</p>)}
      {row.decision && <p className="text-xs">Keputusan revisi {row.decision.revision} · {row.decision.actor} · {row.decision.reason}</p>}
      {row.changed_since_decision && <p className="text-destructive">Sumber/master berubah. Koreksi manual tetap dipertahankan; telaah ulang diperlukan.</p>}
      {row.decision?.mode === 'manual' && <p className="text-xs">Hasil otomatis saat ini: PPN {row.automatic.vat_rate ?? 'belum ditentukan'}% · PPh {row.automatic.pph_rate ?? 'belum ditentukan'}%.</p>}
    </div>
    {writable && <form onSubmit={submit} className="space-y-3"><fieldset disabled={form.formState.isSubmitting} className="space-y-3"><Label htmlFor="decision-mode">Mode keputusan</Label><NativeSelect id="decision-mode" {...form.register('mode')}><option value="automatic">Gunakan aturan otomatis (hapus koreksi manual)</option><option value="manual">Koreksi manual berdasarkan telaah</option></NativeSelect>
      {form.watch('mode') === 'manual' && <><Label htmlFor="manual-vat-scheme">Skema PPN manual</Label><NativeSelect id="manual-vat-scheme" {...form.register('vat_scheme')}><option value="general_nonluxury">Umum nonmewah (efektif 11%)</option><option value="bhpt_specific">BHPT besaran tertentu (1,1%)</option><option value="exempt">PPN dibebaskan (bukan tarif nol)</option><option value="other">Lainnya sesuai telaah</option></NativeSelect><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="manual-vat">Tarif PPN efektif (%)</Label><Input id="manual-vat" type="number" min="0" max="100" step="0.01" {...form.register('vat_rate')} /></div><div><Label htmlFor="manual-pph">Tarif PPh (%)</Label><Input id="manual-pph" type="number" min="0" max="100" step="0.01" {...form.register('pph_rate')} /></div></div><Label htmlFor="manual-pph-type">Jenis PPh</Label><NativeSelect id="manual-pph-type" {...form.register('pph_type')}><option>PPh 22</option><option>Tidak dipungut</option><option>Lainnya</option></NativeSelect><Label htmlFor="legal-basis">Dasar hukum / telaah</Label><Textarea id="legal-basis" {...form.register('legal_basis')} /></>}
      <Label htmlFor="decision-reason">Alasan keputusan / koreksi</Label><Textarea id="decision-reason" {...form.register('reason')} /><Button type="submit" disabled={form.formState.isSubmitting}>Simpan keputusan</Button>
    </fieldset><p role="alert" className="text-sm text-destructive">{error || form.formState.errors.reason?.message || form.formState.errors.legal_basis?.message || (Object.keys(form.formState.errors).length ? 'Periksa tarif dan isian wajib.' : '')}</p></form>}
    <AuditHistory entity="decision" entityKey={row.source.no_invoice} />
  </DialogContent></Dialog>
}

function AuditHistory({ entity, entityKey }: { entity: string; entityKey: string }) {
  const [entries, setEntries] = useState<TaxAuditEntry[]>([])
  const [error, setError] = useState('')
  useEffect(() => { let active = true; client.get<TaxAuditEntry[]>(`/api/pajak/v1/history?entity=${entity}&key=${encodeURIComponent(entityKey)}`).then(v => { if (active) setEntries(v) }).catch(() => { if (active) setError('Gagal memuat riwayat') }); return () => { active = false } }, [entity, entityKey])
  return <details className="border-t pt-3 text-xs"><summary className="cursor-pointer font-medium">Riwayat audit ({entries.length})</summary>{error && <p>{error}</p>}{entries.map(a => <div key={a.id} className={cn('border-t py-2 space-y-1')}><p>{a.created_at} · {a.actor}</p><p>{a.reason}</p><details><summary>Snapshot sebelum / sesudah</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre></details></div>)}{!entries.length && !error && <p className="py-2 text-muted-foreground">Belum ada perubahan tersimpan.</p>}</details>
}
