# Authoring an annual chapter

The contract for anyone (human or agent) writing chapter modules for
The Paged Annual. Read this whole file before writing a line.

## Shape of a chapter

One spec file `chapters/NNN-name.spec.ts` calling `annualChapter({id,
title, modules})` — `id` MUST equal the filename stem; the predecessor
is computed from the filename sort, so never reference other chapters.
Modules live in `pages/<chapter-stem>/*.ts`, each exporting
`build(ctx: PageContext): Promise<PageReport>`. One module per spread
(or single page); `pages: [p(N), …]` come from `names-annual.ts`'s
`ANNUAL_PLAN` — never re-type physical numbers that belong to another
chapter.

## The conventions (annual-support.ts)

- `proseFrame(ctx, page, box, paras)` — styled paragraphs on the
  Content layer. `contentBox(pageIndex)` gives the margin box (verso
  and recto MIRROR — never hardcode a box that ignores the side).
- `plate(ctx, page, box, swatchName, layer?)` — filled rect,
  Background by default.
- `specLabel(ctx, page, lines)` — REQUIRED at least once per module:
  the outside-margin specimen citation (Spec Label style, Annotations
  layer, Spec-Notes condition). `lines[0]` = `"Specimen No. <n>"` —
  take the next free number; they are ascending through the book but
  gaps are fine.
- `marginNote(ctx, page, text)` — the ◪ honesty note. EVERY partial
  or degraded demonstration gets one, pointing at "→ Appendix A".
- `assignLayer(ctx, kind, id, LAYER.x)` — every top-level item you
  mint lands on an explicit layer.
- Copy is REAL self-describing English in the annual's voice (see the
  foreword and 03-editorial for register). Never lorem. Never emoji.

## Geometry order — read this twice

Driver geometry helpers (`textFrame`/`rectangle`/`oval`/`storyOf`) and
every annual-support helper take page-space **(x0, y0, x1, y1)** and
convert to the wire's IDML order internally. Raw `Bounds` VALUES you
pass yourself — a `frameBounds` write, a `moveFrame`/`resizeFrame`
args object — are **wire-ordered `[top, left, bottom, right]`**. The
front matter shipped transposed because this line did not exist; do
not re-convert on top of the helpers.

## Hard rules

1. **No ids across chapter boundaries.** A reload re-mints ids. Resolve
   styles/swatches/layers/conditions BY NAME through the driver lookups
   (they throw with the fixture named). Rediscover geometry via
   `storyOf`/hitTest/`newRefs`.
2. **Never assert folio TEXT** — solo mode has no sections.
3. **Persist before checkpoint**: SceneLayer state (web renders, sheet
   grid, image sessions) dies at the chapter boundary. Bake, lower, or
   `replaceImageBytes` FIRST; a margin note records what stayed live.
4. **`setActivePage` discipline**: before ANY plugin insert, the
   showcase helper `withActivePage` (plugin-support.ts) — every bundle
   targets `meta.activePage ?? pages[0]`. Then `partitionByPage` to ASK
   where output landed.
5. **Destructive ops use the transient pattern**: create scratch →
   apply → delete scratch, wrapped in `ctx.doc.ledger?.transient(...)`
   if you reach the ledger directly — otherwise just ensure zero stray
   refs (`removeRefs`) and note `demonstrated, not resident` in the
   spec label.
6. **Claims discipline**: `covers` ids must exist in
   `~/paged/state/registry/features/*.yaml` AND be shipped — grep
   before claiming; an unknown or unshipped row fails assembly for
   everyone. Claim what the page VISIBLY exercises, nothing more.
   Known trap: `plugin-web.bake-to-native` is NOT shipped — do not
   claim it (demonstrate + margin note instead).
7. **Wire shapes**: read the generated d.ts
   (`node_modules/@paged-media/canvas-wasm/paged_canvas_wasm.d.ts`)
   before calling an op you haven't used — never guess args. Known:
   `Value` is adjacently tagged (`{type,value}`); `storyRange`/
   `tableCell` ElementIds are structs (`doc.storyRangeId(...)`);
   `insertTable` mints a struct id (use `doc.mutate`, not `mutateId`);
   `placeImage`/`replaceImageBytes` take the BARE self id;
   `insertSection` surfaces no createdId (rediscover via the sections
   collection); batch cannot address an id minted in the same batch
   except through `bindCreated`/`$h:` handles.
8. **Fonts**: the chapter runner registers the palette after every
   load. Faces: Source Serif 4 (body), Fraunces (display), Space
   Grotesk (heads/captions), EB Garamond (specimen + italic voices),
   JetBrains Mono (code/spec), Noto Sans Arabic, Noto Sans JP.
   `FontStyle="Bold"`/"Italic" exist for the faces that carry them.
9. **`client.mutate` refusals throw** through `doc.mutate` — let them;
   never catch-and-continue without a margin note. A module that
   authors nothing fails its pixel assertion by design.
10. **Assets** live in `tests/showcase/assets/` (see its README for
    what exists: photos/, web/, annual-charts.xlsx, annual-report.docx,
    annual-layers.psd, annual-orders.csv, SVGs, EPS, CMYK JPEGs).
    Never add an asset without a grant row in the README.

## Verifying your chapter (solo mode)

```bash
cd ~/paged/editor/apps/canvas
pnpm typecheck:showcase                      # first — the tree has its own tsconfig
SHOWCASE_SOLO=<your-id> npx playwright test --project=showcase --grep "<your-id>"
```

Solo builds your chapter directly on the base fixture (sound: no two
chapters share pages), writes `.solo` outputs the real chain ignores,
and runs your pixel assertions for real. Iterate until green. The
integrated chain run is the coordinator's job, not yours.

## What the runner does for you

Before-render snapshot per module, pixel-change assertion (GPU modules
degrade to a note on CPU lanes — set `needsGpu: true`), ledger tallies
at the driver chokepoint, checkpoint save, fragment write. Your module
reports `{title, covers, elements, notes}` — elements you created, so
the record is checkable.
