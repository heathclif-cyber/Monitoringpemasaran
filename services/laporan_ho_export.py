"""Export laporan ke format HO — hanya mengisi bagian Penjualan Lokal (baris 71–99)."""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from openpyxl import load_workbook

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "laporan_ho_template.xlsx"

MONTHS_ID = [
    "",
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
]

# Baris komoditas di sheet template (kolom C = uraian)
LOKAL_ROW_BY_KEY: dict[str, int] = {
    "minyak_sawit": 71,
    "inti_sawit": 72,
    "pko": 73,
    "pkm": 74,
    "tbs": 75,
    "karet_rss1": 77,
    "karet_sir10": 78,
    "karet_sir20": 79,
    "karet_lateks": 80,
    "karet_lainnya": 81,
    "teh_ctc": 83,
    "teh_orthodox": 84,
    "teh_hijau": 85,
    "teh_lainnya": 86,
    "gula": 87,
    "tetes": 88,
    "kopi_arabika": 90,
    "kopi_robusta": 91,
    "kakao_edel": 93,
    "kakao_bulk": 94,
    "kayu": 95,
    "tembakau": 96,
    "hortikultura": 97,
    "forestry": 98,
    "lain_lain": 99,
}

LOKAL_DATA_ROWS = sorted(LOKAL_ROW_BY_KEY.values())


@dataclass
class HoBucket:
    kuantum: float = 0.0
    nilai: float = 0.0

    def add(self, kuantum: float, nilai: float) -> None:
        self.kuantum += kuantum
        self.nilai += nilai

    @property
    def per_unit(self) -> float:
        return self.nilai / self.kuantum if self.kuantum > 0 else 0.0


def _norm(text: str | None) -> str:
    return (text or "").strip().lower()


def map_komoditi_to_ho_key(komoditi: str | None, deskripsi: str | None) -> str:
    k = _norm(komoditi)
    d = _norm(deskripsi)
    combined = f"{k} {d}"

    if any(x in combined for x in ("minyak sawit", "cpo", "crude palm", "sawit mentah")):
        return "minyak_sawit"
    if any(x in combined for x in ("inti sawit", "kernel", "intan sawit", "pk")) and "pko" not in combined and "pkm" not in combined:
        return "inti_sawit"
    if "pko" in combined or "palm kernel oil" in combined:
        return "pko"
    if any(x in combined for x in ("pkm", "pke", "palm kernel meal", "bungkil")):
        return "pkm"
    if any(x in combined for x in ("tbs", "tandan buah segar", "fresh fruit bunch")):
        return "tbs"

    if "karet" in k or "rubber" in k or "rss" in combined or "sir" in combined or "latek" in combined or "latex" in combined or "crepe" in combined or "lump" in combined:
        if "rss" in combined and ("1" in combined or "rss1" in combined or "rss 1" in combined):
            return "karet_rss1"
        if "sir 10" in combined or "sir10" in combined:
            return "karet_sir10"
        if "sir 20" in combined or "sir20" in combined:
            return "karet_sir20"
        if "latek" in combined or "latex" in combined:
            return "karet_lateks"
        return "karet_lainnya"

    if "teh" in k or "tea" in k:
        if "ctc" in combined:
            return "teh_ctc"
        if "orthodox" in combined:
            return "teh_orthodox"
        if "hijau" in combined or "green" in combined:
            return "teh_hijau"
        return "teh_lainnya"

    if any(x in combined for x in ("tetes", "molasses", "vit c")):
        return "tetes"

    # Tebu (komoditi) + material gula (gapoktan, kemasan PG, dll.) → baris Gula
    if (
        "gula" in k
        or "sugar" in k
        or "tebu" in k
        or "gula" in d
        or "gapoktan" in combined
        or "kemasan" in d and "kg" in d
    ):
        return "gula"

    if "kopi" in k or "coffee" in k:
        if "arabika" in combined or "arabica" in combined:
            return "kopi_arabika"
        if "robusta" in combined:
            return "kopi_robusta"
        return "kopi_robusta"

    if "kakao" in k or "cocoa" in k or "cacao" in k:
        if "edel" in combined:
            return "kakao_edel"
        if "bulk" in combined:
            return "kakao_bulk"
        return "kakao_bulk"

    if "kayu" in k or "wood" in k or "timber" in k:
        return "kayu"
    if "tembakau" in k or "tobacco" in k:
        return "tembakau"
    if any(x in combined for x in ("hortikultura", "horti", "sayur", "buah")):
        return "hortikultura"
    if "forestry" in combined or "hutan" in k:
        return "forestry"

    if "kelapa" in k or "kopra" in k:
        return "lain_lain"
    if "sawit" in k:
        return "tbs"

    return "lain_lain"


def _extract_year_month(row: dict, mode: str) -> tuple[str, str]:
    if row.get("No_BA"):
        bulan_buku = row.get("Bulan_Buku") or ""
        month = bulan_buku[:2] if len(bulan_buku) >= 2 else ""
        for field in ("Rencana_Pengambilan", "Tanggal_BA", "Raw_Date"):
            raw = row.get(field) or ""
            if len(raw) >= 7 and raw[4] == "-":
                return raw[:4], month
        return "", month

    if mode == "RENCANA":
        rencana = row.get("Rencana_Pengambilan") or ""
        if len(rencana) >= 7:
            return rencana[:4], rencana[5:7]
        bulan_buku = row.get("Bulan_Buku") or ""
        month = bulan_buku[:2] if len(bulan_buku) >= 2 else ""
        raw = row.get("Raw_Date") or row.get("Billing_Date") or ""
        year = raw[:4] if len(raw) >= 4 else ""
        return year, month

    raw = row.get("Raw_Date") or ""
    if len(raw) >= 7:
        return raw[:4], raw[5:7]

    transfer = row.get("Tanggal_Transfer") or ""
    if "/" in transfer:
        parts = transfer.split("/")
        if len(parts) == 3:
            return parts[2], parts[1].zfill(2)

    bulan_buku = row.get("Bulan_Buku") or ""
    month = bulan_buku[:2] if len(bulan_buku) >= 2 else ""
    for field in ("Raw_Date", "Billing_Date"):
        raw = row.get(field) or ""
        if len(raw) >= 4:
            return raw[:4], month
    return "", month


def _row_kuantum_nilai(row: dict) -> tuple[float, float]:
    satuan = _norm(row.get("Satuan") or "kg")
    volume = float(row.get("Jumlah_DO") or 0)
    nilai = float(row.get("DPP_Pokok") or row.get("Pendapatan_Pokok") or 0)
    if satuan == "butir":
        return 0.0, nilai
    return volume, nilai


def _aggregate_lokal(
    rows: Iterable[dict],
    *,
    year: str,
    month: str,
    mode: str,
) -> tuple[dict[str, HoBucket], dict[str, HoBucket]]:
    bulan = {key: HoBucket() for key in LOKAL_ROW_BY_KEY}
    ytd = {key: HoBucket() for key in LOKAL_ROW_BY_KEY}
    month_int = int(month) if month.isdigit() else 0

    for row in rows:
        row_year, row_month = _extract_year_month(row, mode)
        if not row_year or row_year != year or not row_month:
            continue
        try:
            row_month_int = int(row_month)
        except ValueError:
            continue

        key = map_komoditi_to_ho_key(row.get("Komoditi"), row.get("Deskripsi_Produk"))
        kuantum, nilai = _row_kuantum_nilai(row)

        if row_month == month:
            bulan[key].add(kuantum, nilai)
        if row_month_int <= month_int:
            ytd[key].add(kuantum, nilai)

    return bulan, ytd


def _month_label(month: str, year: str) -> str:
    try:
        name = MONTHS_ID[int(month)]
    except (ValueError, IndexError):
        name = month
    return f"   Bulan {name} {year}"


def _ytd_label(month: str, year: str) -> str:
    try:
        name = MONTHS_ID[int(month)]
    except (ValueError, IndexError):
        name = month
    return f"   S/d. Bulan {name} {year}"


def _write_bucket(ws, row_idx: int, bucket: HoBucket, *, col_kuantum: int, col_unit: int, col_nilai: int) -> None:
    ws.cell(row=row_idx, column=col_kuantum, value=round(bucket.kuantum, 2) if bucket.kuantum else 0)
    ws.cell(row=row_idx, column=col_nilai, value=round(bucket.nilai, 0) if bucket.nilai else 0)
    if bucket.kuantum > 0:
        ws.cell(row=row_idx, column=col_unit, value=round(bucket.per_unit, 2))
    else:
        ws.cell(row=row_idx, column=col_unit, value=0)


def generate_laporan_ho_xlsx(
    rows: list[dict],
    *,
    year: str,
    month: str,
    mode: str = "TRANSFER",
) -> bytes:
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Template HO tidak ditemukan: {TEMPLATE_PATH}")

    bulan_data, ytd_data = _aggregate_lokal(rows, year=year, month=month, mode=mode)

    wb = load_workbook(TEMPLATE_PATH)
    ws = wb.active

    ws["D3"] = _month_label(month, year)
    ws["G3"] = _ytd_label(month, year)

    for row_idx in LOKAL_DATA_ROWS:
        for col in (4, 5, 6, 7, 8, 9):
            ws.cell(row=row_idx, column=col, value=0)

    for key, row_idx in LOKAL_ROW_BY_KEY.items():
        _write_bucket(ws, row_idx, bulan_data[key], col_kuantum=4, col_unit=5, col_nilai=6)
        _write_bucket(ws, row_idx, ytd_data[key], col_kuantum=7, col_unit=8, col_nilai=9)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()