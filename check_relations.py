from database import SessionLocal
from models import Invoice, DeliveryOrder, Kontrak

db = SessionLocal()

print("=== CEK RELASI INVOICE -> KONTRAK ===")
invs = db.query(Invoice).all()
for inv in invs:
    k = inv.kontrak
    status = "OK" if k else "BROKEN - kontrak tidak ditemukan!"
    print(f"  Invoice: {inv.no_invoice} | no_kontrak: {inv.no_kontrak} | Relasi: {status}")

print()

print("=== CEK RELASI DO -> INVOICE ===")
dos = db.query(DeliveryOrder).all()
for do in dos:
    inv = do.invoice
    if inv:
        k = inv.kontrak
        k_status = "OK" if k else "BROKEN - kontrak tidak ditemukan!"
        print(f"  DO: {do.no_do} | no_invoice: {do.no_invoice} | Invoice: OK | Kontrak: {k_status}")
    else:
        print(f"  DO: {do.no_do} | no_invoice: {do.no_invoice} | Invoice: BROKEN - tidak ditemukan!")

print()

print("=== CEK API /api/kontrak/{no} ===")
import requests
sample_kontrak = db.query(Kontrak).first()
if sample_kontrak:
    r = requests.get(f"http://localhost:8000/api/kontrak/{sample_kontrak.no_kontrak}")
    print(f"  GET /api/kontrak/{sample_kontrak.no_kontrak} -> status: {r.status_code}")
    if r.ok:
        data = r.json()
        print(f"    pembeli: {data.get('pembeli', 'MISSING')}")
        print(f"    komoditi: {data.get('komoditi', 'MISSING')}")
        print(f"    volume: {data.get('volume', 'MISSING')}")
        print(f"    harga_satuan: {data.get('harga_satuan', 'MISSING')}")
        print(f"    ppn_persen: {data.get('ppn_persen', 'MISSING')}")
        print(f"    nilai_transaksi: {data.get('nilai_transaksi', 'MISSING')}")
        print(f"    nominal_ppn: {data.get('nominal_ppn', 'MISSING')}")

print()

print("=== CEK API /api/invoice/{no} ===")
sample_inv = db.query(Invoice).first()
if sample_inv:
    r = requests.get(f"http://localhost:8000/api/invoice/{sample_inv.no_invoice}")
    print(f"  GET /api/invoice/{sample_inv.no_invoice} -> status: {r.status_code}")
    if r.ok:
        data = r.json()
        print(f"    no_kontrak: {data.get('no_kontrak', 'MISSING')}")
        print(f"    jumlah_pembayaran: {data.get('jumlah_pembayaran', 'MISSING')}")

db.close()
