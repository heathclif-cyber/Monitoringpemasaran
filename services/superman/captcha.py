from __future__ import annotations

import re
from io import BytesIO

import ddddocr
from PIL import Image, ImageEnhance, ImageOps

_OCR = ddddocr.DdddOcr(show_ad=False)


def _eval_math(text: str) -> str | None:
    text = re.sub(r"\s+", "", text).replace("=", "").replace("?", "")
    text = text.replace("×", "x").replace("*", "x").replace("X", "x")
    match = re.search(r"(\d+)([+\-x])(\d+)", text)
    if not match:
        return None
    left, op, right = int(match.group(1)), match.group(2), int(match.group(3))
    if op == "+":
        return str(left + right)
    if op == "-":
        return str(left - right)
    return str(left * right)


def _variants(img_bytes: bytes) -> list[bytes]:
    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    variants = [img_bytes]
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


def solve_math_captcha(img_bytes: bytes) -> tuple[str | None, str | None]:
    for variant in _variants(img_bytes):
        raw = _OCR.classification(variant)
        answer = _eval_math(raw)
        if answer:
            return answer, raw
    return None, None