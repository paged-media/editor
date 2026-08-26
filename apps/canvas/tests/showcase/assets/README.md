# `tests/showcase/assets/` — what the showcase places, and under what licence

The showcase builds a real document, so it places real files. They live
here rather than in `~/paged/corpus` for one reason: the corpus is a
**private** repo, and a generator that only runs where someone has it
checked out is a generator that does not run. Everything in this folder
is redistributable, small, and carries its grant below.

| file | what | origin | licence |
|---|---|---|---|
| `showcase-cat.jpg` | 320×240 progressive JPEG photograph, 21 KB | `tests/images/jpg/progressive/cat.jpg` from [`image-rs/image`](https://github.com/image-rs/image), upstream commit `44ce9226c541dd2b11897b9ef07156a28871cdb7`; mirrored locally at `~/paged/corpus/raster/image-rs/` | **MIT OR Apache-2.0** — image-rs's own dual licence. See that tree's `PROVENANCE.md`: this file is in the 165-asset "everything else" tier, the one with a grant in the box, not in the vendored `png/apng/wpt/` (BSD-3-Clause) or `tga/testsuite/` (rights never established) subtrees. |
| `showcase-cat-cmyk.jpg` | CMYK JPEG, 320×240, with core's `default_cmyk.icc` embedded (235 KB) | derived from `showcase-cat.jpg` by `gen-cmyk-jpeg.py` (byte-stable; rerun to regenerate) | **MIT OR Apache-2.0** — same grant as its source; the ICC profile is core's own distributable default. |
| `showcase-mark.svg` | "Signal" — the vector mark page 6 imports | authored here for this repository | **AGPL-3.0-only OR PMEL**, the same dual licence as the rest of the editor. |

## Why a progressive JPEG in particular

Page 5 is the paged.image page, and its job is to prove the raster lane
end to end on a file the engine has to genuinely decode. A progressive
JPEG is the least convenient shape of that lane — a synthesized PNG
would prove the plumbing while dodging the codec — and it is the sample
`image-codecs::JpegSource` is itself tested against upstream.

## Coordinates in `showcase-mark.svg`

The paged.draw SVG importer takes SVG user units as PAGE POINTS and
lowers each shape through `insertPath` unscaled, so the file is authored
directly in US Letter page space (612×792, origin top-left) inside the
base fixture's 72 pt margins. It is not artwork that gets fitted; it is
drawn where it lands. The shape ORDER is part of the contract with
`pages/06-vector.ts` — see the comment at the top of the SVG.

## Why a CMYK JPEG with an embedded profile

The picture chapter's format gallery must exercise the engine's CMYK-JPEG
decode lane (DCT-scaled, embedded-ICC) — the one raster shape none of the
license-clear corpus images has. `gen-cmyk-jpeg.py` derives it from the
already-cleared cat photo, so the grant chain stays one line long.
