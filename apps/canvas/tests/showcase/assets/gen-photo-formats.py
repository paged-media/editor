#!/usr/bin/env python3
"""Regenerate photos/derived/: the format-gallery variants of one photograph.

The picture chapter places THE SAME image in every raster format the
engine decodes (PNG, WebP, TIFF, GIF, BMP, plus a CMYK JPEG with the
ICC profile embedded), so a reader compares formats, not subjects.
Source: the Pexels apples photo (see photos/README.md for the grant).
Derivatives are 800 px wide — gallery cells, not plates. Deterministic
for fixed PIL: rerun and diff to prove it.

Run:  python3 gen-photo-formats.py
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
OUT = HERE / "photos" / "derived"
OUT.mkdir(parents=True, exist_ok=True)
ICC = (HERE / "../../../../../../core/corpus/profiles/default_cmyk.icc").resolve()

src = Image.open(HERE / "photos" / "pexels-574919-apples.jpg")
w = 800
img = src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)

img.save(OUT / "apples.png", format="PNG", optimize=True)
img.save(OUT / "apples.webp", format="WEBP", quality=88, method=6)
img.save(OUT / "apples.tif", format="TIFF", compression="tiff_lzw")
img.convert("P", palette=Image.ADAPTIVE, colors=256).save(OUT / "apples.gif", format="GIF")
img.save(OUT / "apples.bmp", format="BMP")
img.convert("CMYK").save(OUT / "apples-cmyk.jpg", format="JPEG", quality=90,
                         icc_profile=ICC.read_bytes())
for p in sorted(OUT.iterdir()):
    print(f"{p.name:20s} {p.stat().st_size:9,d} bytes")
