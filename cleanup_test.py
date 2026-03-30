import sqlite3

try:
    conn = sqlite3.connect('blueprint.db')
    cursor = conn.cursor()
    cursor.execute("DELETE FROM laporan_bypass WHERE unit = 'Labuan'")
    rows = cursor.rowcount
    conn.commit()
    conn.close()
    print(f"Bypass records for 'Labuan' deleted: {rows}")
except Exception as e:
    print(f"Error: {e}")
