import unittest
import io
from unittest.mock import patch
from datetime import date
from fastapi import HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import engine
from api.r_ba import create_ba, get_available_ba, delete_ba
from api.r_invoice import create_invoice, delete_invoice
from api.r_do import create_do, delete_do
from api.r_laporan import _invoice_pickup_metrics, _resolve_ba_ref
from services.ba_linkage import ensure_schema, reconcile_orphan_invoice_status


class BAWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Test DB must be isolated, never a production connection.
        if engine.url.database != "tax_preview":
            raise RuntimeError("BA workflow tests require isolated tax_preview database")
        ensure_schema(engine)

    def setUp(self):
        self.connection = engine.connect()
        self.transaction = self.connection.begin()
        self.db = Session(bind=self.connection, join_transaction_mode="create_savepoint")
        self.contract = models.Kontrak(no_kontrak="TEST-LINK-K", tanggal_kontrak=date(2026, 9, 1),
            volume=100, harga_satuan=10, premi=0, is_ppn="false", is_pph="false",
            tipe_alur="STANDAR", kebun_produsen="TEST-LINK-UNIT", komoditi="Kelapa", satuan="Kg")
        self.invoice = models.Invoice(no_invoice="TEST-LINK-I", no_kontrak=self.contract.no_kontrak,
            tanggal_transaksi=date(2026, 9, 1), volume=100, jumlah_pembayaran=1000, superman="SPP")
        self.do = models.DeliveryOrder(no_do="TEST-LINK-DO", no_invoice=self.invoice.no_invoice,
            tanggal_do=date(2026, 9, 2), volume_do=80, rencana_pengambilan=date(2026, 9, 3))
        self.db.add_all([self.contract, self.invoice, self.do])
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.transaction.rollback()
        self.connection.close()

    def save_ba(self, no="TEST-LINK-BA", volume=30, status="Selesai", no_do=None):
        return create_ba(schemas.BeritaAcaraCreate(no_ba=no, no_kontrak=self.contract.no_kontrak,
            tanggal_ba=date(2026, 9, 30), volume_ba=volume, status=status, no_do=no_do), self.db, None)

    def test_normal_auto_link_and_partial_pickups(self):
        first = self.save_ba(volume=30)
        self.assertEqual(first.no_do, self.do.no_do)
        second = self.save_ba(no="TEST-LINK-BA2", volume=20)
        bas = {b.no_ba: b for b in (first, second)}
        self.assertEqual(_invoice_pickup_metrics(self.invoice, bas, 100), (50, 30))
        self.assertEqual(_resolve_ba_ref(self.contract, self.invoice, self.do, bas).tanggal_ba, date(2026, 9, 30))
        with self.assertRaises(HTTPException):
            self.save_ba(no="TEST-LINK-BA3", volume=31)

    def test_edit_excludes_own_volume(self):
        self.save_ba(volume=70)
        edited = self.save_ba(volume=80)
        self.assertEqual(edited.volume_ba, 80)

    def test_draft_not_actual_and_finalize(self):
        draft = self.save_ba(status="Draft")
        self.assertEqual(_invoice_pickup_metrics(self.invoice, {draft.no_ba:draft}, 100), (None,80))
        final = self.save_ba(status="Selesai")
        self.assertEqual(_invoice_pickup_metrics(self.invoice, {final.no_ba:final}, 100), (30,50))

    def test_ambiguous_requires_selection(self):
        other = models.DeliveryOrder(no_do="TEST-LINK-DO2", no_invoice=self.invoice.no_invoice,
            tanggal_do=date(2026,9,2),volume_do=40)
        self.db.add(other); self.db.flush()
        with self.assertRaises(HTTPException): self.save_ba()
        self.assertEqual(self.save_ba(no_do=other.no_do).no_do,other.no_do)

    def test_wrong_do_and_delete_guards(self):
        with self.assertRaises(HTTPException): self.save_ba(no_do="DO-NOT-FOUND")
        ba=self.save_ba()
        with self.assertRaises(HTTPException): delete_do(self.do.no_do,self.db,None)
        with self.assertRaises(HTTPException): delete_ba(ba.no_ba,self.db,None)
        with self.assertRaises(HTTPException): delete_invoice(self.invoice.no_invoice,self.db,None)

    def test_payung_starts_ba_and_requires_realization(self):
        self.db.delete(self.do); self.db.delete(self.invoice)
        self.contract.tipe_alur="PAYUNG_BA"; self.db.flush()
        data=schemas.BeritaAcaraCreate(no_ba="TEST-LINK-BA",no_kontrak=self.contract.no_kontrak,
            tanggal_ba=date(2026,9,30),volume_ba=50,harga_satuan=10,status="Draft")
        ba=create_ba(data,self.db,None)
        inv=schemas.InvoiceCreate(no_invoice="TEST-LINK-PAYUNG",no_kontrak=self.contract.no_kontrak,
            no_ba=ba.no_ba,tanggal_transaksi=date(2026,9,30),volume=50)
        with self.assertRaises(HTTPException): create_invoice(inv,self.db,None)
        ba=create_ba(data.model_copy(update={"status":"Selesai"}),self.db,None)
        saved=create_invoice(inv,self.db,None)
        self.assertEqual(saved.no_ba,ba.no_ba)
        self.assertEqual(ba.status,"Ter-invoice")
        self.assertIsNone(ba.no_do)

    def test_available_is_read_only(self):
        self.contract.tipe_alur="PAYUNG_BA"
        ba=models.BeritaAcara(no_ba="TEST-LINK-BA",no_kontrak=self.contract.no_kontrak,
            tanggal_ba=date(2026,9,30),volume_ba=20,harga_satuan=10,status="Ter-invoice")
        self.db.add(ba); self.db.flush()
        get_available_ba(self.contract.no_kontrak,self.db)
        self.assertEqual(ba.status,"Ter-invoice")
        changed=reconcile_orphan_invoice_status(self.db)
        self.assertIn(ba.no_ba,changed)
        self.assertEqual(ba.status,"Selesai")

    def test_payung_do_inherits_invoice_ba_and_rejects_other_ba(self):
        self.contract.tipe_alur="PAYUNG_BA"
        first=models.BeritaAcara(no_ba="TEST-LINK-B1",no_kontrak=self.contract.no_kontrak,
            tanggal_ba=date(2026,9,3),volume_ba=100,harga_satuan=10,status="Ter-invoice")
        other=models.BeritaAcara(no_ba="TEST-LINK-B2",no_kontrak=self.contract.no_kontrak,
            tanggal_ba=date(2026,9,4),volume_ba=100,harga_satuan=10,status="Selesai")
        self.db.add_all([first,other]); self.db.flush()
        self.invoice.no_ba=first.no_ba
        payment=models.Pembayaran(no_pembayaran="TEST-LINK-P",no_invoice=self.invoice.no_invoice,
            tanggal_pembayaran=date(2026,9,2),nominal_transfer=800)
        self.db.add(payment); self.db.flush()
        data=schemas.DeliveryOrderCreate(no_do=self.do.no_do,no_invoice=self.invoice.no_invoice,
            no_pembayaran=payment.no_pembayaran,tanggal_do=date(2026,9,2),volume_do=80,no_ba=other.no_ba)
        with self.assertRaises(HTTPException): create_do(data,self.db,None)
        with patch("api.r_do.reverse_stok_do"),patch("api.r_do.record_stok_keluar_do"),patch(
            "api.r_do.resolve_do_stock_context",return_value={"jenis_material":"Kelapa","unit":"Unit"}):
            saved=create_do(data.model_copy(update={"no_ba":None}),self.db,None)
        self.assertEqual(saved.no_ba,first.no_ba)

    def test_invoice_parent_change_blocked_after_do(self):
        data=schemas.InvoiceCreate(no_invoice=self.invoice.no_invoice,no_kontrak=self.contract.no_kontrak,
            tanggal_transaksi=date(2026,9,1),volume=90,jumlah_pembayaran=900)
        with self.assertRaises(HTTPException): create_invoice(data,self.db,None)

    def test_ho_realized_ba_replaces_planned_do_without_duplicate(self):
        from openpyxl import load_workbook
        from services.laporan_ho_export import generate_laporan_ho_xlsx
        self.save_ba(volume=30)
        content=generate_laporan_ho_xlsx([],year="2026",month="09",db=self.db,
            filters={"units":["TEST-LINK-UNIT"]})
        sheet=load_workbook(io.BytesIO(content)).active
        self.assertEqual(sheet["D99"].value,30)
        self.assertEqual(sheet["F99"].value,300)


if __name__ == "__main__":
    unittest.main()
