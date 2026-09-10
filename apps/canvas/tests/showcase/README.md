# The paged showcase

One sixteen-page reference document that exercises the engine and every
wired plugin, built by driving the real editor.

```bash
cd ~/paged/editor/apps/canvas
npx playwright test --project=showcase
```

Output lands in `apps/canvas/showcase/`:

| file                     | what it is                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showcase.paged`         | the live document — plugin frames keep their `x-paged:<id>` metadata envelopes and their `paged/<plugin>/…` container parts, so reopening in the editor rehydrates them |
| `showcase.idml`          | the baked twin: every native page item, none of the `paged/` namespace. What a reader without the plugins sees                                                          |
| `showcase.pdf`           | the same document through the engine's PDF writer                                                                                                                       |
| `showcase.coverage.json` | which registry rows each page demonstrates, checked against `state/registry/features`                                                                                   |
| `pages/page-NN.png`      | one render per page                                                                                                                                                     |

## Why it exists

The engine's thirty-five `paged-gen` fixtures each isolate **one**
concern on purpose — that is what makes a fidelity failure localisable,
and the archived generator brief argues the point at length. Every
plugin journey proves **its own** frame reaches the page. Nothing put
them in the same document.

That gap is where the two worst plugin defects on record lived: _"web
render BLANK in the editor"_ and the sheet table's core↔bundle wire
gap. Both were invisible to unit tests. Both were found only when
somebody rendered a plugin frame for real and looked at it.

This is the missing tier — the archived brief calls it Tier 3,
"realistic documents", and lists it as never built. It is deliberately
**not** a fidelity fixture and must never be added to
`corpus/generated/fidelity-thresholds.json`.

## How it is put together

`showcase-base.idml` comes from core's `paged-gen` and carries only what
the mutation wire cannot author: master spreads, condition definitions,
footnote options, a TOC style, and the named paragraph/character styles
and swatches every page addresses. The spec regenerates it automatically
if the core checkout has not produced it yet.

Everything else is authored live through the same wire a user's clicks
travel down. Each spread is a module in `pages/`, exporting one
`build(ctx)` that returns what it created and which registry rows it
demonstrated.

Three things are asserted per spread, and the third is the one that
matters:

1. the module ran without throwing;
2. the elements it reports exist;
3. **the page's pixels changed.** A module that authors nothing fails
   here even when it threw nothing — which is precisely the assertion
   that would have caught the blank web frame.

## Adding a spread

Write `pages/NN-name.ts` exporting `build(ctx)`, then add a line to
`plan.ts`. Two rules the existing modules follow:

- **Address everything by name.** `doc.paragraphStyle("Showcase Body")`,
  never `styles[3]`. The lookups throw on a missing name, so a drifted
  base fixture fails on the page that first asks. A spec that took _the
  last paragraph style_ once went green for two months while proving
  nothing, because a regenerated fixture had appended one more.
- **Report what did not work.** A step that cannot run returns a `notes`
  entry with the reason, and the colophon prints it. A showcase whose
  failures are invisible is a brochure; one that says "the Blitz engine
  did not load on this lane" is evidence.

## The two InDesign gates

The suite ends with two lanes that ask Adobe rather than our own loader.
Both need macOS with InDesign 2025 installed, both SKIP when it is
absent, and `REQUIRE_REAL_INDESIGN=1` turns that skip into a failure.

- **`indesign-probe.spec.ts`** — what InDesign READS. It opens the
  exported `showcase.idml` and compares InDesign's counts (page items,
  stories, sections, guides, hyperlinks, conditions, tables, links,
  faces, overset) against what the package declares. Our round-trip
  cannot find this class of bug: the reader accepts whatever the writer
  emits, so a private spelling passes here and vanishes there.
- **`indesign-render.spec.ts`** — what InDesign DRAWS. It asks InDesign
  to export one JPEG per page at the resolution the assembly's own page
  PNGs use (1224 px on a 540 pt trim = 163.2 dpi), then compares pixel
  for pixel. The ceiling per page lives in
  `indesign-render-thresholds.json`; a page over its ceiling is a
  renderer regression to fix, never a ceiling to raise.

  Why InDesign's own raster and not its exported PDF: poppler renders
  InDesign's knockout transparency groups wrongly — the effects
  chapter's bevelled moon and feathered veil come out white — so a
  compare against that raster scores the renderer against an artefact.

  ```bash
  pnpm showcase:indesign-render                       # gate
  SHOWCASE_RENDER_PAGES=59,60 pnpm showcase:indesign-render   # two pages
  pnpm showcase:indesign-render:capture               # re-bake the ceilings
  ```

  Knobs: `SHOWCASE_RENDER_MODE` (`gate`|`capture`|`advisory`),
  `SHOWCASE_RENDER_PAGES`, `SHOWCASE_RENDER_MANIFEST_ONLY`,
  `SHOWCASE_RENDER_DPI`, `SHOWCASE_RENDER_TOLERANCE`,
  `SHOWCASE_RENDER_FORCE`, `SHOWCASE_CMYK_PROFILE`,
  `INDESIGN_RENDER_IDML`. Outputs land in
  `showcase/indesign/render/`: `page-NNN.{jpg,png}` (InDesign),
  `heat-NNN.png`, `worst/page-NNN-canvas-vs-indesign.png`,
  `compare.json`, `report.json`.

  Prerequisite: `paged-diff` must be built —
  `cargo build --release -p paged-fidelity --bin paged-diff` from the
  core checkout (this repo has no Cargo workspace of its own).

## What is not in it, and why

- **paged.slide** — a reserved repository with no commits.
- **paged.pdf** — its import _replaces_ the open document by design, so
  it cannot contribute a page to a document being built. It and
  paged.publish are exercised as exit paths instead.
- **Adjusted raster pixels and the live spreadsheet grid** do not
  persist. Those are `SceneLayer` render state, cleared on dispose. The
  file carries the native lowering, the metadata envelope and the
  container parts, and rehydrates on open — the pages say so.

## Licensing

Every asset is OFL, Apache-2.0, MIT or first-party, recorded in
`assets/README.md` and reprinted in the document's own colophon.
Nothing comes from the licensed vendor corpus, which grants use but not
redistribution — so this document can be shown to anyone.
