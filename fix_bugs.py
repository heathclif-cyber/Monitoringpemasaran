import re

# Fix main.py
with open("main.py", "r", encoding="utf-8") as f:
    main_py = f.read()

# We want to move get_kontrak below export and preview
block_get_kontrak = '''@app.get("/api/kontrak/{no_kontrak}", response_model=schemas.KontrakOut)
def get_kontrak(no_kontrak: str, db: Session = Depends(get_db)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
         raise HTTPException(status_code=404, detail="Kontrak not found")
    return db_kontrak'''

# Remove the block
main_py = main_py.replace(block_get_kontrak, "")

# Insert it before invoice API
insert_marker = '# --- INVOICE API ---'
# But there is no INVOICE API marker, it's just @app.post("/api/invoice"
main_py = main_py.replace('@app.post("/api/invoice"', block_get_kontrak + '\n\n@app.post("/api/invoice"')

# Same issue might exist for invoice and do!
# Let's fix them too:
block_get_invoice = '''@app.get("/api/invoice/{no_invoice}", response_model=schemas.InvoiceOut)
def get_invoice(no_invoice: str, db: Session = Depends(get_db)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
         raise HTTPException(status_code=404, detail="Invoice not found")
    return db_invoice'''

main_py = main_py.replace(block_get_invoice, "")
main_py = main_py.replace('# --- DELIVERY ORDER API ---', block_get_invoice + '\n\n# --- DELIVERY ORDER API ---')


with open("main.py", "w", encoding="utf-8") as f:
    f.write(main_py)

# Fix app.js
with open("static/js/app.js", "r", encoding="utf-8") as f:
    app_js = f.read()

app_js = app_js.replace(
    "showToast(\"Kontrak berhasil disimpan!\");\n        lastSavedKontrakId = payload.no_kontrak;",
    "showToast(\"Kontrak berhasil disimpan!\");\n        lastSavedKontrakId = payload.no_kontrak;\n        populateDropdowns();"
)

app_js = app_js.replace(
    "showToast(\"Invoice berhasil diterbitkan!\");\n        document.getElementById('formCreateInvoice').reset();",
    "showToast(\"Invoice berhasil diterbitkan!\");\n        document.getElementById('formCreateInvoice').reset();\n        populateDropdowns();"
)

# Fix JS: no_kontrak might have spaces or slashes, encodeURIComponent is already used in preview
# wait, the issue was api route matching /api/kontrak/{no_kontrak}.

with open("static/js/app.js", "w", encoding="utf-8") as f:
    f.write(app_js)
