# Editor testing — the E2E operation suite

The **core test suite** of the editor: every operation, end-to-end,
proven to land in the IDML document rendered on the canvas. Lives in
`apps/canvas/tests/e2e/`. Complements the existing per-panel behaviour
specs (`apps/canvas/tests/*.spec.ts`) and the InDesign-reference
**fidelity** gate (`apps/canvas/tests/fidelity.spec.ts`).

The central question every test answers: **was the operation
successfully applied to the IDML document on the canvas?** — not just
"did the panel update its DOM".

```bash
cd apps/canvas
pnpm wasm                       # build the engine wasm first
npx playwright test tests/e2e   # the whole E2E suite
npx playwright test tests/e2e/text-ops   # one domain suite
```

## The operation sandwich

`tests/e2e/harness/op-sandwich.ts` is the centerpiece. Every op is
wrapped in the same proof:

```
baseline snapshot + model dump
  → apply (UI-driven where a UI path exists, else client.mutate / gesture)
  → invalidation contract  (the reply lists the page dirty; a control
                            page stays byte-stable)
  → model assertions       (elementProperties / collections changed)
  → render diff            (pixels changed INSIDE the affected region,
                            ZERO collateral outside)
  → undo  → model deep-equals baseline AND pixels BYTE-IDENTICAL
  → redo  → effect returns
```

**Byte-identical undo is an engine guarantee** (the CPU renderer is
deterministic: tiny-skia, single-threaded, signature-keyed layout
cache — core's `paged-canvas` AC-E-7). A violation the suite finds is
an engine bug, not test flake.

Key `SandwichOpts`:

- `region` — page-space pt rect (from `elementPageRectPt`, NOT
  `frameBounds`: model space ≠ page space) the op should repaint.
- `containment` — assert ZERO changed pixels outside region+slack
  (collateral-damage check). Default on when a region is given.
- `controlPage` — a page that must NOT repaint (cross-page collateral).
- `noRenderChange` — for ops that legitimately don't repaint (an
  unreferenced swatch, a layer rename).
- `skipUndoPixelCheck: string` — waive ONLY the byte-identical-undo
  render assertion for a KNOWN engine bug. The reason is logged; model
  restore stays hard; a dedicated `test.fail` must own the strict
  check so it flips the day core fixes it. **Never** use it to hide an
  unexplained diff.

Support files: `pixel-diff.ts` (pngjs, region-scoped), `model-dump.ts`
(stable-JSON element / story / doc dumps), `fixtures.ts` (the fixture
table + scene-tree target resolver), `ui.ts` (panel-control drivers +
`mutate`/`script` fall-backs).

## The capability matrix

`tests/e2e/capability-matrix.spec.ts` + `harness/capabilities.ts`
probe EVERY wire `Mutation` op against a live document with minimal
valid args and classify it **empirically** — `supported` (applies,
model changes, undo restores) or `unsupported` (rejected; the note
carries the error kind). The probe asserts the live result matches the
checked-in table; **support changing in either direction fails CI**
with instructions to update the table AND the domain test.

Each probe creates its own scratch resource first (a swatch, style,
layer, spot ink, path) so the classification reflects the engine, not
whether the fixture held a deletable swatch. To re-seed after core
lands new ops:

```bash
E2E_CAPS=capture npx playwright test tests/e2e/capability-matrix
```

then copy `/tmp/paged-e2e-capabilities.json` into `harness/capabilities.ts`.

As of the seed run only `applyStyle`, `insertField`, `moveFrame`,
`linkFrames`, `unlinkFrames` are `notImplemented` stubs (moveFrame
rides the translate gesture); the other 55 wire ops are live.

## The domain suites

| File                  | Proves                                                       |
| --------------------- | ------------------------------------------------------------ |
| `text-ops`            | insertText / deleteRange change the story + repaint          |
| `frame-ops`           | insert frame/line/path, resizeFrame — create + reshape       |
| `page-ops`            | insert/delete/resize page (structural; reply vectors)        |
| `property-roundtrip`  | frame PropertyPaths via setElementProperty                   |
| `color-ops`           | editSwatch on a USED swatch repaints; resource CRUD          |
| `style-ops`           | setStyleProperty cascade; style CRUD                         |
| `layer-ops`           | layer insert / set-name / visible / locked / printable       |
| `path-pathfinder-ops` | pathfinderBoolean union; pathPointRemove                     |
| `transform-gestures`  | translate gesture render diff amid transforms                |
| `tools-ui`            | a REAL mouse drag of the Rectangle tool creates a frame      |
| `undo-stack`          | a 5-op stack → byte-identical undo/redo + replay determinism |
| `export-verification` | an edit changes the EXPORTED PDF (pdftoppm raster)           |
| `real-doc-smoke`      | the curated op pass on real docs (sample, line-sheet)        |
| `script-parity`       | `paged.*` produces the same model as the wire mutation       |
| `property-fuzz`       | seeded random property writes never error; undo byte-clean   |
| `performance`         | load / op / snapshot latency under generous budgets          |

`harness/doc-op-pass.ts` is the document-parameterized op pass shared
by real-doc-smoke and the extensive corpus mode. It classifies each
op `pass` / `skip` / `render-stale` / `error`, so a real document's
richness (text frames with no fill, already-styled elements) reads as
an insight, not a failure — only `error` (worker failure / panic) is a
hard fault.

## The extensive corpus mode (opt-in)

`tests/e2e/extensive-corpus.spec.ts` runs `docOpPass` over the whole
`corpus/envato/packs` corpus of 61 real InDesign documents — the
"deeper insights on real InDesign documents" pass. It registers ZERO
tests unless `E2E_PACKS` is set, so normal runs stay fast.

```bash
E2E_PACKS=all npx playwright test tests/e2e/extensive-corpus            # ~1.5–3 h
E2E_PACKS=brand-guidelines,catalog npx playwright test tests/e2e/extensive-corpus
E2E_MODE=gate E2E_PACKS=annual-report npx playwright test tests/e2e/extensive-corpus
```

Default mode is **advisory** — every pack × op outcome is collected
into `/tmp/paged-e2e-extensive/report.{json,md}` (a per-pack × per-op
status table) and no pack fails the run. `E2E_MODE=gate` flips per-pack
errors to hard assertions once a pack is known clean.

## Adding a test for a new op

1. Pick (or generate) a fixture that exercises it (`harness/fixtures.ts`).
2. Resolve the target via the loaded fixture (`firstRectangle`,
   `firstStory`, …).
3. Drive the op through the **real UI** if one exists (`ui.ts`
   helpers), else `mutate` / a gesture, documenting why.
4. Wrap it in `opSandwich` with the affected `region` and the model
   assertions.
5. If the op is wire-level, add/confirm its row in `harness/capabilities.ts`.
6. If it surfaces an engine bug, flag it with a `test.fail` /
   `test.fixme` that turns red the day core fixes it, and record it in
   [engine-findings.md](./engine-findings.md).

## Conventions

- Test ids: `AC-E2E-<DOMAIN>-<n>`.
- Snapshots at 420–460 px, CPU path only (deterministic); GPU stays
  the fidelity suite's job.
- `openCanvas` pipes browser console + pageerror into the test log, so
  a render panic surfaces in the report.
- Don't loosen a budget or a threshold to hide a regression — fix it,
  then tighten.
