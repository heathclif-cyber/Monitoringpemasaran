import re

with open("templates/index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Add datalists safely after the inputs if they don't exist
if 'id="invoice-list"' not in html:
    html = re.sub(
        r'(<input type="text" id="i_no_invoice".*?>)',
        r'\1\n<datalist id="invoice-list"></datalist>',
        html
    )

if 'id="do-list"' not in html:
    html = re.sub(
        r'(<input type="text" id="d_no_do".*?>)',
        r'\1\n<datalist id="do-list"></datalist>',
        html
    )

with open("templates/index.html", "w", encoding="utf-8") as f:
    f.write(html)
