"""Authenticated tax assessment sidecar: no mutation of financial documents."""
from datetime import date
import math

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from services.auth import get_current_user, require_admin, require_write
from services.tax_rules import RULE_VERSION, LEGAL_SOURCES, source_key, classify_tax, manual_tax

router = APIRouter(prefix='/api/pajak/v1', tags=['Klasifikasi Pajak'], dependencies=[Depends(get_current_user)])


def profile_dict(p):
    return dict(kind=p.kind, source_key=p.source_key, label=p.label, verified=p.verified,
                effective_from=p.effective_from.isoformat(),
                effective_until=p.effective_until.isoformat() if p.effective_until else None,
                evidence=p.evidence, settings=p.settings, revision=p.revision)


def source_for(inv):
    c = inv.kontrak
    partner = (c.pembeli or '').split('\n')[0].strip() if c else ''
    materials = {(c.komoditi or '', c.jenis_komoditi or '')} if c else {('', '')}
    unit_name = inv.nama_unit or (inv.berita_acara.nama_unit if inv.berita_acara else None)
    unmatched = False
    if c and c.units:
        units = [u for u in c.units if not unit_name or u.nama_unit == unit_name]
        unmatched = not units
        if units:
            materials = {(u.komoditi or c.komoditi or '', u.jenis_komoditi or c.jenis_komoditi or '') for u in units}
    ambiguous = len(materials) != 1 or unmatched
    commodity, variant = sorted(materials)[0]
    vat = float(c.ppn_persen or 0) if c and str(c.is_ppn).lower() == 'true' else 0
    pph = float(c.pph_persen or 0) if c and str(c.is_pph).lower() == 'true' else 0
    # Current invoice API stores gross (pokok + PPN), NOT net after withholding.
    factor = 1 + vat / 100
    net = round(float(inv.jumlah_pembayaran or 0) / factor, 2) if factor > 0 else 0
    return dict(no_invoice=inv.no_invoice, no_kontrak=inv.no_kontrak, partner=partner,
                product=' / '.join(filter(None, (commodity, variant))) or 'Produk belum diketahui',
                partner_key=source_key(partner), product_key=source_key(commodity, variant),
                reference_date=inv.tanggal_transaksi.isoformat(), price_before_vat=net,
                ambiguous_product=ambiguous, stored_vat_rate=vat, stored_pph_rate=pph,
                basis_note='Estimasi dari nilai invoice dan tarif kontrak lama; belum merupakan DPP fiskal atau harga jual terverifikasi.')


def dataset(db):
    invoices = db.query(models.Invoice).options(joinedload(models.Invoice.kontrak).joinedload(models.Kontrak.units), joinedload(models.Invoice.berita_acara)).all()
    sources = [source_for(i) for i in invoices]
    versions = [profile_dict(p) for p in db.query(models.TaxProfile).order_by(models.TaxProfile.revision).all()]
    catalog = {}
    for s in sources:
        for kind, label in [('partner', s['partner']), ('product', s['product'])]:
            key = (kind, s[kind + '_key'])
            catalog.setdefault(key, dict(kind=kind, source_key=key[1], label=label,
                verified=False, effective_from='2025-08-01', effective_until=None, evidence='',
                settings=schemas.TaxProfileSettings().model_dump(), revision=0))
    for p in versions:
        catalog[(p['kind'], p['source_key'])] = p
    return sources, versions, sorted(catalog.values(), key=lambda p: (p['kind'], p['label']))


def assessment(source, versions):
    def match(kind):
        candidates = [p for p in versions if p['kind'] == kind and p['source_key'] == source[kind + '_key']
                      and p['effective_from'] <= source['reference_date']
                      and (not p['effective_until'] or source['reference_date'] <= p['effective_until'])]
        return candidates[-1] if candidates else None
    result = classify_tax(source, match('partner'), match('product'))
    result['warnings'].append(source['basis_note'])
    # An estimate is useful as a recommendation, never authoritative fiscal calculation.
    if source['ambiguous_product']:
        result.update(status='review', vat_rate=None, pph_rate=None, vat_amount=None, pph_amount=None, fiscal_dpp=None)
        result['warnings'].append('Invoice mencakup beberapa material; penilaian per material belum tersedia.')
    return result


def decision_dict(d):
    return dict(mode=d.mode, result=d.result, automatic_snapshot=d.automatic_snapshot,
                source_snapshot=d.source_snapshot, reason=d.reason, actor=d.actor,
                revision=d.revision, updated_at=d.updated_at.isoformat() if d.updated_at else None)


@router.get('')
def read_tax(db: Session = Depends(get_db)):
    sources, versions, profiles = dataset(db)
    saved = {d.no_invoice: d for d in db.query(models.TaxDecision).all()}
    rows = []
    for source in sources:
        auto = assessment(source, versions)
        d = saved.get(source['no_invoice'])
        changed = bool(d and (d.source_snapshot != source or d.automatic_snapshot != auto))
        result = d.result if d and d.mode == 'manual' else auto
        rows.append(dict(source=source, automatic=auto, result=result,
                         decision=decision_dict(d) if d else None, changed_since_decision=changed))
    rows.sort(key=lambda r: (r['source']['reference_date'], r['source']['no_invoice']), reverse=True)
    return dict(rule_version=RULE_VERSION, legal_sources=LEGAL_SOURCES, profiles=profiles, rows=rows)


def lock_key(db, key):
    # Serialize writes for a logical entity, including its first insert.
    db.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))'), {'key': 'tax:' + key})


def audit(db, user, entity, key, before, after, reason):
    db.add(models.TaxAudit(entity=entity, entity_key=key, actor=user.username,
                          action='update' if before else 'create', before=before, after=after, reason=reason.strip()))


@router.put('/profile')
def save_profile(body: schemas.TaxProfileWrite, db: Session = Depends(get_db), user=Depends(require_admin)):
    if len(body.reason.strip()) < 10:
        raise HTTPException(422, 'Alasan perubahan minimal 10 karakter.')
    if body.effective_until and body.effective_until < body.effective_from:
        raise HTTPException(422, 'Tanggal akhir tidak boleh sebelum tanggal mulai.')
    if body.verified and len(body.evidence.strip()) < 10:
        raise HTTPException(422, 'Profil terverifikasi wajib memiliki referensi bukti minimal 10 karakter.')
    lock_key(db, body.kind + ':' + body.source_key)
    _, _, catalog = dataset(db)
    old = next((p for p in catalog if p['kind'] == body.kind and p['source_key'] == body.source_key), None)
    if not old:
        raise HTTPException(404, 'Mitra/produk tidak ditemukan dalam sumber transaksi.')
    if old['revision'] != body.revision:
        raise HTTPException(409, 'Master telah berubah. Muat ulang sebelum menyimpan.')
    p = models.TaxProfile(**body.model_dump(exclude={'reason', 'revision', 'label'}),
                          label=old['label'], revision=old['revision'] + 1)
    db.add(p)
    db.flush()
    result = profile_dict(p)
    audit(db, user, 'profile', body.kind + ':' + body.source_key, old, result, body.reason)
    db.commit()
    return result


@router.put('/decision')
def save_decision(body: schemas.TaxDecisionWrite, db: Session = Depends(get_db), user=Depends(require_write)):
    if len(body.reason.strip()) < 10:
        raise HTTPException(422, 'Alasan keputusan minimal 10 karakter.')
    lock_key(db, body.no_invoice)
    sources, versions, _ = dataset(db)
    source = next((s for s in sources if s['no_invoice'] == body.no_invoice), None)
    if not source:
        raise HTTPException(404, 'Invoice tidak ditemukan.')
    d = db.get(models.TaxDecision, body.no_invoice)
    if (d.revision if d else 0) != body.revision:
        raise HTTPException(409, 'Keputusan telah berubah. Muat ulang sebelum menyimpan.')
    auto = assessment(source, versions)
    result = auto
    if body.mode == 'manual':
        if not math.isfinite(source['price_before_vat']) or source['price_before_vat'] <= 0:
            raise HTTPException(422, 'Nilai dasar invoice belum valid untuk penilaian nominal pajak.')
        m = body.manual
        if not m or len(m.legal_basis.strip()) < 10:
            raise HTTPException(422, 'Dasar hukum/telaah koreksi wajib diisi minimal 10 karakter.')
        if not all(math.isfinite(v) and 0 <= v <= 100 for v in [m.vat_rate, m.pph_rate]):
            raise HTTPException(422, 'Tarif wajib angka valid antara 0–100%.')
        if (m.vat_scheme == 'exempt' and m.vat_rate != 0) or (m.pph_type == 'Tidak dipungut' and m.pph_rate != 0):
            raise HTTPException(422, 'PPN dibebaskan / PPh tidak dipungut wajib bertarif nol dalam penilaian.')
        if m.vat_scheme == 'general_nonluxury' and m.vat_rate != 11 or m.vat_scheme == 'bhpt_specific' and m.vat_rate != 1.1:
            raise HTTPException(422, 'Tarif tidak sesuai skema. Pilih skema lainnya untuk hasil telaah berbeda.')
        result = manual_tax(source, m.model_dump())
    before = decision_dict(d) if d else None
    if not d:
        d = models.TaxDecision(no_invoice=body.no_invoice, revision=0)
        db.add(d)
    d.mode, d.result, d.automatic_snapshot, d.source_snapshot = body.mode, result, auto, source
    d.reason, d.actor, d.revision = body.reason.strip(), user.username, d.revision + 1
    db.flush()
    after = decision_dict(d)
    audit(db, user, 'decision', body.no_invoice, before, after, body.reason)
    db.commit()
    return after


@router.get('/history')
def history(entity: str, key: str, db: Session = Depends(get_db)):
    if entity not in {'profile', 'decision'}:
        raise HTTPException(422, 'Jenis riwayat tidak valid.')
    rows = db.query(models.TaxAudit).filter_by(entity=entity, entity_key=key).order_by(models.TaxAudit.id.desc()).all()
    return [dict(id=a.id, actor=a.actor, action=a.action, before=a.before, after=a.after,
                 reason=a.reason, created_at=a.created_at.isoformat()) for a in rows]
