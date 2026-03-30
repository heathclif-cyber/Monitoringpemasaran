import os
import io
import calendar
from PIL import Image, ImageDraw, ImageFont
from services.utils import terbilang_rupiah

# Function to format numbers for currency and display
def format_currency(value):
    return f"Rp{value:,.0f}".replace(",", ".")

def generate_contract_image(contract):
    # Image dimensions
    width, height = 1200, 1600
    background_color = (255, 255, 255)
    text_color = (0, 0, 0)
    
    # Fonts
    try:
        font_regular = ImageFont.truetype("arial.ttf", 16)
        font_bold = ImageFont.truetype("arialbd.ttf", 18)
        font_title = ImageFont.truetype("arialbd.ttf", 22)
        font_signature = ImageFont.truetype("arialbd.ttf", 16)
    except IOError:
        font_regular = ImageFont.load_default()
        font_bold = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_signature = ImageFont.load_default()

    img = Image.new('RGB', (width, height), color=background_color)
    draw = ImageDraw.Draw(img)
    
    # Mappings
    vol = contract.volume or 0
    harga = contract.harga_satuan or 0
    sat_vol = contract.satuan or ""
    premi = contract.premi or 0
    
    vol_str = f"{vol:,.0f}".replace(",", ".")
    harga_str = f"{format_currency(harga)} per {sat_vol}"
    premi_str = f"{format_currency(premi)}" if premi else "-"
    ppn_str = f"Tarif Efektif {contract.ppn_persen}%"
    
    nt = (vol * harga) + premi
    nt_str = f"{format_currency(nt)}"
    terbilang_str = f"{format_currency(nt)} ({contract.terbilang})"
    
    def draw_attribute_line(draw, y, label, value, x_label=150, x_colon=400, x_value=430, font=font_regular, colon_font=font_regular):
        val_str = str(value) if value else "-"
        draw.text((x_label, y), label, fill=text_color, font=font)
        draw.text((x_colon, y), ":", fill=text_color, font=colon_font)
        
        lines = val_str.split('\n')
        current_y = y
        for line in lines:
            draw.text((x_value, current_y), line, fill=text_color, font=font)
            current_y += 20
        return current_y

    def draw_dual_attribute_line(draw, y, label1, value1, label2, value2, x_label1=150, x_colon1=400, x_value1=430, x_label2=800, x_colon2=1050, x_value2=1080, font=font_regular):
        str1 = str(value1) if value1 else "-"
        str2 = str(value2) if value2 else "-"
        draw.text((x_label1, y), label1, fill=text_color, font=font)
        draw.text((x_colon1, y), ":", fill=text_color, font=font)
        draw.text((x_value1, y), str1, fill=text_color, font=font)
        draw.text((x_label2, y), label2, fill=text_color, font=font)
        draw.text((x_colon2, y), ":", fill=text_color, font=font)
        draw.text((x_value2, y), str2, fill=text_color, font=font)

    # Title section
    draw.text((width/2, 50), "KONTRAK PENJUALAN", fill=text_color, font=font_title, anchor="mt")
    draw.text((width/2, 90), f"Nomor : {contract.no_kontrak}", fill=text_color, font=font_bold, anchor="mt")
    draw.text((width/2, 120), f"Bid Offer Nomor : {contract.bid_offer_nomor or '-'}", fill=text_color, font=font_bold, anchor="mt")

    y_start = 170
    draw_attribute_line(draw, y_start, "Pemilik Komoditas", contract.pemilik_komoditas, font=font_bold, colon_font=font_bold)
    y_start += 30
    cy = draw_attribute_line(draw, y_start, "Penjual", contract.penjual, font=font_bold, colon_font=font_bold)
    y_start = max(y_start + 30, cy + 10)
    
    cy = draw_attribute_line(draw, y_start, "Pembeli", contract.pembeli, font=font_bold, colon_font=font_bold)
    y_start = max(y_start + 30, cy + 10)
    
    draw_attribute_line(draw, y_start, "No. Referensi", contract.no_referensi or contract.no_reff, font=font_bold, colon_font=font_bold)
    y_start += 30

    draw_dual_attribute_line(draw, y_start, "Komoditi", contract.komoditi, "Jenis Komoditi", contract.jenis_komoditi, font=font_bold)
    y_start += 30
    draw_dual_attribute_line(draw, y_start, "Packaging", contract.packaging, "Symbol", contract.simbol, font=font_bold)
    y_start += 30

    draw_attribute_line(draw, y_start, "Deskripsi Produk", contract.deskripsi_produk, font=font_bold, colon_font=font_bold)
    y_start += 30
    draw_attribute_line(draw, y_start, "Mutu", contract.mutu, font=font_bold, colon_font=font_bold)
    y_start += 30
    draw_attribute_line(draw, y_start, "Produsen", contract.kebun_produsen, font=font_bold, colon_font=font_bold)
    y_start += 30
    draw_attribute_line(draw, y_start, "Pelabuhan Muat", contract.pelabuhan_muat, font=font_bold, colon_font=font_bold)
    y_start += 30
    draw_attribute_line(draw, y_start, "Volume", f"{vol_str} {sat_vol}", font=font_bold, colon_font=font_bold)
    y_start += 30

    draw_dual_attribute_line(draw, y_start, "Harga Satuan", harga_str, "Premi", premi_str, font=font_bold)
    y_start += 30

    draw_attribute_line(draw, y_start, "PPN", ppn_str, font=font_bold, colon_font=font_bold)
    y_start += 30
    draw_attribute_line(draw, y_start, "Kondisi Penyerahan", contract.kondisi_penyerahan, font=font_bold, colon_font=font_bold)
    y_start += 30

    # Pembayaran
    draw.text((150, y_start), "Pembayaran", fill=text_color, font=font_bold)
    draw.text((400, y_start), ":", fill=text_color, font=font_bold)
    
    pemb_y = y_start
    draw_dual_attribute_line(draw, pemb_y, "Metode", contract.pembayaran_metode, "Cara", contract.pembayaran_cara, x_label1=430, x_colon1=520, x_value1=550, x_label2=800, x_colon2=1050, x_value2=1080)
    pemb_y += 30
    draw_dual_attribute_line(draw, pemb_y, "Nama Bank", contract.pembayaran_bank, "Jatuh Tempo Pembayaran", f"Maksimal {contract.lama_pembayaran_hari} Hari Kalender", x_label1=430, x_colon1=520, x_value1=550, x_label2=800, x_colon2=1050, x_value2=1080)
    pemb_y += 30
    draw.text((430, pemb_y), "Atas Nama", fill=text_color, font=font_regular)
    draw.text((520, pemb_y), ":", fill=text_color, font=font_regular)
    draw.text((550, pemb_y), contract.pembayaran_atas_nama or "-", fill=text_color, font=font_regular)
    pemb_y += 30
    draw.text((430, pemb_y), "Rek No.", fill=text_color, font=font_regular)
    draw.text((520, pemb_y), ":", fill=text_color, font=font_regular)
    draw.text((550, pemb_y), contract.pembayaran_rek_no or "-", fill=text_color, font=font_regular)

    y_start = pemb_y + 40
    draw_attribute_line(draw, y_start, "Waktu Penyerahan", contract.waktu_penyerahan, font=font_bold, colon_font=font_bold)
    y_start += 30

    # Syarat
    draw.text((150, y_start), "Syarat - Syarat Lain", fill=text_color, font=font_bold)
    draw.text((400, y_start), ":", fill=text_color, font=font_bold)
    y_start += 30
    
    syarat_list = str(contract.syarat_syarat or "").split('\n')
    for syarat_item in syarat_list:
        if not syarat_item.strip(): continue
        
        words = syarat_item.split()
        current_line = []
        wrapped_lines = []
        for word in words:
            current_line.append(word)
            current_line_text = " ".join(current_line)
            # Use basic character count approximation for default font
            if len(current_line_text) * 8 > (width - 430 - 50): 
                wrapped_lines.append(" ".join(current_line[:-1]))
                current_line = [word]
        wrapped_lines.append(" ".join(current_line))
        
        for line in wrapped_lines:
            draw.text((430, y_start), line, fill=text_color, font=font_regular)
            y_start = y_start + 20
            
    y_start = y_start + 20
    cy = draw_attribute_line(draw, y_start, "Dasar Ketentuan", contract.dasar_ketentuan, font=font_bold, colon_font=font_bold)
    y_start = max(y_start + 30, cy + 10)
    
    draw_attribute_line(draw, y_start, "Jumlah (Pokok)", terbilang_str, font=font_bold, colon_font=font_bold)

    tgl = getattr(contract, "tanggal_kontrak", None)
    tgl_str = str(tgl) if tgl else ""
    if tgl and hasattr(tgl, "month"):
        months = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
        try:
            m_id = months[tgl.month]
            tgl_str = f"{tgl.day} {m_id} {tgl.year}"
        except Exception:
            pass

    loc = contract.lokasi or "Makassar"
    draw.text((width - 150, height - 120), f"{loc}, {tgl_str}", fill=text_color, font=font_regular, anchor="rb")
    draw.text((150, height - 80), "Persetujuan Pembeli", fill=text_color, font=font_signature)

    img_io = io.BytesIO()
    img.save(img_io, 'PNG')
    img_io.seek(0)
    return img_io
