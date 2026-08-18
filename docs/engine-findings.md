# Engine findings — bugs the E2E op suite surfaced

The E2E operation suite (`apps/canvas/tests/e2e/`) exists to answer one
question for every editor operation: _did it actually land in the IDML
document on the canvas?_ On its first runs it caught the following
**engine** issues in `paged-media/core` (the editor consumes the engine
across a package boundary, so these are filed for core, not fixed
here). Each is flagged in the suite by a `test.fail` / `test.fixme` that
turns **red the day core fixes it** — so this list stays honest.

Discovered 2026-06-05.

> **STATUS 2026-06-06 — all four resolved; markers flipped.** Core
> (protocol v27) fixes #1/#3/#4 and adds engine-side regression guards
> (`paged-canvas/tests/emit_cache_undo.rs`, `paged-mutate`
> `remove_node_undo_restores_item_transform`). #2 was diagnosed as a
> FIXTURE issue, not an engine bug — see its section. The anchor specs
> now assert the correct behaviour directly (no `test.fail` /
> `test.fixme` left for these): AC-E2E-TEXT-5, AC-E2E-STYLE-1,
> AC-E2E-PAGE-4 (promoted to a live render sandwich), AC-E2E-PROVE-3.
> Per-finding details below.

> **STATUS 2026-08-18 — #6 + #7 FIXED at the current pin.** The W2 sweep
> surfaced a batch-insertFrame duplicate-self_id bug (#6, gridify) and a
> cluster of wire-accepted-but-render-ignored property paths (#7); both
> were fixed in core (verified against the v61 pin by the 17082026
> audit's blind-spot pass — core 27f7d0a; the sandwich's zero-pixel rule
> stays as the standing guard). This doc misreported them OPEN for two
> months after the fix — status lines here must cite the verifying run.

## 1. Text undo/redo don't clear the body-story emit cache

**Symptom.** After `insertText` / `deleteRange`, undo restores the
story model (character count correct) but the canvas keeps the
**stale post-edit text layout** for the body story — one text line's
pixels don't revert (~1.6–3.2k px differ).

**Cause.** The forward text path (`CanvasModel::apply_mutation`, the
text-op arm) explicitly clears `body_story_emit_cache` +
`master_text_emit_cache` before rebuild — the body-story signature
otherwise matches on content-only edits and the change never displays.
`undo()` / `redo()` (`paged-canvas/src/model.rs`) apply the inverse and
rebuild but **do not** clear those caches, so the rebuild reuses the
pre-undo emit.

**Likely fix.** Clear `body_story_emit_cache` + `master_text_emit_cache`
in `undo()` and `redo()` for the `LoggedMutation::Text` arm, mirroring
the forward path.

**Suite anchor.** `text-ops.spec.ts` AC-E2E-TEXT-5 (`test.fail`); the
two forward text sandwiches waive only the undo-pixel check via
`skipUndoPixelCheck`.

**RESOLVED (core, 2026-06-06).** Exactly the likely fix: `undo()` /
`redo()` clear both emit caches before the rebuild — for both log arms
(frame inverses replay structural ops under the same caches). Engine
guard: `paged-canvas/tests/emit_cache_undo.rs`
`text_undo_restores_the_display_list`. Marker + waivers removed;
AC-E2E-TEXT-5 asserts strictly.

## 2. setStyleProperty on a text style doesn't repaint the canvas

**Symptom.** Editing an in-use paragraph style's `characterFontSize`
applies to the model (the capability matrix proves `setStyleProperty`
is accepted) but produces **no canvas repaint** — the style→text
cascade never reaches the rendered document.

**Cause (likely).** Same family as #1 — the frame-mutation rebuild path
(`SetStyleProperty` → relayout) doesn't clear the text emit cache, so
text laid out under the old style stays cached. (Could in part be the
generated fixture's text carrying direct formatting; to confirm,
re-check once #1 is fixed.)

**Suite anchor.** `style-ops.spec.ts` AC-E2E-STYLE-1 (`test.fail`).

**RESOLVED — fixture, not engine (2026-06-06).** The engine cascade
repaints correctly (proven by core's
`set_style_property_repaints_styled_text`, which drives
`characterFontSize` through a style with NO direct formatting). The
no-repaint here was the second hypothesis: the generated
`text-advanced` story carries direct `PointSize="12"` on its
`CharacterStyleRange`, which outranks the paragraph style in the
cascade — a style font-size edit legitimately changes nothing visible.
AC-E2E-STYLE-1 now edits `paragraphJustification` (not overridden by
the fixture's direct formatting) and passes as a real cascade-repaint
proof. The style-edit *undo* leg was additionally covered by fix #1.

## 3. insertPage in the MIDDLE of the set panics the renderer

**Symptom.** With a render pipeline already built (i.e. any page has
been rasterised — true as soon as the app paints), inserting a page
_after an existing page_ panics:

```
index out of bounds: the len is N but the index is N
  at paged-renderer/src/pipeline/mod.rs:1890
```

`mutate()` then never resolves (the panic is inside the synchronous
worker-side `rebuild_after_mutation`), so the call hangs.

**Cause.** `insertPage`'s rebuild re-renders the shifted trailing page
at index `N` but the per-page pipeline vector still has length `N`
(0..N-1) — it isn't grown on insert. **Appending** (`afterPageId: null`)
does not trip it. The capability matrix classifies `insertPage`
"supported" because it never snapshots (no pipeline → no panic).

**Likely fix.** Grow the renderer's per-page pipeline vector when a
page is inserted (before the post-mutation render), for any insert
position.

**Suite anchor.** `page-ops.spec.ts` — PAGE-1 appends (works); PAGE-4
(`test.fixme`) owns the middle-insert render case.

**RESOLVED (core, 2026-06-06).** Root cause was sharper than the
hypothesis: not an ungrown pipeline vector but the **body-story emit
cache** — its signature ignored the chain's page *indices*, so cached
per-page deltas survived page-set changes with stale absolute indices;
the un-cleared undo/redo path (finding #1) then spliced past
`pages.len()`. Core now (a) clears the caches on undo/redo, (b) keys
the signature on the chain page indices, and (c) bounds-guards the
splice as a cache miss. The exact panic (`len is 2 but the index
is 2`) reproduces in core's
`insert_page_middle_undo_redo_round_trips_built_pages` before the fix.
PAGE-4 is promoted to a live render sandwich and passes.

## 4. deleteFrame undo loses the item transform (pre-existing)

**Symptom.** Undoing `deleteFrame` (RemoveNode) re-inserts the frame
with an **identity** item transform — the frame jumps to the page
origin instead of its original position.

**Cause.** `paged-mutate` `invert_remove_node` doesn't preserve
`item_transform` when building the re-insert inverse.

**Suite anchor.** `proving.spec.ts` AC-E2E-PROVE-3 (`test.fail`).

**RESOLVED (core, 2026-06-06, protocol v27).** `NodeSpec` gained an
optional `item_transform` carried through the RemoveNode capture →
undo re-insertion (the wire type change behind the v26→v27 bump).
Engine guard: `paged-mutate` `remove_node_undo_restores_item_transform`
(byte-identical spread round-trip). Marker removed.

## 5. EDITOR bug (fixed here): draw tools never drew on first use

Not an engine bug — an **editor** one the `tools-ui` suite surfaced and
this repo fixes. `ViewportCanvas.onPointerDown`'s `useCallback` omitted
`props.toolGesture` from its dependency array. A draw tool's gesture
handler arrives only _after_ the tool is activated, so the callback
kept the stale `toolGesture` (null, captured while Select was active)
and the first drag fell through to the legacy select path — the
Rectangle / Line / Pen tools silently never drew until some unrelated
dep (a pan, a selection change) happened to rebuild the callback.

**Fix.** Add `props.toolGesture` to the `onPointerDown` deps
(`apps/canvas/src/ui/ViewportCanvas.tsx`). `onPointerMove` / `onPointerUp`
already depend on the whole `props` and were unaffected. `tools-ui`
AC-E2E-TOOLS-1 (a real mouse drag → a frame) is the regression guard.

## 6. batch insertFrame mints DUPLICATE self_ids (gridify N×M)

Discovered 2026-06-06 (W2 gesture sweep).

**Symptom.** The Rectangle tool's gridify (DR-05) commits an N×M grid as
ONE `batch` of N `insertFrame` ops (so the grid is a single undo step,
INV-1). Core rejects the batch:

```
frame mutation failed: batch failed at index 1:
  duplicate self_id "ufe7ab9" — IDML node IDs must be unique
```

The first frame lands; the second collides with the first's id.

**Cause.** `insertFrame` carries no `selfId` on the wire (`Mutation` =
`{ op: "insertFrame"; args: { pageId; bounds } }`), so the engine mints
the new node's self_id. Within a single `batch`, that minting derives
the id from the **pre-batch** document state (unchanged across the
sub-ops), so every batched `insertFrame` gets the SAME id. A single
`insertFrame` (the 1×1 / DR-07 path) is unaffected.

**Likely fix.** Advance the id generator against the in-progress
(post-prior-sub-op) document state when applying a `batch`, so each
batched create mints a fresh id — or seed insert ids from a
monotonically-incrementing counter rather than a snapshot hash.

**Editor side is correct.** `packages/tools/src/handlers/rectangle-tool.ts`
builds the batch the documented way; there is no wire field to
disambiguate ids from the client.

**Suite anchor.** `gesture-gridify.spec.ts`
"DR-05/E2E-02 — … 3×2 grid in ONE undo step" (`test.fixme`). The DR-07
(1×1), Escape (INV-1), and no-active-drag cases stay live and pass.

## 7. text/paragraph/frame property RENDER consumption gaps

Discovered 2026-06-06 (W2 ops sweep). A cluster of `setElementProperty`
paths round-trip on the wire (protocol v28 — the value applies to the
model and survives undo, asserted by the panel specs + capability
matrix) but core's compose/layout does NOT consume them yet, so the
page repaints with a **zero-pixel** delta:

- `characterSkew` (false-italic shear) — `character-ops` AC-E2E-CHAR-skew
- `paragraphLeftIndent` / `paragraphRightIndent` — `paragraph-ops`
- `paragraphRuleAbove` (rule line) — `paragraph-ops` AC-E2E-PARA-ruleAbove
- `frameOuterGlowEnabled` / `frameInnerGlowEnabled` (glow blur) —
  `effects-ops` (drop/inner shadow, bevel, satin, feather DO composite)
- `frameStrokeGapColor` (dashed-stroke gap under-paint) — `stroke-ops`

**Cause (likely).** The value reaches `element_properties` (read-back
works) but the corresponding compose stage (text shaper for skew/indents,
rule painter, effect compositor's glow pass, stroke shapes.rs gap pass)
doesn't read it. Sibling effects in the same families render, so the
wiring is per-property, not a whole-stage gap.

**Suite anchors.** Each test keeps the MODEL + undo assertions hard and
relaxes only the pixel gate via the op-sandwich's `noRenderChange`
(asserts ZERO render) — so it flips loudly ("declared noRenderChange but
pixels changed") the day core wires the render. Bullets
(`paragraphBulletCharacter`) was in this list on first pass but core
DOES composite it (~3.2k px), so its sandwich asserts a live render.

---

### What works (verified byte-clean)

For contrast — the determinism guarantees the suite **confirms** hold:

- A 5-op heterogeneous stack (createSwatch → opacity → fill → resize →
  translate gesture) undoes to **byte-identical** baseline and redoes
  to byte-identical end (`undo-stack` UNDO-1).
- Replaying the same op sequence on a fresh reload reproduces the same
  pixels (`undo-stack` UNDO-2 — the E2E mirror of core's AC-E-7).
- `pathfinderBoolean` union + single undo restores both shapes
  byte-clean (`path-pathfinder-ops` PATHF-1).
- An edit changes the exported PDF and undo restores it byte-for-byte
  in print (`export-verification` EXPORT-1), with a determinism guard
  (two exports of the same doc rasterise identically).
- `paged.*` scripting produces the same model as the wire mutation
  (`script-parity`).
- Real documents (sample.idml 48p, line-sheet.idml 7p) take the core
  op pass with no worker errors (`real-doc-smoke`).
