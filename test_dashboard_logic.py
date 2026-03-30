import os
import sys
# Add current directory to path so it can find models, database, etc.
sys.path.append(os.getcwd())

from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
from sqlalchemy import func
import traceback

def test_dashboard():
    db = SessionLocal()
    try:
        year = 2026
        unit = "ALL"
        komoditi = "ALL"
        
        print(f"Testing dashboard for year {year}...")
        
        # Base queries
        q_kontrak = db.query(models.Kontrak).filter(func.extract('year', models.Kontrak.tanggal_kontrak) == year)
        q_invoice = db.query(models.Invoice).filter(func.extract('year', models.Invoice.tanggal_transaksi) == year)
        q_do = db.query(models.DeliveryOrder).filter(func.extract('year', models.DeliveryOrder.tanggal_do) == year)
        q_b = db.query(models.LaporanBypass).filter(func.extract('year', models.LaporanBypass.tanggal) == year)

        print("Counting...")
        print(f"Kontrak: {q_kontrak.count()}")
        print(f"Invoice: {q_invoice.count()}")
        
        kontrak_ids = q_kontrak.with_entities(models.Kontrak.no_kontrak)
        print("Extracting monthly...")
        mk_q = db.query(func.extract('month', models.Kontrak.tanggal_kontrak), func.sum(models.Kontrak.nilai_transaksi)).filter(models.Kontrak.no_kontrak.in_(kontrak_ids)).group_by(func.extract('month', models.Kontrak.tanggal_kontrak)).all()
        print(f"Monthly results: {len(mk_q)}")
        
        print("Dashboard Test Success!")
        
    except Exception:
        print("DASHBOARD TEST FAILED!")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_dashboard()
