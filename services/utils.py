def angka_terbilang(angka):
    satuan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"]
    n = int(angka)
    
    if n == 0:
        return ""
    elif n <= 11:
        hasil = satuan[n]
    elif n < 20:
        hasil = angka_terbilang(n % 10) + " Belas"
    elif n < 100:
        hasil = angka_terbilang(n // 10) + " Puluh " + angka_terbilang(n % 10)
    elif n < 200:
        hasil = "Seratus " + angka_terbilang(n - 100)
    elif n < 1000:
        hasil = angka_terbilang(n // 100) + " Ratus " + angka_terbilang(n % 100)
    elif n < 2000:
        hasil = "Seribu " + angka_terbilang(n - 1000)
    elif n < 1000000:
        hasil = angka_terbilang(n // 1000) + " Ribu " + angka_terbilang(n % 1000)
    elif n < 1000000000:
        hasil = angka_terbilang(n // 1000000) + " Juta " + angka_terbilang(n % 1000000)
    elif n < 1000000000000:
        hasil = angka_terbilang(n // 1000000000) + " Milyar " + angka_terbilang(n % 1000000000)
    elif n < 1000000000000000:
        hasil = angka_terbilang(n // 1000000000000) + " Trilyun " + angka_terbilang(n % 1000000000000)
    else:
        hasil = str(n)
        
    # hapus spasi berlebih
    return ' '.join(hasil.split())

def terbilang_rupiah(angka):
    if angka == 0:
        return "Nol Rupiah"
    teks = angka_terbilang(angka).strip()
    return teks + " Rupiah"
