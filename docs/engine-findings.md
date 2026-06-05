# Engine findings — bugs the E2E op suite surfaced

The E2E operation suite (`apps/canvas/tests/e2e/`) exists to answer one
question for every editor operation: _did it actually land in the IDML
document on the canvas?_ On its first runs it caught the following
**engine** issues in `paged-media/core` (the editor consumes the engine
across a package boundary, so these are filed for core, not fixed
here). Each is flagged in the suite by a `test.fail` / `test.fixme` that
turns **red the day core fixes it** — so this list stays honest.

Discovered 2026-06-05.

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

## 4. deleteFrame undo loses the item transform (pre-existing)

**Symptom.** Undoing `deleteFrame` (RemoveNode) re-inserts the frame
with an **identity** item transform — the frame jumps to the page
origin instead of its original position.

**Cause.** `paged-mutate` `invert_remove_node` doesn't preserve
`item_transform` when building the re-insert inverse.

**Suite anchor.** `proving.spec.ts` AC-E2E-PROVE-3 (`test.fail`).

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
