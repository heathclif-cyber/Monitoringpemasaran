"""Run only in the isolated PostgreSQL tax preview, never against production."""
import os
import unittest
from datetime import date
from types import SimpleNamespace
from urllib.parse import urlparse

from fastapi.testclient import TestClient
from database import SessionLocal
import models
from main import app
from services.auth import create_access_token
from api.r_tax import source_for


class TaxApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        target = urlparse(os.environ['DATABASE_URL'])
        if target.hostname != 'monpem-tax-preview-db' or target.path != '/tax_preview':
            raise RuntimeError('Tax integration tests require the dedicated preview database.')
        cls.db = SessionLocal()
        cls.users = {}
        for role in ['admin', 'staff', 'tamu', 'integrasi']:
            user = models.User(username='tax-test-' + role, hashed_password='not-a-login-hash', nama_lengkap='Tax test', role=role)
            cls.db.add(user)
            cls.db.flush()
            cls.users[role] = user
        cls.db.add(models.Kontrak(no_kontrak='tax-test-contract', tanggal_kontrak=date(2026, 7, 17), pembeli='Tax test buyer',
                   komoditi='Tax test commodity', jenis_komoditi='Tax test unprocessed', volume=1000,
                   harga_satuan=120000, is_ppn='true', ppn_persen=11, is_pph='true', pph_persen=.25))
        cls.db.flush()
        cls.db.add(models.Invoice(no_invoice='tax-test-invoice', no_kontrak='tax-test-contract', tanggal_transaksi=date(2026, 7, 17), jumlah_pembayaran=133200000))
        cls.db.commit()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.db.rollback()
        cls.db.query(models.TaxDecision).filter_by(no_invoice='tax-test-invoice').delete()
        cls.db.query(models.TaxAudit).filter(models.TaxAudit.actor.in_([u.username for u in cls.users.values()])).delete(synchronize_session=False)
        cls.db.query(models.TaxProfile).filter(models.TaxProfile.label.like('Tax test%')).delete(synchronize_session=False)
        cls.db.query(models.Invoice).filter_by(no_invoice='tax-test-invoice').delete()
        cls.db.query(models.Kontrak).filter_by(no_kontrak='tax-test-contract').delete()
        cls.db.query(models.User).filter(models.User.username.in_([u.username for u in cls.users.values()])).delete(synchronize_session=False)
        cls.db.commit()
        cls.db.close()
        cls.client.close()

    def headers(self, role='admin'):
        u = self.users[role]
        return {'Authorization': 'Bearer ' + create_access_token(u.id, u.username, u.role)}

    def get_data(self):
        r = self.client.get('/api/pajak/v1', headers=self.headers())
        self.assertEqual(r.status_code, 200, r.text[:500])
        return r.json()

    def test_01_auth_and_read_do_not_seed_database(self):
        before = self.db.query(models.TaxProfile).count()
        self.assertIn(self.client.get('/api/pajak/v1').status_code, [401, 403])
        self.assertEqual(self.client.get('/api/pajak/v1', headers=self.headers('integrasi')).status_code, 403)
        self.assertEqual(self.client.get('/api/pajak/v1', headers=self.headers('tamu')).status_code, 200)
        self.get_data()
        self.assertEqual(self.db.query(models.TaxProfile).count(), before)

    def test_02_profiles_manual_persistence_audit_and_revision_conflict(self):
        data = self.get_data()
        row = next(r for r in data['rows'] if r['source']['no_invoice'] == 'tax-test-invoice')
        self.assertEqual(row['source']['price_before_vat'], 120000000)
        self.assertIsNone(row['result']['vat_rate'])
        for kind in ['partner', 'product']:
            p = next(p for p in data['profiles'] if p['kind'] == kind and p['label'].startswith('Tax test'))
            p.update(verified=True, evidence='Synthetic verified profile for isolated tests', reason='Isolated integration test profile')
            p['settings'].update(role='industry_exporter', industrial_use=True, domestic=True, tax_identity_confirmed=True,
                                 seller_pkp_confirmed=True, vat_scheme='general_nonluxury', manufacturing='unprocessed', specification_confirmed=True, pph22_agri_eligible=True)
            self.assertEqual(self.client.put('/api/pajak/v1/profile', json=p, headers=self.headers('staff')).status_code, 403)
            self.assertEqual(self.client.put('/api/pajak/v1/profile', json=p, headers=self.headers()).status_code, 200)
            self.assertEqual(self.client.put('/api/pajak/v1/profile', json=p, headers=self.headers()).status_code, 409)
        row = next(r for r in self.get_data()['rows'] if r['source']['no_invoice'] == 'tax-test-invoice')
        self.assertEqual(row['result']['status'], 'automatic')
        self.assertEqual(row['result']['pph_rate'], .25)
        body = dict(no_invoice='tax-test-invoice', revision=0, mode='manual', reason='Synthetic manual correction with supporting review',
                    manual=dict(vat_scheme='exempt', vat_rate=0, pph_type='Tidak dipungut', pph_rate=0, legal_basis='Synthetic exception supported by a tax review'))
        self.assertEqual(self.client.put('/api/pajak/v1/decision', json=body, headers=self.headers('tamu')).status_code, 403)
        invalid = {**body, 'reason': 'short'}
        self.assertEqual(self.client.put('/api/pajak/v1/decision', json=invalid, headers=self.headers('staff')).status_code, 422)
        invalid = {**body, 'manual': {**body['manual'], 'vat_rate': -1}}
        self.assertEqual(self.client.put('/api/pajak/v1/decision', json=invalid, headers=self.headers('staff')).status_code, 422)
        invalid = {**body, 'manual': {**body['manual'], 'vat_rate': 11}}
        self.assertEqual(self.client.put('/api/pajak/v1/decision', json=invalid, headers=self.headers('staff')).status_code, 422)
        self.assertEqual(self.client.put('/api/pajak/v1/decision', json=body, headers=self.headers('staff')).status_code, 200)
        self.assertEqual(self.client.put('/api/pajak/v1/decision', json=body, headers=self.headers('staff')).status_code, 409)
        row = next(r for r in self.get_data()['rows'] if r['source']['no_invoice'] == 'tax-test-invoice')
        self.assertEqual(row['result']['status'], 'manual')
        self.assertEqual(row['result']['vat_rate'], 0)
        self.assertEqual(row['automatic']['vat_rate'], 11)
        # Source change preserves manual snapshot and raises a review signal.
        self.db.query(models.Invoice).filter_by(no_invoice='tax-test-invoice').update({'jumlah_pembayaran': 144300000})
        self.db.commit()
        row = next(r for r in self.get_data()['rows'] if r['source']['no_invoice'] == 'tax-test-invoice')
        self.assertTrue(row['changed_since_decision'])
        self.assertEqual(row['result']['status'], 'manual')
        self.assertEqual(row['decision']['source_snapshot']['price_before_vat'], 120000000)
        history = self.client.get('/api/pajak/v1/history?entity=decision&key=tax-test-invoice', headers=self.headers()).json()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['actor'], 'tax-test-staff')
        self.assertEqual(history[0]['after']['mode'], 'manual')
        reset = dict(no_invoice='tax-test-invoice', revision=1, mode='automatic', reason='Return to verified automatic rules after review')
        self.assertEqual(self.client.put('/api/pajak/v1/decision', json=reset, headers=self.headers('staff')).status_code, 200)
        row = next(r for r in self.get_data()['rows'] if r['source']['no_invoice'] == 'tax-test-invoice')
        self.assertEqual(row['result']['vat_rate'], 11)
        self.assertEqual(row['source']['stored_vat_rate'], 11)
        self.assertEqual(row['source']['stored_pph_rate'], .25)
        history = self.client.get('/api/pajak/v1/history?entity=decision&key=tax-test-invoice', headers=self.headers()).json()
        self.assertEqual(len(history), 2)

    def test_03_multi_material_never_chooses_first_silently(self):
        c = SimpleNamespace(pembeli='Buyer', komoditi='A', jenis_komoditi='one', ppn_persen=11, pph_persen=.25,
                            is_ppn='true', is_pph='true', units=[SimpleNamespace(nama_unit='unit1', komoditi='A', jenis_komoditi='one'),
                                                                 SimpleNamespace(nama_unit='unit2', komoditi='B', jenis_komoditi='two')])
        inv = SimpleNamespace(kontrak=c, nama_unit=None, berita_acara=None, jumlah_pembayaran=111000000,
                              no_invoice='fake', no_kontrak='fake', tanggal_transaksi=date(2026, 7, 17))
        self.assertTrue(source_for(inv)['ambiguous_product'])
        inv.nama_unit = 'unit2'
        self.assertFalse(source_for(inv)['ambiguous_product'])
        self.assertEqual(source_for(inv)['product'], 'B / two')
