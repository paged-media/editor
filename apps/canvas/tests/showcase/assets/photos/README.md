# `assets/photos/` — the annual's photography, and its grants

Real photography for the picture, darkroom, and plate pages — the
document should read like a publication, not a codec test. Everything
here is from [Pexels](https://www.pexels.com) under the
[Pexels license](https://www.pexels.com/license/): free to use and
modify, no attribution required (given anyway — it is the professional
habit), unaltered copies may not be SOLD, which committed test assets
are not. No identifiable people — deliberate: retouch demos run on
puppies and apples, not faces.

| file | subject | photographer | source |
|---|---|---|---|
| `pexels-1103970-curves.jpg` | abstract architectural curves | Johannes Plenio | https://www.pexels.com/photo/1103970/ |
| `pexels-414612-dock.jpg` | moonlit lake dock | James Wheeler | https://www.pexels.com/photo/414612/ |
| `pexels-674010-feather.jpg` | peacock feather macro (portrait) | Anjana C | https://www.pexels.com/photo/674010/ |
| `pexels-1108099-puppies.jpg` | two retriever puppies | Chevanon Photography | https://www.pexels.com/photo/1108099/ |
| `pexels-346529-mirror-lake.jpg` | mirror lake between mountains | Bri Schneiter | https://www.pexels.com/photo/346529/ |
| `pexels-1323550-ridgelines.jpg` | pastel mountain ridgelines | Simon Berger | https://www.pexels.com/photo/1323550/ |
| `pexels-574919-apples.jpg` | red apples on the tree | Tom Swinnen | https://www.pexels.com/photo/574919/ |
| `pexels-618833-dolomites.jpg` | alpine sunburst at sunrise | Sagui Andrea | https://www.pexels.com/photo/618833/ |
| `pexels-302769-skyline.jpg` | Melbourne skyline at dusk | Pixabay | https://www.pexels.com/photo/302769/ |

Plate-grade shots are 2200–2400 px wide (full-bleed at the annual's
540×720 pt trim ≈ 300 ppi), the rest 1600 px.

## `derived/`

`gen-photo-formats.py` (one directory up) renders the SAME apples
photograph into every raster format the engine decodes — PNG, WebP,
TIFF (LZW), GIF (adaptive 256), BMP, and a CMYK JPEG with core's
`default_cmyk.icc` embedded — so the format-gallery spread compares
formats, not subjects. Byte-stable; rerun to regenerate.
