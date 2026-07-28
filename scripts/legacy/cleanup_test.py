import sqlite3
from pathlib import Path

try:
    db_path = Path(__file__).resolve().parents[2] / "var" / "data" / "blueprint.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM laporan_bypass WHERE unit = 'Labuan'")
    rows = cursor.rowcount
    conn.commit()
    conn.close()
    print(f"Bypass records for 'Labuan' deleted: {rows}")
except Exception as e:
    print(f"Error: {e}")
