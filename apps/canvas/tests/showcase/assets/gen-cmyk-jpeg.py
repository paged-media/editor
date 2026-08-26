#!/usr/bin/env python3
"""Regenerate showcase-cat-cmyk.jpg: the CMYK-JPEG-with-embedded-ICC asset.

The picture chapter needs a real CMYK JPEG carrying an ICC profile (the
engine's DCT-scaled CMYK decode + embedded-profile lane). None of the
license-clear corpus rasters is CMYK, so this derives one from the
already-clean showcase-cat.jpg using core's distributable default CMYK
profile. Deterministic: PIL's encoder is stable for fixed inputs.

Run:  python3 gen-cmyk-jpeg.py
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
ICC = HERE / "../../../../../../core/corpus/profiles/default_cmyk.icc"

src = Image.open(HERE / "showcase-cat.jpg").convert("CMYK")
src.save(
    HERE / "showcase-cat-cmyk.jpg",
    format="JPEG",
    quality=90,
    icc_profile=ICC.read_bytes(),
)
print("wrote", HERE / "showcase-cat-cmyk.jpg")
