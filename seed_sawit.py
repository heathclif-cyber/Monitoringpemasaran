import sqlite3
from datetime import datetime

# Raw data from user
raw_data = """
Beteleme	Sawit		04/02/2026	 2.568.163 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		06/02/2026	 3.393.645 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		06/02/2026	 9.661.186 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		11/02/2026	 12.168.204 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		11/02/2026	 19.689.254 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		11/02/2026	 53.931.433 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		20/02/2026	 33.936.446 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		20/02/2026	 29.595.027 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		20/02/2026	 29.729.190 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		20/02/2026	 5.870.088 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		20/02/2026	 27.125.616 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		20/02/2026	 41.354.454 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		23/02/2026	 4.298.926 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		23/02/2026	 26.217.393 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		24/02/2026	 12.351.843 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		24/02/2026	 10.505.121 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		26/02/2026	 17.468.170 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		26/02/2026	 14.077.468 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/03/2026	 27.852.195 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/03/2026	 31.939.202 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/05/2026	 21.888.192 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/05/2026	 29.214.531 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/05/2026	 37.406.998 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/06/2026	 35.662.919 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/06/2026	 21.343.258 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/06/2026	 47.348.731 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/10/2026	 12.109.650 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/10/2026	 20.979.968 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/11/2026	 43.291.999 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		03/12/2026	 15.803.093 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		16/03/2026	 12.351.843 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		16/03/2026	 18.103.927 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		16/03/2026	 52.828.348 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		18/03/2026	 7.477.709 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		23/03/2026	 15.863.641 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		23/03/2026	 24.673.411 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
Beteleme	Sawit		23/03/2026	 4.147.555 	Sinergi Perkebunan Nusantara	Tandan Buah Segar
"""

def seed():
    conn = sqlite3.connect('blueprint.db')
    cursor = conn.cursor()
    
    # Create table if not exists (in case create_all wasn't called)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS laporan_bypass (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit TEXT,
        komoditi TEXT,
        tanggal DATE,
        nominal FLOAT,
        pembeli TEXT,
        deskripsi TEXT,
        superman TEXT,
        kontrak_sap TEXT,
        so_sap TEXT,
        do_sap TEXT,
        billing_sap TEXT
    )
    ''')
    
    # Clear existing data before re-seeding
    cursor.execute('DELETE FROM laporan_bypass')
    
    lines = [l.strip() for l in raw_data.strip().split('\n') if l.strip()]
    
    for line in lines:
        parts = line.split('\t')
        if len(parts) >= 7:
            unit = parts[0].strip()
            komoditi = parts[1].strip()
            date_str = parts[3].strip()
            nominal_str = parts[4].strip().replace('.', '').replace(',', '.')
            pembeli = parts[5].strip()
            desc = parts[6].strip()
            
            # Smart Date Parsing for this specific dataset
            # Target: Month is either February (02) or March (03)
            try:
                parts = date_str.split('/')
                p1, p2, year = int(parts[0]), int(parts[1]), int(parts[2])
                
                # Rule: 02 or 03 is the month. If both are candidates, 
                # prioritize the one that doesn't put the other part > 31.
                # Given user's data, the second part is often the month in DD/MM
                # but switches to the first part in MM/DD.
                if p2 in [2, 3]:
                    dt = datetime(year, p2, p1)
                elif p1 in [2, 3]:
                    dt = datetime(year, p1, p2)
                else:
                    dt = datetime(year, p2, p1) # Fallback
                
                db_date = dt.strftime('%Y-%m-%d')
            except Exception as e:
                print(f"Error parsing date {date_str}: {e}")
                db_date = None
            
            nominal = float(nominal_str) if nominal_str else 0.0
            
            cursor.execute('''
            INSERT INTO laporan_bypass (unit, komoditi, tanggal, nominal, pembeli, deskripsi)
            VALUES (?, ?, ?, ?, ?, ?)
            ''', (unit, komoditi, db_date, nominal, pembeli, desc))
            
    conn.commit()
    conn.close()
    print(f"Successfully seeded {len(lines)} Sawit records.")

if __name__ == "__main__":
    seed()
