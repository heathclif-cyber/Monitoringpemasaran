from __future__ import annotations

import os
import re
from io import BytesIO
from pathlib import Path

import ddddocr
from dotenv import load_dotenv
from PIL import Image, ImageEnhance, ImageOps
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")
BASE = os.getenv("SUPERMAN_URL", "https://superman.ptpn1.co.id/").rstrip("/") + "/"

ocr = ddddocr.DdddOcr(show_ad=False)


def eval_math(text: str) -> str | None:
    text = re.sub(r"\s+", "", text).replace("=", "").replace("?", "")
    text = text.replace("×", "x").replace("*", "x").replace("X", "x")
    m = re.search(r"(\d+)([+\-x])(\d+)", text)
    if not m:
        return None
    a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
    if op == "+":
        return str(a + b)
    if op == "-":
        return str(a - b)
    return str(a * b)


def preprocess(img_bytes: bytes) -> list[bytes]:
    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    variants: list[bytes] = [img_bytes]
    gray = ImageOps.grayscale(img)
    for threshold in (120, 140, 160):
        bw = gray.point(lambda p, t=threshold: 255 if p > t else 0)
        buf = BytesIO()
        bw.save(buf, format="PNG")
        variants.append(buf.getvalue())
    sharp = ImageEnhance.Sharpness(gray).enhance(2.5)
    buf = BytesIO()
    sharp.save(buf, format="PNG")
    variants.append(buf.getvalue())
    return variants


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(BASE, wait_until="networkidle")
    for i in range(8):
        src = page.locator('img[src*="captcha"]').first.get_attribute("src") or ""
        if src.startswith("/"):
            src = BASE.rstrip("/") + src
        body = page.request.get(src).body()
        print(f"\n--- sample {i + 1} ---")
        for j, variant in enumerate(preprocess(body)):
            raw = ocr.classification(variant)
            ans = eval_math(raw)
            print(f"  variant {j}: raw={raw!r} -> {ans}")
        page.click("#reload")
        page.wait_for_timeout(700)
    browser.close()
