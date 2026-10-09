import unittest
from types import SimpleNamespace
from api.r_laporan import _invoice_pickup_metrics


class PickupTotalsTests(unittest.TestCase):
    def test_do_basis_and_unique_related_ba(self):
        bas = {"B1": SimpleNamespace(status="Selesai", volume_ba=60),
               "OTHER": SimpleNamespace(status="Selesai", volume_ba=1000)}
        invoice = SimpleNamespace(no_ba="B1", delivery_orders=[
            SimpleNamespace(no_ba="B1", volume_do=40),
            SimpleNamespace(no_ba="B1", volume_do=40)])
        self.assertEqual(_invoice_pickup_metrics(invoice, bas, 100), (60, 20))

    def test_no_do_has_no_outstanding_and_draft_not_counted(self):
        invoice = SimpleNamespace(no_ba="B1", delivery_orders=[])
        bas = {"B1": SimpleNamespace(status="Draft", volume_ba=60)}
        self.assertEqual(_invoice_pickup_metrics(invoice, bas, 100), (None, 0))
        bas["B1"].status = "Ter-invoice"
        self.assertEqual(_invoice_pickup_metrics(invoice, bas, 100), (60, 0))
        invoice.delivery_orders = [SimpleNamespace(no_ba="B1", volume_do=80)]
        bas["B1"].status = "Draft"
        self.assertEqual(_invoice_pickup_metrics(invoice, bas, 100), (None, 80))


if __name__ == "__main__":
    unittest.main()
