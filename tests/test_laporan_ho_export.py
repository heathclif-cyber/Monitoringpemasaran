import unittest
from datetime import date
from types import SimpleNamespace

from services.laporan_ho_export import (
    _aggregate_lokal, _ba_to_ho_row, _extract_year_month,
    _matches_ho_filters, _row_kuantum_nilai, _write_bucket,
    HoBucket, prepare_ho_export_rows,
    _planned_do_to_ho_row,
)


class HoExportTests(unittest.TestCase):
    def test_ba_date_overrides_book_period(self):
        row = dict(No_BA="BA1", Raw_Bulan_Buku="2025-12-01",
                   Bulan_Buku="12-Desember", Tanggal_BA="2026-01-05")
        for mode in ("TRANSFER", "RENCANA"):
            self.assertEqual(_extract_year_month(row, mode), ("2026", "01"))

    def test_ba_not_payment_or_do(self):
        ba = dict(No_BA="BA1", Jumlah_DO=1000, Pendapatan_Pokok=10000000)
        for volume in (0, 250):
            client = dict(No_BA="BA1", Jumlah_DO=volume, Pendapatan_Pokok=2500000)
            result = prepare_ho_export_rows([client, client], [ba, ba])
            self.assertEqual(result, [ba])

    def test_month_and_cumulative(self):
        rows = [dict(Raw_Date=f"2026-{month}-01", Komoditi="gula",
                     Jumlah_DO=volume, Pendapatan_Pokok=volume * 10000)
                for month, volume in (("01", 100), ("03", 200), ("04", 400))]
        monthly, cumulative = _aggregate_lokal(rows, year="2026", month="03", mode="TRANSFER")
        self.assertEqual(monthly["gula"].kuantum, 200)
        self.assertEqual(cumulative["gula"].kuantum, 300)
        self.assertEqual(cumulative["gula"].nilai, 3000000)

    def test_average_price(self):
        from openpyxl import Workbook
        sheet = Workbook().active
        _write_bucket(sheet, 87, HoBucket(300, 4000000), col_kuantum=4, col_nilai=6)
        self.assertEqual(sheet["E87"].value, 13333.33)
        _write_bucket(sheet, 88, HoBucket(0, 100), col_kuantum=4, col_nilai=6)
        self.assertIsNone(sheet["E88"].value)

    def test_filters(self):
        row = dict(No_BA="BA1", Mitra_Pembeli="Mitra A", Deskripsi_Produk="CTC", No_Kontrak="K1")
        self.assertTrue(_matches_ho_filters(row, {"pembeli": ["Mitra A"]}, []))
        self.assertFalse(_matches_ho_filters(row, {"pembeli": ["Mitra B"]}, []))
        self.assertFalse(_matches_ho_filters(row, {"jenisKomoditi": ["Hijau"]}, []))
        self.assertFalse(_matches_ho_filters(row, {"tipe": "ONLY_BYPASS"}, []))
        self.assertTrue(_matches_ho_filters(row, {"statusBayar": "LUNAS"}, [row]))
        self.assertFalse(_matches_ho_filters(row, {"statusBayar": "LUNAS"}, []))

    def test_period_standard_vs_monthly_ba(self):
        contract = SimpleNamespace(volume=1000, harga_satuan=10000, premi=0,
            tipe_alur="STANDAR", komoditi="gula", jenis_komoditi="gula",
            deskripsi_produk="", kebun_produsen="Unit", satuan="Kg",
            pembeli="Mitra", no_kontrak="K1")
        ba = SimpleNamespace(volume_ba=100, harga_satuan=10000,
            bulan_buku=date(2025, 12, 1), tanggal_ba=date(2026, 1, 5),
            komoditi="gula", deskripsi="", nama_unit="", no_ba="BA1")
        row = _ba_to_ho_row(ba, contract)
        self.assertEqual(row["Raw_Bulan_Buku"], "2026-01-05")
        contract.tipe_alur = "PAYUNG_BA"
        row = _ba_to_ho_row(ba, contract)
        self.assertEqual(row["Raw_Bulan_Buku"], "2026-01-05")
        self.assertEqual(row["Pendapatan_Pokok"], 1000000)

    def test_units(self):
        self.assertEqual(_row_kuantum_nilai(dict(Satuan="Ton", Jumlah_DO=2, Pendapatan_Pokok=100)), (2000, 100))
        self.assertEqual(_row_kuantum_nilai(dict(Satuan="EA", Jumlah_DO=2, Pendapatan_Pokok=100)), (0, 100))

    def test_planned_pickup_fallback(self):
        contract = SimpleNamespace(volume=1000, harga_satuan=10000, premi=100000,
            no_kontrak="K1", kebun_produsen="Unit", komoditi="gula",
            jenis_komoditi="gula", deskripsi_produk="", pembeli="Mitra", satuan="Kg")
        invoice = SimpleNamespace(kontrak=contract, no_ba=None, no_invoice="I1", nama_unit=None)
        do = SimpleNamespace(invoice=invoice, no_ba=None, no_do="DO1", volume_do=100,
            rencana_pengambilan=date(2026, 9, 14), tanggal_pembayaran=date(2026, 10, 1))
        row = _planned_do_to_ho_row(do)
        self.assertEqual(row["Pendapatan_Pokok"], 1010000)
        for mode in ("TRANSFER", "RENCANA"):
            self.assertEqual(_extract_year_month(row, mode), ("2026", "09"))
        self.assertTrue(_matches_ho_filters(row, {"statusBayar": "LUNAS"}, [row]))
        do.no_ba = "BA1"
        self.assertIsNone(_planned_do_to_ho_row(do))
        do.no_ba = None
        invoice.no_ba = "BA1"
        self.assertIsNone(_planned_do_to_ho_row(do))
        invoice.no_ba = None
        do.rencana_pengambilan = None
        self.assertIsNone(_planned_do_to_ho_row(do))


if __name__ == "__main__":
    unittest.main()
