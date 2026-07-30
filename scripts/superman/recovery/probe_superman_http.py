import time
import httpx

url = "https://superman.ptpn1.co.id/"
t0 = time.time()
try:
    with httpx.Client(timeout=40.0, follow_redirects=True) as client:
        r = client.get(url)
    body = r.text or ""
    print(
        "status",
        r.status_code,
        "t",
        round(time.time() - t0, 1),
        "len",
        len(body),
        "login",
        "signin-username" in body,
        "captcha",
        "captcha" in body.lower(),
    )
except Exception as exc:
    print("ERR", type(exc).__name__, exc, "t", round(time.time() - t0, 1))
