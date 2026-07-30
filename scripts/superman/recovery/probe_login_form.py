import re
import httpx

url = "https://superman.ptpn1.co.id/"
with httpx.Client(timeout=40.0, follow_redirects=True) as c:
    r = c.get(url)
    html = r.text
    # form inputs
    for m in re.finditer(r"<input[^>]+>", html, re.I):
        tag = m.group(0)
        if any(k in tag.lower() for k in ("name=", "type=", "id=")):
            print(tag[:250])
    print("---form---")
    fm = re.search(r"<form[^>]*class=\"[^\"]*form-auth[^\"]*\"[^>]*>[\s\S]{0,2500}", html, re.I)
    if fm:
        print(fm.group(0)[:2000])
