"""Conservative, versioned domestic sales classification; never posts tax or money.

Price before VAT is not fiscal DPP. Local proforma date is only the assessment
reference; this module does not verify tax invoice dates or deposit evidence.
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import re

RULE_VERSION = 'ID-SALES-2026-10-07.1'
LEGAL_SOURCES = {
    'pph22': 'https://jdih.kemenkeu.go.id/dok/pmk-51-tahun-2025',
    'vat_general': 'https://jdih.kemenkeu.go.id/dok/pmk-131-tahun-2024',
    'vat_bhpt': 'https://jdih.kemenkeu.go.id/dok/pmk-11-tahun-2025',
    'vat_exempt': 'https://jdih.kemenkeu.go.id/dok/pp-49-tahun-2022',
}


def source_key(*parts):
    # Exact normalized match, no guessing industry status or product equivalence.
    text = '|'.join(re.sub(r'\s+', ' ', str(p or '').strip()).casefold() for p in parts)
    return hashlib.sha256(text.encode()).hexdigest()


def money(value):
    return float(Decimal(str(value)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP))


def applicable(profile, reference_date):
    return bool(profile and profile['verified'] and profile['effective_from'] <= reference_date
                and (not profile.get('effective_until') or reference_date <= profile['effective_until']))


def classify_tax(source, partner=None, product=None):
    reference_date = source['reference_date']
    warnings = ['Tanggal proforma lokal adalah acuan penilaian, bukan konfirmasi saat terutang pajak.']
    result = {'rule_version': RULE_VERSION, 'status': 'review', 'vat_scheme': None,
              'vat_rate': None, 'statutory_vat_rate': None, 'fiscal_dpp': None,
              'pph_type': None, 'pph_rate': None, 'vat_amount': None, 'pph_amount': None,
              'collector': None, 'legal_basis': [], 'warnings': warnings}
    if not date(2025, 8, 1) <= date.fromisoformat(reference_date) <= date(2026, 10, 7):
        warnings.append('Tanggal di luar cakupan aturan versi ini; gunakan penelaahan manual.')
        return result
    net = Decimal(str(source['price_before_vat']))
    if not net.is_finite() or net <= 0:
        warnings.append('Nilai sebelum PPN belum valid.')
        return result
    if not applicable(partner, reference_date):
        warnings.append('Profil pajak mitra belum terverifikasi atau belum berlaku pada tanggal ini.')
    if not applicable(product, reference_date):
        warnings.append('Profil produk belum terverifikasi atau belum berlaku pada tanggal ini.')
    if not applicable(partner, reference_date) or not applicable(product, reference_date):
        return result
    buyer = partner['settings']
    goods = product['settings']
    if not buyer.get('domestic') or not goods.get('specification_confirmed'):
        warnings.append('Lingkup domestik dan spesifikasi produk perlu dikonfirmasi.')
        return result
    scheme = goods.get('vat_scheme', 'unknown')
    if scheme in {'general_nonluxury', 'bhpt_specific'} and not goods.get('seller_pkp_confirmed'):
        warnings.append('Status PKP penjual belum dikonfirmasi; PPN tidak ditetapkan otomatis.')
    elif scheme == 'general_nonluxury':
        result.update(vat_scheme=scheme, vat_rate=11, statutory_vat_rate=12,
                      fiscal_dpp=money(net * Decimal(11) / Decimal(12)))
        result['legal_basis'].append('PMK 131/2024 Pasal 3: 12% × DPP nilai lain 11/12 harga jual.')
    elif scheme == 'bhpt_specific' and goods.get('bhpt_election_confirmed'):
        result.update(vat_scheme=scheme, vat_rate=1.1, statutory_vat_rate=12)
        result['legal_basis'].append('PMK 64/2022 jo. PMK 11/2025 Pasal 15: besaran tertentu 1,1% harga jual; pemilihan skema PKP harus didukung bukti.')
    elif scheme in {'exempt_sugar', 'exempt_livestock'}:
        result.update(vat_scheme=scheme, vat_rate=0)
        result['legal_basis'].append('PP 49/2022: PPN dibebaskan sesuai kriteria produk terverifikasi, bukan tarif nol persen.')
    else:
        warnings.append('Skema PPN belum ditetapkan dalam master produk.')
    role = buyer.get('role', 'unknown')
    if role == 'industry_exporter' and buyer.get('industrial_use') and goods.get('manufacturing') == 'unprocessed' and goods.get('pph22_agri_eligible'):
        result['legal_basis'].append('PMK 51/2025 Pasal 2(1)g, 3(1)f dan 4(1)e6: PPh 22 bahan belum melalui industri manufaktur; pengecualian Rp20 juta per masa pajak.')
        if not buyer.get('tax_identity_confirmed'):
            warnings.append('Identitas pajak pembeli belum terverifikasi; tarif PPh memerlukan telaah.')
        elif net > Decimal(20000000):
            result.update(pph_type='PPh 22', pph_rate=0.25, collector='Pembeli industri/eksportir')
        else:
            warnings.append('Nilai ≤ Rp20 juta: kelengkapan pembelian satu masa pajak dan pengecualian belum terverifikasi; tidak otomatis PPh nol.')
    elif role == 'trader':
        result.update(pph_type='Tidak dipungut', pph_rate=0, collector='Tidak ada pemungut PPh 22 berdasarkan profil terverifikasi')
        result['legal_basis'].append('PMK 51/2025 Pasal 2: pembeli terverifikasi pedagang biasa, bukan pemungut yang ditentukan.')
    else:
        warnings.append('PPh memerlukan telaah: peran pemungut, tujuan pembelian, proses manufaktur, pengecualian atau pajak lain belum tercakup otomatis.')
    if result['vat_rate'] is not None:
        result['vat_amount'] = money(net * Decimal(str(result['vat_rate'])) / 100)
    if result['pph_rate'] is not None:
        result['pph_amount'] = money(net * Decimal(str(result['pph_rate'])) / 100)
    if result['vat_rate'] is not None and result['pph_rate'] is not None:
        result['status'] = 'automatic'
    return result


def manual_tax(source, values):
    net = Decimal(str(source['price_before_vat']))
    result = {'rule_version': RULE_VERSION, 'status': 'manual', **values,
              'statutory_vat_rate': None, 'fiscal_dpp': None, 'collector': 'Sesuai penelaahan manual',
              'legal_basis': [values['legal_basis']], 'warnings': ['Koreksi manual; bukan hasil verifikasi otomatis atau bukti penyetoran.']}
    result['vat_amount'] = money(net * Decimal(str(values['vat_rate'])) / 100)
    result['pph_amount'] = money(net * Decimal(str(values['pph_rate'])) / 100)
    return result
