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

> **STATUS 2026-10-05 — #10, #11, #12 + #14 FIXED at the current pin.**
> Engine 0.65 fixed all four (core 4fa48f1, e9b80a5, 65ee6a1, 91bafcc);
> the editor's pin moved 0.64 → 0.66.0, the four `test.fail` anchors
> (AC-OBJ-ENGINE-1..4) turned red, and each was re-pinned to the fixed
> behaviour as measured on canvas-wasm 0.66.0 in a Playwright chromium
> run of `e2e/object-commands.spec.ts`. The editor workarounds they
> guarded were removed (details per section). #15 and #16 stay OPEN, still
> anchored by `test.fail`.

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

## 8. DocumentMeta.dirty was hardcoded false (FIXED core-side, awaits pin)

Discovered 2026-08-18 by the Info panel's first behaviour spec
(`info-panel.spec.ts` AC-INFO-2): the engine's `document_meta()` returned
`dirty: false` unconditionally, so EVERY consumer — the ModeSwitcher
status chip ("No unsaved edits"), the DocTitleBar dirty dot, the Info
panel's Dirty row — permanently claimed a clean document through any
number of edits. The U14 honest-wording fix rode a dead flag.

**Fixed in core** the same day: `dirty = !applied_log.is_empty()`
(edits-since-load; undoing everything reads clean again; a pending redo
does not differ from the loaded state) + a model test pinning the
lifecycle. Rides the v0.61.2 tag; AC-INFO-2 is `test.fixme` until the
canvas-wasm pin carries it — unfixme at the bump.

## 9. resizeFrame repaint-stale on real templates (OPEN)

The truthful 61-pack op sweep (2026-08-18, post harness-truthing) puts
`resizeFrame` at 41/61 packs render-stale — "operation produced NO
render change in the affected region" — with the model verified landed
(real `expectModel` readback) and the whole host page diffed. One pack
(`cultured-business-newsletter`) additionally shows the resize UNDO
restoring non-byte-identically (3236 px, the determinism finding from
the August audit). The same write repaints fine on the generated
fixtures, so it smells like a geometry-write invalidation/rebuild gap
that only real template documents hit. Needs a core-side reproduction
against an envato pack; tracked for the next engine investigation.

**NOT part of this finding (corrected 2026-08-19):** the first run of
the expanded sweep showed `frameStrokeWeight` 0/59 and
`frameStrokeColor` 27/59 stale, and it was tempting to read that as the
same engine gap. It was the HARNESS: both stroke ops targeted the
fill-picked rectangle, and a wider stroke of `Swatch/None` paints
nothing exactly as a recoloured 0pt stroke does. With an honest target
(visible stroke colour AND non-zero weight, else an explicit skip) both
ops pass where a stroked rectangle exists and skip where none does.
`paged-mutate` emits the `frame_style` invalidation hint for these
paths correctly. Cost of the lesson: a harness target fact wearing an
engine finding's clothes for one afternoon.

## 10. deleteFrame does not renumber group member tables (FIXED in 0.65)

Discovered 2026-10-02 building `paged.object.delete`, at the
`canvas-wasm` 0.64.0 pin (core `main` @ `9f933f1` carries the same
code).

**Symptom.** Removing a page item silently re-seats the members of
every group on the spread that holds a LATER-created item of the same
kind. The engine reports `mutationApplied`. On a blank document, four
rectangles `u1..u4`, `createGroup [u2,u3]` → `u5`:

```
before            rectangle:u1, group:u5[rectangle:u2,rectangle:u3], rectangle:u4
deleteFrame u1    group:u5[rectangle:u3,rectangle:u4], rectangle:u4
```

`u2` has fallen out of the group (and out of the scene tree), and the
unrelated `u4` is now a member and is listed twice. Deleting `u4`
(created after the members) is clean, and so is deleting an item of a
different kind (a text frame beside a group of rectangles).

The same op on a MEMBER (`deleteFrame u2` above) corrupts the same way
— and there undo does not repair it: the member comes back as a second
top-level entry (`group:u4[u1,u2], u3, u1`).

**Cause.** A `Group` holds `members: Vec<FrameRef>`, indices into the
spread's per-kind vecs. `remove_and_capture` removes the item from its
vec and calls `unregister_frame_ref`
(`paged-mutate/src/apply/insert_node.rs`), which shifts the later
indices in `frames_in_order` and in `nested_children` — but never
touches `spread.groups[..].members`. Every group ref of that kind past
the removed slot now points one item along. `register_frame_ref` has the
mirror gap on re-insert, which is why undo of a NON-member delete lands
exactly right (the indices shift back) and undo of a member delete does
not.

Every `RemoveNode` shares this, not only the wire's `deleteFrame` — the
pathfinder verbs remove their inputs through the same path.

**Likely fix.** Shift `Group::members` in `unregister_frame_ref` /
`register_frame_ref` the way `nested_children` is shifted, and drop the
removed item's own ref from any group that holds it (capturing the
group + slot in the inverse, as `z_slot` is captured).

**What the editor does meanwhile** (`apps/canvas/src/object-commands.ts`):
a selected item inside a group that is staying is refused before the
wire; for everything else the member tables of the surviving groups are
read back after the delete and, on a difference, the delete is undone
and the user is told. So Delete is SAFE but not always AVAILABLE: on a
real document, deleting an early rectangle from a spread that groups
later ones is refused until this is fixed.

**Suite anchor.** `e2e/object-commands.spec.ts` AC-OBJ-ENGINE-1
(`test.fail`); AC-OBJ-17 / AC-OBJ-18 pin the editor's two guards.

**Fixed in 0.65** (core 4fa48f1: `register_frame_ref` /
`unregister_frame_ref` renumber group members and drop the removed ref).
Measured on 0.66.0: deleting `u1` below `group[u2,u3]` leaves the group
whole, one undo restores it exactly, redo re-deletes. Deleting one member
of a two-plus group shrinks the group correctly and undo restores it.
Deleting EVERY member of a group without dissolving it leaves an empty
`group:<id>` in the tree (undo restored it in this measurement;
paged.draw pinned a flow where it does not).
AC-OBJ-ENGINE-1 is a plain pin now. The editor's read-back-and-undo guard
was removed and AC-OBJ-18 asserts the ordinary delete; the member refusal
(AC-OBJ-17) stays as host policy because of the empty-group case, with a
reason that no longer blames the renumbering.

## 11. Undo of deleteFrame restores a bare frame (FIXED in 0.65 — the residue of #4)

**Symptom.** Delete → undo brings a frame back with its geometry, fill,
stroke colour and stroke weight, and nothing else. Measured on a
rectangle at 0.64.0:

```
frameOpacity              40    → null
frameNonprinting          true  → false
frameCornerRadiusTopLeft  12    → null
placed image (hasImage)   true  → false
```

A text frame keeps its story (`parent_story` is captured); an untouched
fresh frame of every kind round-trips with no difference at all, which
is why the suite's delete sandwiches are green.

**Cause.** Documented in the engine: `NodeSpec` "carries the minimal
Stage-1 supported field set plus `item_transform` … Remaining
non-essential fields (drop_shadow, opacity, effects, …) still default
on re-insertion" (`paged-mutate/src/operation.rs`). The inverse of
`RemoveNode` is an `InsertNode` of that spec, so everything outside it
is rebuilt from defaults. A dissolved group's inverse (`GroupSpec`) has
the same shape: id, members, parent and transform, without the group's
transparency block or corner attributes.

**Likely fix.** Capture the removed item itself (the whole
`Rectangle` / `TextFrame` / … value) in the inverse rather than a
re-derivable subset, as the transform was added for #4.

**What the editor does meanwhile.** Nothing can be done host-side for
formatting — the loss happens inside undo. The one loss the host can
detect exactly, a placed image, is announced when the frame is deleted
(an `info` line in the Problems panel).

**Suite anchor.** AC-OBJ-ENGINE-2 (`test.fail`); AC-OBJ-19 pins the
notice.

**Fixed in 0.65** (core e9b80a5: `NodeSpec::Captured` carries the whole
node, image bytes included). Measured on 0.66.0: opacity 40, corner
radius 12 and the placed image all come back on undo. AC-OBJ-ENGINE-2 is
a plain pin (now with the image too); the editor's "undo brings the frame
back empty" notice was removed, and AC-OBJ-19 asserts that no notice is
posted and that undo returns the image.

## 12. Deleting a container releases what was pasted into it (FIXED in 0.65)

**Symptom.** `pasteInto { container: u1, child: u2 }`, then
`deleteFrame u1`: the tree goes from `rectangle:u1` (the child is not
listed while nested) to `rectangle:u2` — the child reappears as a free
top-level item instead of going with its container. Undo then yields
`rectangle:u1, rectangle:u2`: both top-level, the nesting gone.

Deleting the CHILD is refused, correctly and legibly: `frame mutation
failed: invalid value for FrameTransform on Rectangle("u2"): B-18: the
item is pasted into a container — release it before removing`.

**Likely fix.** `apply_remove_node` on a container either removes its
nested children with it (capturing them in the inverse) or refuses the
way the child's delete does.

**Suite anchor.** AC-OBJ-ENGINE-3 (`test.fail`). The scene tree does
not report nested children (§15), so a container cannot be told from a
plain frame before the delete — EXCEPT for the clipping masks the editor
made itself: `paged.object.makeClippingMask` keeps an index of the
content on the container, and `paged.object.delete` releases and removes
that content before the container, in the same batch, so the content
goes with it and one undo re-nests it (AC-OBJ-35). Content nested by
anything else still pops out.

**Fixed in 0.65** (core 65ee6a1: `RemoveNode` on a container releases and
removes each child, and its inverse re-nests them). Measured on 0.66.0:
the child goes with its container, and one undo brings the container back
with the child nested (the tree lists the container alone;
`releaseFrom` on the child applies). AC-OBJ-ENGINE-3 is a plain pin that
also checks the undo. `paged.object.delete` keeps spelling the indexed
content out in its batch (the same outcome), but no longer refuses when
the index cannot be read: the engine takes the content along itself.

## 13. Two writes the engine accepts and should not (OPEN, minor)

Found by the same probes; neither is on `paged.object.*`'s path.

- **`setElementProperty { frameTransform }` on a GROUP id applies and
  moves nothing.** It rewrites the group's stored matrix and leaves
  every member where it was, so the group's own transform and its
  members' positions disagree from then on. `setGroupTransform` is the
  op that rebases the members; `moveFrame` on a group id is refused
  (`Mutation::MoveFrame`). The generic write should refuse too, or
  route to the group op.
- **`elementLocked` is not enforced on the wire.** `moveFrame` and
  `deleteFrame` both apply to a frame whose `elementLocked` is `true`.
  The hit-tester keeps locked items out of a click selection, so this
  only bites a selection made from a panel — but nothing below the
  editor would stop a script or a plugin.

## 14. The translate gesture does not move an un-rotated line or path (FIXED in 0.65)

Found 2026-10-02 while choosing the op for `paged.object.nudge*`, by
rendering what the engine's own drag commits against what a transform
write commits (blank document, one item, `beginGesture translate` →
`updateGesture [40, 20]` with snap off → `commitGesture`; page rendered
at 1 px/pt):

```
              drag (gesture)        moveFrame (transform)   drag vs transform
rectangle     14400 px changed      14400 px changed        0 px   (identical)
line              0 px changed        800 px changed        800 px
pen path          0 px changed       1026 px changed       1026 px
```

**Symptom.** Dragging an un-rotated line or pen path commits, repaints
nothing, and leaves the object where it was; the model's bounds have
moved (`[450,50,490,150]` → `[455,60,495,160]`) while its anchors have
not (`[[50,450],[150,490]]` before and after), so the selection box and
the drawn path part company.

**Cause.** `compute_node_mutation` sends every un-rotated item down the
BOUNDS path (`NodeMutation::Bounds(translate_bounds(..))` →
`SetProperty { FrameBounds }`). For a rectangle, an ellipse and a text
frame the bounds ARE the geometry. A line and a polygon are drawn from
their anchors, which that write does not touch. A rotated item, or any
item in a gesture that includes a group, takes the transform path and
moves correctly.

**Likely fix.** Send path-bearing kinds (non-empty `path_anchors`) down
the transform path, or translate the anchors with the box.

**Why it matters here.** It is the reason nudge writes the transform
for every kind rather than copying what the gesture commits: the same
`frameBounds` write is reachable from the wire and from the Transform
panel's X/Y fields, and has the same effect on a line.

**Suite anchor.** AC-OBJ-ENGINE-4 (`test.fail`); AC-OBJ-30 proves the
transform write does repaint a line and a pen path.

**Fixed in 0.65** (core 91bafcc: the gesture sends every item the
renderer draws from a path down the transform path). AC-OBJ-ENGINE-4 is a
plain pin. Only the GESTURE changed: a direct `frameBounds` write still
moves the box alone, so nudge and the typed X/Y keep writing the
transform (which is also rigid for a rotated item).

## 15. Nothing on the wire lists what is pasted into a frame (OPEN)

Found 2026-10-02 building `paged.object.releaseClippingMask`, at the
`canvas-wasm` 0.64.0 pin (core `9f933f1`).

**Symptom.** A pasted-in child disappears from every read that
ENUMERATES, while every read and write BY ID still answers for it.
Blank document, four rectangles `u1..u4`, then `pasteInto { containerId:
u4, childId: u1 }` and the same for `u2` (both apply — one container
takes several children, painted in paste order):

```
sceneTree()                      rectangle:u3, rectangle:u4    (u4 has no children)
requestGroupLeaves { u4 }        []
elementProperties(u4)            no entry naming its content
hitTest at (50, 50) — over u1    element: null
elementGeometry([u1, u2])        both answer, bounds and transform intact
releaseFrom / moveFrame on u1    both apply
```

So a host that did not do the nesting itself cannot find the content —
an InDesign paste-into, a script's, paged.draw's clipped repeats.

**Cause.** `scene_tree` builds each frame node with `children:
Vec::new()` and walks only `frames_in_order`; `group_leaves` walks only
`Spread::groups`; the hit-tester's `collect_candidates` walks only
`frames_in_order`. None of them reads `Spread::nested_children`.

**Likely fix.** List a container's nested children as the children of
its scene-tree node (the shape the tree already has for a group), or add
a `requestNestedContent { containerId }` door.

**What the editor does meanwhile.** `paged.object.makeClippingMask`
stamps the content's ids on the container as plugin metadata
(`x-paged:paged.object`) in the same batch as the `pasteInto`s, so undo
and redo keep index and nesting in step; Release, Delete and Nudge read
it, and keep only entries that are still nested (absent from the tree,
answering `elementGeometry`). Release on a container with no index is
refused with the reason ("holds no content this editor clipped …").

**Suite anchor.** AC-OBJ-ENGINE-5 (`test.fail`); AC-OBJ-36 pins the
refusal.

## 16. Moving a container leaves its pasted-in content behind (OPEN)

Found the same day, nudging a clipping path.

**Symptom.** Blank document; `insertFrame u1 [100,100,200,300]`,
`insertOval u2 [120,120,180,220]`, `pasteInto { u2 ← u1 }`:

```
moveFrame u2 [1,0,0,1,10,0]          u2 moves; u1 itemTransform stays null
drag u2 (translate gesture, [40,20]) u2 bounds → [140,160,200,260]; u1 unchanged
```

The mask slides over content that stayed put, so a different part of
the content shows. InDesign's Selection tool and Illustrator move a
frame and its content together; moving only the frame is what Direct
Selection is for.

**Cause.** Documented in the engine: B-18 "the child's spread-space
`item_transform` is untouched in BOTH directions"
(`paged-mutate/src/apply/nested.rs`). Children hold ABSOLUTE spread
transforms, and the frame-transform / frame-bounds writes and the
gesture commit touch the container only — unlike `SetGroupTransform`,
which rebases a group's members.

**Likely fix.** Rebase nested children by the container's transform
delta in the container's `FrameTransform` / `FrameBounds` writes and in
the translate gesture's commit, capturing the children's previous
transforms in the inverse — what `SetGroupTransform` does for members.

**What the editor does meanwhile.** `paged.object.nudge*` moves the
content its own index lists by the same step, in the same batch
(AC-OBJ-34). The drag is the engine's gesture and cannot be corrected
host-side.

**Suite anchor.** AC-OBJ-ENGINE-6 (`test.fail`).

## 17. Element geometry is in SPREAD space, and no read says where the page is (OPEN)

Found 2026-10-02 making Transform ▸ X / Y read where the object is.

**Symptom.** `elementGeometry` answers `bounds` + `itemTransform` that
compose into SPREAD coordinates, while everything the host draws or
types is page-relative — and nothing on the wire carries a page's origin
inside its spread. On a document made here (File ▸ New) and on the
`paged-gen` fixtures the two coincide (the page sits at the spread
origin), which is why the suite never saw it. On an InDesign-authored
document they do not: InDesign centres the spread's coordinate system,
so a page's origin is `(0, -h/2)` (a right-hand page) or `(-w, -h/2)` (a
left-hand one). `corpus/idml/samples/sample.idml`, text frame `u29a2f`
on page 1 (612 × 792):

```
elementGeometry           bounds [-18, -92.21, 50.44, 166.43], itemTransform [1,0,0,1, 306.73, -302.35]
  composed top-left       (214.51, -320.35)          spread space
hitTest at (343, 110)     frameBounds top-left (214.51, 75.65)   page space
difference                (0, -396) = the page's origin in its spread
```

The selection chrome (`selection-chrome.tsx`, and the resize / rotate
handles) composes exactly this and adds the page's layout rect, so on
that document the selection outline is drawn 396 pt ABOVE the frame —
measured at 79 % zoom: outline top at y = -66 px, the frame at 245 px.
What a user sees on the frame there is the hit marker, which reads the
hit's own page-local `frameBounds`. The wire's own doc comment on
`ElementGeometryItem::page_id` implies the opposite convention ("`None`
… bounds + item_transform compose against the SPREAD origin rather than
a page origin").

**Cause.** `element_geometry` returns the spread item's `bounds` and
`item_transform` untouched (it uses them only to find the host page);
the hit-tester converts with `BuiltPage::spread_origin`, which is not on
any reply (`PageSummary` carries size and margins only).

**Likely fix.** For a page-owned item, compose against the page: either
subtract `spread_origin` in `element_geometry` / `path_anchors` (and
accept page-local input on the matching writes), or carry the origin on
the item (`pageOrigin`) or on `PageSummary` so a host can do it once.

**What the editor does meanwhile.** Transform ▸ X / Y and Properties ▸
Bounds read `elementGeometry` composed — the same space the selection
chrome draws in, and the space every move writes — so read, write and
chrome agree with each other. On an InDesign document all three are
offset from the page by the page's spread origin; that cannot be
corrected host-side without a read of the origin.

**Suite anchor.** `e2e/transform-readout.spec.ts` AC-XY-ENGINE-1
(`test.fail`).

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
