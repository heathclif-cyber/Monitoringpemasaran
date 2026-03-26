import sys

with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

# Update create_kontrak
old_kontrak = '''    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == kontrak.no_kontrak).first()
    if db_kontrak:
        raise HTTPException(status_code=400, detail="Nomor Kontrak already exists")
    
    # Calculate fields
    nilai_transaksi = ((kontrak.volume or 0.0) * (kontrak.harga_satuan or 0.0)) + (kontrak.premi or 0.0)
    nominal_ppn = nilai_transaksi * ((kontrak.ppn_persen or 0.0) / 100)
    jatuh_tempo_pembayaran = kontrak.tanggal_kontrak + timedelta(days=kontrak.lama_pembayaran_hari or 0)
    terbilang = terbilang_rupiah(math.floor(nilai_transaksi))
    
    new_kontrak = models.Kontrak(
        **kontrak.model_dump(),
        nilai_transaksi=nilai_transaksi,
        nominal_ppn=nominal_ppn,
        jatuh_tempo_pembayaran=jatuh_tempo_pembayaran,
        terbilang=terbilang
    )
    db.add(new_kontrak)
    db.commit()
    db.refresh(new_kontrak)
    return new_kontrak'''

new_kontrak = '''    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == kontrak.no_kontrak).first()
    
    # Calculate fields
    nilai_transaksi = ((kontrak.volume or 0.0) * (kontrak.harga_satuan or 0.0)) + (kontrak.premi or 0.0)
    nominal_ppn = nilai_transaksi * ((kontrak.ppn_persen or 0.0) / 100)
    jatuh_tempo_pembayaran = kontrak.tanggal_kontrak + timedelta(days=kontrak.lama_pembayaran_hari or 0)
    terbilang = terbilang_rupiah(math.floor(nilai_transaksi))
    
    if db_kontrak:
        # Update existing
        for key, value in kontrak.model_dump().items():
            setattr(db_kontrak, key, value)
        db_kontrak.nilai_transaksi = nilai_transaksi
        db_kontrak.nominal_ppn = nominal_ppn
        db_kontrak.jatuh_tempo_pembayaran = jatuh_tempo_pembayaran
        db_kontrak.terbilang = terbilang
        db.commit()
        db.refresh(db_kontrak)
        return db_kontrak
    else:
        new_kontrak = models.Kontrak(
            **kontrak.model_dump(),
            nilai_transaksi=nilai_transaksi,
            nominal_ppn=nominal_ppn,
            jatuh_tempo_pembayaran=jatuh_tempo_pembayaran,
            terbilang=terbilang
        )
        db.add(new_kontrak)
        db.commit()
        db.refresh(new_kontrak)
        return new_kontrak'''

if old_kontrak in text:
    text = text.replace(old_kontrak, new_kontrak)

# Update create_invoice
old_invoice = '''    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == invoice.no_invoice).first()
    if db_invoice:
        raise HTTPException(status_code=400, detail="Nomor Invoice already exists")
    
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == invoice.no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
        
    # Calculate fields
    jumlah_pembayaran = db_kontrak.nilai_transaksi + db_kontrak.nominal_ppn + (db_kontrak.nilai_transaksi * ((invoice.pph_22_persen or 0.0) / 100))
    terbilang_invoice = terbilang_rupiah(math.floor(jumlah_pembayaran))
    
    new_invoice = models.Invoice(
        **invoice.model_dump(),
        jumlah_pembayaran=jumlah_pembayaran,
        terbilang_invoice=terbilang_invoice
    )
    db.add(new_invoice)
    db.commit()
    db.refresh(new_invoice)
    return new_invoice'''

new_invoice = '''    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == invoice.no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
        
    # Calculate fields
    jumlah_pembayaran = db_kontrak.nilai_transaksi + db_kontrak.nominal_ppn + (db_kontrak.nilai_transaksi * ((invoice.pph_22_persen or 0.0) / 100))
    terbilang_invoice = terbilang_rupiah(math.floor(jumlah_pembayaran))
    
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == invoice.no_invoice).first()
    if db_invoice:
        for key, value in invoice.model_dump().items():
            setattr(db_invoice, key, value)
        db_invoice.jumlah_pembayaran = jumlah_pembayaran
        db_invoice.terbilang_invoice = terbilang_invoice
        db.commit()
        db.refresh(db_invoice)
        return db_invoice
    else:
        new_invoice = models.Invoice(
            **invoice.model_dump(),
            jumlah_pembayaran=jumlah_pembayaran,
            terbilang_invoice=terbilang_invoice
        )
        db.add(new_invoice)
        db.commit()
        db.refresh(new_invoice)
        return new_invoice'''

if old_invoice in text:
    text = text.replace(old_invoice, new_invoice)

# Update create_do
old_do = '''    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == do.no_do).first()
    if db_do:
        raise HTTPException(status_code=400, detail="Nomor DO already exists")
    
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == do.no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # Calculate fields
    selisih = db_invoice.jumlah_pembayaran - (do.nominal_transfer or 0.0)
    
    new_do = models.DeliveryOrder(
        **do.model_dump(),
        selisih=selisih
    )
    db.add(new_do)
    db.commit()
    db.refresh(new_do)
    return new_do'''

new_do = '''    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == do.no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # Calculate fields
    selisih = db_invoice.jumlah_pembayaran - (do.nominal_transfer or 0.0)
    
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == do.no_do).first()
    if db_do:
        for key, value in do.model_dump().items():
            setattr(db_do, key, value)
        db_do.selisih = selisih
        db.commit()
        db.refresh(db_do)
        return db_do
    else:
        new_do = models.DeliveryOrder(
            **do.model_dump(),
            selisih=selisih
        )
        db.add(new_do)
        db.commit()
        db.refresh(new_do)
        return new_do'''

if old_do in text:
    text = text.replace(old_do, new_do)

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)
