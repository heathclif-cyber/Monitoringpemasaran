import requests

# Test year 2026
r = requests.get('http://localhost:8000/api/dashboard?year=2026')
d = r.json()
print('=== YEAR 2026 ===')
print('Total Kontrak:', d['summary']['total_kontrak'])
print('Total Nilai:', 'Rp{:,.0f}'.format(d['summary']['total_nilai_transaksi']))
print('Cash In:', 'Rp{:,.0f}'.format(d['summary']['total_cash_in']))
print('Available years:', d['available_years'])
print('Bulanan (Jan-Mar):')
for i in range(3):
    lbl = d['charts']['bulanan']['labels'][i]
    p = d['charts']['bulanan']['pendapatan'][i]
    c = d['charts']['bulanan']['cashin'][i]
    print('  {}: Pendapatan=Rp{:,.0f} | CashIn=Rp{:,.0f}'.format(lbl, p, c))

# Test year 2025
r2 = requests.get('http://localhost:8000/api/dashboard?year=2025')
d2 = r2.json()
print('')
print('=== YEAR 2025 ===')
print('Total Nilai:', 'Rp{:,.0f}'.format(d2['summary']['total_nilai_transaksi']))
des = d2['charts']['bulanan']['pendapatan'][11]
print('Desember 2025 Pendapatan: Rp{:,.0f}'.format(des))
jan2025 = d2['charts']['bulanan']['pendapatan'][0]
print('Januari 2025 Pendapatan: Rp{:,.0f}'.format(jan2025))
