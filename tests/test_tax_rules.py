import copy
import unittest
from services.tax_rules import classify_tax, manual_tax, source_key


class TaxRulesTest(unittest.TestCase):
    def setUp(self):
        self.source = {'reference_date': '2026-07-17', 'price_before_vat': 120000000}
        self.partner = {'verified': True, 'effective_from': '2025-08-01', 'effective_until': None,
                        'settings': {'domestic': True, 'role': 'industry_exporter', 'industrial_use': True, 'tax_identity_confirmed': True}}
        self.product = {'verified': True, 'effective_from': '2025-08-01', 'effective_until': None,
                        'settings': {'specification_confirmed': True, 'seller_pkp_confirmed': True,
                                     'vat_scheme': 'general_nonluxury', 'manufacturing': 'unprocessed', 'pph22_agri_eligible': True}}

    def assess(self):
        return classify_tax(self.source, self.partner, self.product)

    def test_unknown_profiles_are_not_zero_tax(self):
        r = classify_tax(self.source)
        self.assertEqual(r['status'], 'review')
        self.assertIsNone(r['vat_rate'])
        self.assertIsNone(r['pph_rate'])

    def test_unverified_master_never_guesses(self):
        self.partner['verified'] = False
        self.assertIsNone(self.assess()['pph_rate'])

    def test_general_vat_distinguishes_fiscal_dpp(self):
        r = self.assess()
        self.assertEqual(r['vat_rate'], 11)
        self.assertEqual(r['statutory_vat_rate'], 12)
        self.assertEqual(r['fiscal_dpp'], 110000000)
        self.assertEqual(r['vat_amount'], 13200000)
        self.assertEqual(r['pph_amount'], 300000)
        self.assertEqual(r['status'], 'automatic')

    def test_bhpt_requires_election_evidence(self):
        self.product['settings']['vat_scheme'] = 'bhpt_specific'
        self.assertIsNone(self.assess()['vat_rate'])
        self.product['settings']['bhpt_election_confirmed'] = True
        self.assertEqual(self.assess()['vat_rate'], 1.1)
        self.assertEqual(self.assess()['vat_amount'], 1320000)

    def test_exempt_is_not_statutory_zero(self):
        self.product['settings']['vat_scheme'] = 'exempt_sugar'
        r = self.assess()
        self.assertEqual(r['vat_rate'], 0)
        self.assertIsNone(r['statutory_vat_rate'])
        self.assertEqual(r['vat_scheme'], 'exempt_sugar')

    def test_monthly_exception_not_single_invoice(self):
        for net in [19999999, 20000000]:
            self.source['price_before_vat'] = net
            self.assertIsNone(self.assess()['pph_rate'])
        self.source['price_before_vat'] = 20000000.01
        self.assertEqual(self.assess()['pph_rate'], .25)

    def test_processed_goods_not_blanket_quarter_percent(self):
        self.product['settings']['manufacturing'] = 'processed'
        self.assertIsNone(self.assess()['pph_rate'])

    def test_unverified_commodity_scope_not_blanket_quarter_percent(self):
        self.product['settings']['pph22_agri_eligible'] = False
        self.assertIsNone(self.assess()['pph_rate'])

    def test_npwp_and_pkp_required(self):
        self.partner['settings']['tax_identity_confirmed'] = False
        self.product['settings']['seller_pkp_confirmed'] = False
        self.assertIsNone(self.assess()['pph_rate'])
        self.assertIsNone(self.assess()['vat_rate'])

    def test_trader_not_collector_just_because_pt(self):
        self.partner['settings']['role'] = 'trader'
        self.assertEqual(self.assess()['pph_rate'], 0)
        self.partner['settings']['role'] = 'designated'
        self.assertIsNone(self.assess()['pph_rate'])

    def test_date_window_and_profile_dates(self):
        self.source['reference_date'] = '2025-07-31'
        self.assertIsNone(self.assess()['vat_rate'])
        self.source['reference_date'] = '2026-10-08'
        self.assertIsNone(self.assess()['vat_rate'])
        self.source['reference_date'] = '2026-07-17'
        self.partner['effective_from'] = '2026-07-18'
        self.assertIsNone(self.assess()['pph_rate'])

    def test_manual_separate_snapshot_and_no_mutation(self):
        before = copy.deepcopy(self.source)
        r = manual_tax(self.source, {'vat_scheme': 'exempt', 'vat_rate': 0, 'pph_type': 'PPh 22', 'pph_rate': .25, 'legal_basis': 'Telaah dengan bukti transaksi'})
        self.assertEqual(r['status'], 'manual')
        self.assertEqual(self.source, before)
        self.assertEqual(r['pph_amount'], 300000)

    def test_exact_keys_normalized_not_fuzzy(self):
        self.assertEqual(source_key(' PT   A '), source_key('pt a'))
        self.assertNotEqual(source_key('PT A'), source_key('PT A Industri'))


if __name__ == '__main__':
    unittest.main()
