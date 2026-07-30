import re
import httpx

url = "https://superman.ptpn1.co.id/"
with httpx.Client(timeout=40.0, follow_redirects=True) as c:
    r = c.get(url)
    html = r.text
    print("status", r.status_code, "cookies", list(c.cookies.keys()))
    for line in html.splitlines():
        low = line.lower()
        if "captcha" in low or "reload" in low or "csrf" in low or "_token" in low:
            print("L:", line.strip()[:220])
    m = re.search(r'src=["\']([^"\']*captcha[^"\']*)["\']', html, re.I)
    print("src_captcha", m.group(1) if m else None)
    m2 = re.search(r'class=["\']captcha["\'][\s\S]{0,400}', html, re.I)
    print("block", (m2.group(0)[:400] if m2 else None))
