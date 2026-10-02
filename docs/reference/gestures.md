# Paged — Gesture & Interaction Testing Plan

June 2026 (version 1.0). Test plan for canvas gestures and direct-manipulation interactions. Sections describe intent; where the implementation differs, [testing.md](testing.md), `../status.md` and the ADRs in `../adr/` are authoritative.

This file is the id source for the gesture suites under `apps/canvas/tests/e2e/`. Source comments and test titles cite it as `gestures.md`, by section number and by test id (for example `DR-05`, `INV-1`, `E2E-07`). Section numbers and ids are unchanged.

**Stack under test:** Vello-on-WebGPU WASM renderer (Rust) · React shell (Cockpit, shadcn/ui) · tsify type contracts · Boa scripting layer · Operation/Gesture mutation channels · a persistence backend (REST, SQLite)

> **Status note 2026-06-07 — shell is the Cockpit, not Dockview.** The
> Dockview-specific scenarios below (IN-05/IN-08/GC-07/E2E-09/FZ-04 "float the
> canvas panel, split it", "Dockview floating panes breaking coordinate
> mapping", "Dockview re-layout during hover") test behaviors the **Cockpit does
> not have** — its panels are fixed per-mode slots that never float, split, or
> pop out. The coordinate-mapping-under-transformed-container concern survives
> (the canvas still sits inside a scrollable/transformed region), but the
> *floating/splitting torture* class is moot (see
> [ADR 002](../adr/002-cockpit-over-dockview.md)). Read "Dockview" as "the
> Cockpit's panel region" and drop the float/split sub-cases.

---

## 1. Objectives & Scope

### 1.1 Objectives

1. Guarantee that every gesture is **deterministic**: identical input event sequences produce identical document mutations and identical rendered output.
2. Guarantee **transactional integrity** of the Gesture channel: a gesture either commits as exactly one Operation or aborts with zero document mutation (Esc-cancel invariant).
3. Guarantee **mid-gesture re-interpretation** works correctly: modifier keys (Shift/Alt/Cmd), spacebar-reposition, and arrow-key gridify are evaluated continuously, not only at gesture start.
4. Keep interaction latency inside the frame budget (target: ≤ 8 ms input-to-update on the main thread, 60 fps sustained during drags, 120 fps capable on ProMotion-class devices).
5. Prevent regressions in snapping, constraint resolution, and hit-testing precision across zoom levels and document coordinate extremes.
6. Validate the full WASM boundary: every gesture-related type that crosses Rust ↔ TypeScript via tsify is round-trip safe.

### 1.2 In scope

- All pointer-driven gestures on the document canvas (see gesture inventory, §6).
- Gesture lifecycle: hit-test → begin → update(s) → commit/abort.
- Snapping (Smart Guides), constraint resolution, modifier semantics.
- Undo/redo correctness of gesture-produced Operations.
- Rendering feedback during gestures (live preview, ghost frames, selection chrome).
- Input device variance: mouse, trackpad, pen/stylus (pressure ignored or honored per spec), touch.
- Chrome WebGPU behavior across OS backends (Vulkan/Metal/D3D12 via Dawn). Other browsers are explicitly deferred (§8.2).

### 1.3 Out of scope (covered by separate plans)

- IDML import/export fidelity (renderer test plan).
- Text composition/shaping correctness (typography test plan).
- Backend REST API contract tests beyond persistence of committed Operations.
- Collaboration/multi-user conflict resolution (future).

---

## 2. Architecture Under Test & Test Seams

*Status note (2026-10-02): this section predates the implementation. The Rust core is the engine, a separate repository consumed here as published wasm packages ([ADR 200](../adr/200-engine-as-npm-wasm-packages.md)); hit testing, gestures and snapping are implemented there (core [ADR 114](https://github.com/paged-media/core/blob/main/docs/adr/114-interaction-lives-in-the-engine.md)). This repository contains no Rust code.*

The four-layer architecture gives us five natural seams. Each seam gets its own test layer so failures localize immediately.

```
┌────────────────────────────────────────────────────────┐
│  E2E (Playwright, real browser, real WebGPU)           │  Seam 5
├────────────────────────────────────────────────────────┤
│  React Shell: GestureController, input normalization,  │  Seam 4
│  panel registry, Dockview host                         │
├────────────────────────────────────────────────────────┤
│  WASM boundary: tsify contracts, Gesture/Operation     │  Seam 3
│  channel serialization                                 │
├────────────────────────────────────────────────────────┤
│  Rust core: gesture state machines, hit-testing,       │  Seam 2
│  snapping engine, constraint solver, document model    │
├────────────────────────────────────────────────────────┤
│  Vello render output (pixel/scene-graph level)         │  Seam 1
└────────────────────────────────────────────────────────┘
```

**Key testability requirements (build these in now, not later):**

- **R1 — Headless gesture driver.** The Rust core must expose `GestureSession::begin/update/commit/abort` callable without any browser, taking synthetic `InputSample { pos, modifiers, buttons, timestamp, device }` structs. This is the single most important enabler for the whole plan.
- **R2 — Event tape recording.** The shell's input normalizer can record real pointer-event streams to JSON ("tapes") and replay them deterministically into the gesture driver. Tapes become regression fixtures.
- **R3 — Scene-graph snapshot API.** The renderer can serialize its current Vello scene (or a stable digest of it) so visual assertions don't always require pixel comparison.
- **R4 — Deterministic time.** All gesture logic takes timestamps from the input samples, never from `performance.now()` internally. Hover delays (live-drag threshold) are driven by injected clocks.
- **R5 — Document state hash.** A fast, stable content hash of the document model, used to assert "abort leaves state byte-identical" and "replay produces identical result."

---

## 3. Test Strategy — Pyramid & Layer Allocation

*Status note (2026-10-02): this section predates the implementation; see [testing.md](testing.md) and [ADR 216](../adr/216-test-tiers.md) for the tiers that exist. The directories in the "Where" column, and the other `editor/…` paths in §4, are not in this repository. The suites that carry the ids of this plan are Playwright specs, `apps/canvas/tests/e2e/gesture-*.spec.ts`, with shared drivers in `apps/canvas/tests/e2e/harness/gesture.ts`. The repository has no `/test-harness` route, no dependency on `@playwright/experimental-ct-react` and no tape fixture directory.*

All browser-side testing (L2–L6) runs on **Playwright against Chrome with WebGPU enabled** — one runner, one browser, real V8, real GPU path everywhere. The only thing outside Playwright is the pure-Rust core, which stays in `cargo test` because it never touches a browser.

| Layer | Runner | Where | Volume target | Runtime budget (CI) |
|---|---|---|---|---|
| L1 Rust unit + property tests | `cargo test`, `proptest` | `editor/crates/*` | ~60% of all tests | < 3 min |
| L2 WASM boundary tests | Playwright → harness page in Chrome | `editor/tests/boundary` | ~10% | < 2 min |
| L3 Shell unit tests | Playwright component tests (`@playwright/experimental-ct-react`) | `editor/tests/components` | ~15% | < 3 min |
| L4 Integration (tape replay) | Playwright → harness page, real WASM + GestureController | `editor/tests/integration` | ~10% | < 5 min |
| L5 Visual regression | Playwright `toHaveScreenshot` + scene digest | `editor/tests/visual` | ~3% | < 8 min |
| L6 E2E | Playwright (Chrome WebGPU) | `editor/tests/e2e` | ~2% | < 10 min |

**The harness page** (`/test-harness` route, dev-build only) is the workhorse for L2/L4: a minimal page that loads the real WASM module, exposes `window.__paged` with the gesture driver, tape replayer, doc-hash, and scene-digest APIs. Playwright tests drive it via `page.evaluate()` — no synthetic DOM, no Node-side WASM shims, and everything runs in the exact JS engine and GPU stack that ships.

Principles:

- **Push everything possible down to L1.** Snapping math, constraint resolution, gridify arithmetic, rotation snapping — all pure Rust, all unit-testable in microseconds.
- **L6 E2E exists to prove the wiring, not the math.** One happy-path E2E per gesture family; the combinatorics live in L1/L4.
- **Every bug found in L4–L6 must be reproduced as an L1 or L4 tape test before the fix is merged.**

---

## 4. Layer-by-Layer Specification

### 4.1 L1 — Rust Core Unit & Property Tests

*Status note (2026-10-02): this section predates the implementation. The crates named in the headings below are not in this repository (see the note on §2). The specs under `apps/canvas/tests/e2e/` cite ids from this section where they exercise the same behaviour through the browser.*

#### 4.1.1 Hit-testing (`crates/hit-test`)

| ID | Test | Assertion |
|---|---|---|
| HT-01 | Point inside frame body | Returns frame ID, region=Body |
| HT-02 | Point on each of 8 resize handles, at zoom 25%/100%/400% | Returns correct `HandleId`; handle hit radius is screen-space constant (e.g. 4 px), not document-space |
| HT-03 | Point in rotation zone (just outside corner handle) | Region=Rotate, correct corner |
| HT-04 | Overlapping frames, top-most wins | Z-order respected; locked layers excluded |
| HT-05 | Cmd/Ctrl click-through drilling | Successive hits descend group hierarchy: group → child → leaf, then cycle |
| HT-06 | Point on path segment vs. anchor vs. control handle (direct selection) | Priority: anchor > handle > segment; tolerance in screen px |
| HT-07 | Text frame in-port/out-port hit zones | Ports hittable at all zoom levels; never overlap resize handles |
| HT-08 | Guides | Guide hit tolerance; guides on locked layer not hittable |
| HT-09 | Degenerate geometry: zero-width frame, zero-area path | No panic; defined fallback behavior |
| HT-10 | Extreme coordinates (±1e7 pt document space) | No precision-induced misses; document this as the supported coordinate envelope |
| HT-11 (property) | For random frames and random points strictly inside, hit-test always returns the frame | proptest, 10k cases |
| HT-12 (property) | Hit-test is zoom-invariant for body hits: `hit(p, z1).target == hit(p, z2).target` for body-region points | proptest |

#### 4.1.2 Gesture state machine (`crates/gesture`)

Model each gesture as an explicit typed state machine. Test the machine exhaustively.

| ID | Test | Assertion |
|---|---|---|
| GSM-01 | begin → update×N → commit | Exactly one Operation emitted; state returns to Idle |
| GSM-02 | begin → update×N → abort (Esc) | Zero Operations; document hash identical to pre-begin |
| GSM-03 | begin → commit with zero updates (click without drag) | Defined: either no-op or selection click, per gesture spec; never an empty Operation |
| GSM-04 | Drag threshold (slop) | Movement < 3 screen px does not enter Dragging state; ≥ 3 px does; threshold is DPI/zoom aware |
| GSM-05 | Double begin without commit (programming error guard) | Returns error / panics in debug, never silently corrupts |
| GSM-06 | update after abort | Rejected; state machine is total |
| GSM-07 | Pointer capture loss mid-gesture (pointercancel) | Treated as abort, full rollback |
| GSM-08 | Modifier change mid-update | Next update re-resolves constraints with new modifier set; no state carried over incorrectly (e.g. Shift released → constraint dropped on the same sample) |
| GSM-09 | Timestamp regression (out-of-order samples) | Samples with t < last-t are clamped or dropped, never reorder state |
| GSM-10 (property) | Any random sequence of begin/update/abort/commit calls | State machine never panics, never emits more than one Operation per session |
| GSM-11 (property) | Replay determinism | Same sample tape twice → identical Operation payload bytes and identical doc hash |

#### 4.1.3 Snapping engine / Smart Guides (`crates/snap`)

| ID | Test | Assertion |
|---|---|---|
| SNAP-01 | Edge-to-edge snap within threshold (e.g. 6 screen px) | Snapped position exact to target edge; emitted SnapIndicator describes the pair |
| SNAP-02 | Center-to-center snap | Both axes independent; X can snap while Y is free |
| SNAP-03 | Equal-spacing snap (3+ objects) | Gap equality detected; indicator includes all participating objects |
| SNAP-04 | Equal-dimension snap during resize | Width/height matches reference object exactly |
| SNAP-05 | Snap priority when multiple candidates within threshold | Deterministic ranking: guides > page edges/margins > object edges > centers > spacing (confirm against spec); ties broken by distance then stable object ID |
| SNAP-06 | Snap threshold is screen-space | At 400% zoom, document-space threshold shrinks 4×; verify numerically |
| SNAP-07 | Snap disabled with modifier (if spec'd, e.g. holding Ctrl) | No snapping, no indicators |
| SNAP-08 | Snap to guides vs. snap-to-grid interaction | Defined precedence; both indicators never shown contradictorily |
| SNAP-09 | Candidate set excludes the dragged object(s) themselves and locked/hidden layers | No self-snap |
| SNAP-10 | Performance: 5,000 candidate objects | Snap resolution < 0.5 ms (spatial index required — this test enforces it) |
| SNAP-11 (property) | Snapping is idempotent: `snap(snap(p)) == snap(p)` | proptest |
| SNAP-12 (property) | Snapped result is within threshold of raw input | proptest |

#### 4.1.4 Constraint & transform resolution (`crates/transform`)

| ID | Test | Assertion |
|---|---|---|
| TR-01 | Shift-constrained move | Output locked to dominant axis; axis can flip mid-drag when the other delta becomes dominant |
| TR-02 | Shift-constrained resize | Aspect ratio preserved to f64 exactness relative to gesture-begin bounds |
| TR-03 | Alt resize-from-center | Center invariant; combined Shift+Alt: proportional from center |
| TR-04 | Cmd/Ctrl scale-content-with-frame | Content transform composed correctly; verify against golden matrices |
| TR-05 | Rotation snapping with Shift | Snaps to 45° increments; angle measured from gesture-begin vector, not accumulated increments (no drift) |
| TR-06 | Rotation around reference point vs. around center | Reference-point math; nine reference-point proxy positions |
| TR-07 | Shear gesture | Shear matrix vs. golden values; no skew accumulation error over 1,000 updates |
| TR-08 | Resize through zero (drag handle past opposite edge) | Frame flips per spec (mirror or clamp — assert spec'd behavior); no negative-dimension states leak to document |
| TR-09 | Transform of rotated frame's handles | Resizing a 30°-rotated frame moves edges in frame-local space correctly |
| TR-10 | Multi-object transform | Group bounding logic; per-object transforms commute with group transform |
| TR-11 (property) | Move by d then by −d (two gestures) restores original geometry within 1e-9 pt | proptest |
| TR-12 (property) | Constrained outputs satisfy constraint predicate exactly | e.g. `|w/h − w0/h0| < ε` under Shift |

#### 4.1.5 Drawing & gridify (`crates/draw`)

| ID | Test | Assertion |
|---|---|---|
| DR-01 | Rect/ellipse/text-frame drag creation | Bounds = normalized(start, current); negative drags normalize |
| DR-02 | Shift constrain to square/circle | max-dimension square anchored at start corner |
| DR-03 | Alt draw-from-center | Center = start point |
| DR-04 | Spacebar mid-draw repositions origin | Origin translates with pointer while space held; size frozen during reposition; resumes sizing on release |
| DR-05 | Gridify: arrow keys mid-drag | Right/Left = ±columns, Up/Down = ±rows; min 1×1; gutter per spec; resulting N frames each created in the single committed Operation |
| DR-06 | Gridify + Shift | Each cell square, grid fits drag bounds per spec |
| DR-07 | Gridify then keys to return to 1×1 | Single frame commit; no residual grid metadata |
| DR-08 | Pen tool: click = corner point, click-drag = smooth point with symmetric handles | Handle vectors mirrored |
| DR-09 | Pen: Alt mid-drag breaks handle symmetry | Leading handle moves, trailing frozen |
| DR-10 | Pen: close path by clicking first anchor | Closed flag set; hit tolerance on first anchor |
| DR-11 | Pen: Esc mid-path | Per spec: abort whole path or commit placed segments — assert chosen behavior, both directions |
| DR-12 (property) | Created frame bounds always have w ≥ 0, h ≥ 0 and lie within ±coordinate envelope | proptest |

#### 4.1.6 Selection gestures (`crates/select`)

| ID | Test | Assertion |
|---|---|---|
| SEL-01 | Marquee: intersect vs. contain mode | Per spec (InDesign default: intersect); assert exact set |
| SEL-02 | Marquee from empty area vs. starting on object | Starting on object = move gesture, not marquee |
| SEL-03 | Shift-click add/remove from selection | Toggle semantics; commit emits SelectionChange (or is selection non-Operation? — assert per spec; if selection is not undoable, assert it produces no Operation) |
| SEL-04 | Marquee across locked/hidden layers | Excluded |
| SEL-05 | Text drag selection: char/word/line/paragraph (1/2/3/4-click+drag) | Granularity escalation; drag extends by granularity unit |
| SEL-06 | Direct-select marquee over anchor points | Selects anchors, not frames |

#### 4.1.7 Text threading, guides, pan/zoom

| ID | Test | Assertion |
|---|---|---|
| TH-01 | Click out-port → click target frame | Thread link created; single Operation |
| TH-02 | Click out-port → drag new frame | Frame created and threaded in one Operation |
| TH-03 | Out-port click → Esc | Loaded-cursor state cleared, no mutation |
| TH-04 | Threading cycle prevention (A→B→A) | Rejected with defined error |
| GD-01 | Drag guide from ruler | Guide created on release inside page; aborted if released over ruler |
| GD-02 | Drag existing guide back to ruler | Guide deleted (one Operation) |
| GD-03 | Guide drag with Esc | Original position restored |
| PZ-01 | Spacebar-pan during another tool | Pan is a non-mutating gesture; document hash unchanged; viewport transform updated |
| PZ-02 | Pinch zoom anchors at pointer position | Anchor point document-coordinates invariant under zoom |
| PZ-03 | Zoom limits (e.g. 5%–4000%) | Clamped; no renderer degenerate matrices |
| PZ-04 | Pan/zoom mid-gesture (scroll while dragging a frame) | Drag continues correctly in document space; screen-space delta re-derivation tested explicitly — **this is a classic bug source** |

### 4.2 L2 — WASM Boundary & Contract Tests

The tsify-generated types are the single source of truth for the Rust ↔ TypeScript contract. Test the boundary, not just the types. All cases run as Playwright tests against the harness page in Chrome — the real WASM artifact in the real engine.

| ID | Test | Assertion |
|---|---|---|
| WB-01 | Round-trip every gesture-related type (`InputSample`, `GestureBegin`, `GestureUpdate`, `SnapIndicator`, `Operation`, `HitResult`, …) | TS → WASM → TS structural equality via `page.evaluate()` on the harness page |
| WB-02 | Enum exhaustiveness | A TS compile-time test (`satisfies never` in default switch arms) fails the build if Rust adds a variant the shell doesn't handle |
| WB-03 | Contract snapshot | Generated `.d.ts` is committed; CI fails if codegen output drifts without a reviewed diff (prevents silent contract changes) |
| WB-04 | Numeric edge cases across boundary | NaN, ±Infinity, −0, MAX_SAFE_INTEGER timestamps: defined rejection or normalization, never undefined behavior |
| WB-05 | Throughput | 10,000 `GestureUpdate` calls across the boundary < 50 ms total (catches accidental serde-JSON fallbacks; should be near-zero-copy) |
| WB-06 | Error propagation | Rust `Err` surfaces as typed TS error, not a thrown opaque string |
| WB-07 | Memory stability | 1M update calls: WASM linear memory growth bounded (no per-call leak); assert via `memory.buffer.byteLength` plateau |

### 4.3 L3 — Shell Unit Tests (Playwright Component Tests)

Run with `@playwright/experimental-ct-react`: each component/controller mounts in isolation in real Chrome. Fake timers where needed via `page.clock` (Playwright's clock API) — e.g. for the live-drag delay.

#### Input normalization (`editor/src/input`)

| ID | Test | Assertion |
|---|---|---|
| IN-01 | PointerEvent → InputSample mapping | Buttons, coalesced events expanded (`getCoalescedEvents`), pressure, device type, `pointerId` |
| IN-02 | Multi-pointer discipline | Second pointer down during single-pointer gesture: per spec (ignored or converts to pinch); never starts a second gesture session |
| IN-03 | Pointer capture | `setPointerCapture` on gesture begin; release on commit/abort; capture-loss → abort path |
| IN-04 | Modifier tracking | Modifier state derived from events (incl. keydown/keyup of Shift/Alt/Meta *during* pointer drag — keyboard events must be fed into the active gesture) |
| IN-05 | Spacebar/arrow keys routed to active gesture, not panel shortcuts | When a gesture is active, gesture-relevant keys are consumed before the global shortcut registry; verified with Dockview focus in various panels |
| IN-06 | DPR / zoom conversion | clientX/Y → canvas px → document coordinates at devicePixelRatio 1, 1.5, 2, 3 |
| IN-07 | Wheel/trackpad pinch (ctrl+wheel) vs. scroll | Discriminated correctly; macOS gesture events handled |
| IN-08 | RTL/scrolled/transformed canvas container | Coordinate mapping correct when canvas isn't at viewport origin (Dockview pane moved/split) |
| IN-09 | Right-click / context menu during drag | Suppressed or aborts per spec; no stuck gesture |
| IN-10 | Tape recorder | Record → serialize → replay produces identical InputSample stream |

#### GestureController & UI feedback

| ID | Test | Assertion |
|---|---|---|
| GC-01 | Cursor changes per hit region (move/resize/rotate/pen states) | Correct CSS cursor or custom cursor sprite per region; restored on gesture end |
| GC-02 | Live-drag delay (pause-then-drag shows content) | Injected clock; before threshold ghost-box, after threshold live content flag |
| GC-03 | Snap indicator rendering props | SnapIndicator from core → overlay component renders correct line endpoints/labels |
| GC-04 | Selection chrome updates during gesture | Handles follow live transform each frame; no stale chrome after abort |
| GC-05 | Esc handling priority | Esc cancels gesture before closing dialogs/panels when gesture active |
| GC-06 | Tool switching mid-gesture blocked or aborts cleanly | Per spec; no orphaned sessions |
| GC-07 | Panel registry interaction | Opening/docking panels (Dockview) during idle doesn't steal pointer capture from canvas on next gesture |

### 4.4 L4 — Integration Tests (Tape Replay via Playwright Harness)

These run the **real compiled WASM module** with the real shell-side GestureController in Chrome via the harness page. Tapes are injected with `page.evaluate(replayTape, tape)`; assertions read back doc hashes, Operation logs, and scene digests. Rendering happens with real WebGPU, but most assertions here are state-level, not pixel-level.

**Fixture corpus:** `editor/tests/fixtures/tapes/*.json` + `editor/tests/fixtures/docs/*.idml-json`

| ID | Scenario | Assertion |
|---|---|---|
| IT-01 | Golden tape per gesture family (≈25 tapes) | Final doc hash equals committed golden hash; emitted Operation log equals golden |
| IT-02 | Abort tapes for every gesture family | Doc hash pre == post, byte-identical |
| IT-03 | Undo/redo round-trip | commit → undo → doc hash equals pre; redo → equals post; repeated ×100 stays stable |
| IT-04 | Gesture → Operation → backend persistence | Committed Operation POSTs to the backend (test instance, SQLite in temp dir); reload document → hash matches |
| IT-05 | Scripting-channel interleaving | Boa script mutates document via Operation channel *between* gestures: next gesture's hit-test sees fresh state; script attempting mutation *during* active gesture is queued or rejected per spec — assert it can never interleave inside a gesture transaction |
| IT-06 | Long-session soak | 2,000 gestures from randomized generator (seeded): no leaks (heap snapshots), doc hash matches re-replay |
| IT-07 | Real-world recorded sessions | 10+ tapes recorded from actual InDesign-experienced users performing layout tasks; replay must commit identically across releases (the highest-value regression net) |
| IT-08 | Concurrency guard | Simulated second gesture begin (e.g. touch + mouse race) rejected/serialized |

**Tape format requirements:** version field, document fixture reference, sample stream with timestamps, expected-operations digest, expected-doc-hash. CI fails with a readable diff of Operation payloads, not just "hash mismatch."

### 4.5 L5 — Visual Regression

Two tiers — prefer the cheap one:

1. **Scene-digest tests (fast, default).** After a replayed gesture's final frame, serialize the Vello scene graph (R3) and compare to golden digest. Catches geometry/chrome regressions without GPU variance.
2. **Pixel tests (small, curated).** Playwright `expect(page).toHaveScreenshot()` on Chrome with `--enable-unsafe-webgpu --enable-features=Vulkan` on a pinned GPU/driver CI image. `maxDiffPixelRatio: 0.001`, `threshold: 0.1` for anti-aliasing tolerance.

| ID | Case |
|---|---|
| VR-01 | Selection chrome at zoom 25/100/400% (handle size constancy) |
| VR-02 | Ghost frame vs. live-drag preview appearance |
| VR-03 | Smart Guide indicator styles (edge, center, equal-spacing with measurement labels) |
| VR-04 | Rotation cursor + angle HUD at 0°/45°/arbitrary |
| VR-05 | Gridify preview at 1×1, 3×2, 5×5 |
| VR-06 | Pen path in-progress rendering (rubber-band segment, handle lines) |
| VR-07 | Marquee rectangle style |
| VR-08 | Text threading port states (empty, loaded cursor, overset) |
| VR-09 | Guides during drag (position label tooltip) |
| VR-10 | HiDPI (DPR 2) crispness of 1-px chrome lines |

Goldens stored for the single pinned Chrome/Linux CI configuration; update only via explicit `--update-snapshots` PR flow with reviewer-visible before/after.

### 4.6 L6 — End-to-End (Playwright)

*Status note (2026-10-02): this section predates the implementation. `apps/canvas/tests/e2e/gesture-plan-deferred.spec.ts` records the state of the twelve scenarios: E2E-05 and E2E-12 are `test.fixme` stubs, the other ten have specs in the `gesture-*.spec.ts` files. E2E-09 is written as a pane floated over the canvas (`gesture-cross-cutting.spec.ts`), because the cockpit has no popped-out canvas pane. E2E-12 has no backend to run against; see [ADR 211](../adr/211-no-backend.md).*

Real browser, real WebGPU, real pointer events via CDP `Input.dispatchMouseEvent` / `dispatchTouchEvent` and Playwright's `mouse`/`keyboard` APIs.

One scenario per gesture family, plus the nasty cross-cutting ones:

| ID | Scenario |
|---|---|
| E2E-01 | Create rect → move with Shift → resize with Alt → rotate with Shift-snap → undo ×4 → redo ×4 |
| E2E-02 | Draw with gridify (arrow keys mid-drag) → verify N frames in layers panel |
| E2E-03 | Pen tool: 5-point path with one Alt-broken handle → close path |
| E2E-04 | Marquee select 3 of 5 frames → group-drag with smart-guide snap to 4th |
| E2E-05 | Thread two text frames; verify reflow indicator |
| E2E-06 | Drag guide from ruler; snap a frame to it; drag guide back to ruler |
| E2E-07 | Esc-cancel each gesture family; assert no document change via UI state |
| E2E-08 | Spacebar pan + ctrl-wheel zoom *during* an active move gesture |
| E2E-09 | Dockview layout torture: float the canvas panel, split it, then perform E2E-01 inside the floated pane (coordinate mapping under transformed containers) |
| E2E-10 | Browser zoom 80%/125% + DPR variation |
| E2E-11 | Pointer capture loss: alt-tab (window blur) mid-drag → gesture aborted, no stuck state |
| E2E-12 | Reload after commits → backend round-trip → document identical |

Browser matrix: **Chrome with WebGPU only** for now — it is the sole supported target and must work perfectly. Firefox/Safari are explicitly deferred (see §8.2); no CI time is spent on them.

---

## 5. Cross-Cutting Invariants (tested at every applicable layer)

*Status note (2026-10-02): this section predates the implementation; see [ADR 214](../adr/214-operation-sandwich.md) for the invariant every operation suite asserts (model, pixels, byte-identical undo).*

These are the non-negotiables. Each is encoded as a reusable assertion helper used across L1/L4/L6.

| Invariant | Statement |
|---|---|
| **INV-1 Atomicity** | A gesture session emits exactly 0 (abort) or 1 (commit) Operations. Never partial mutations. |
| **INV-2 Rollback** | After abort, `hash(doc) == hash(doc_at_begin)` — byte-identical, including selection state if selection is part of the document model. |
| **INV-3 Replay determinism** | `replay(tape, doc) == replay(tape, doc)` across runs, platforms, and (for committed goldens) releases. |
| **INV-4 Undo symmetry** | `undo(commit(g))` restores pre-gesture doc hash; `redo` restores post-gesture hash. |
| **INV-5 Continuous modifiers** | Constraint resolution is a pure function of (gesture-begin state, current sample, current modifiers) — never of modifier history. This makes Shift-press-then-release mid-drag trivially correct. |
| **INV-6 Screen-space chrome** | Handle sizes, snap thresholds, slop thresholds are constant in screen px across zoom/DPR. |
| **INV-7 No cross-channel interleave** | Operations from the scripting channel cannot apply inside an open gesture transaction. |
| **INV-8 Liveness** | Every begin eventually reaches commit or abort; pointercancel, blur, capture loss, tool switch, and document close all map to abort. No code path leaves the state machine in Dragging. |

---

## 6. Gesture Inventory × Test Coverage Matrix

The full gesture inventory with the dimensions each must be tested against. ✓ = dedicated tests required; numbers refer to section IDs above.

| Gesture | Constraints (Shift/Alt/Cmd) | Mid-gesture keys | Snapping | Esc/abort | Undo | Visual | E2E |
|---|---|---|---|---|---|---|---|
| Move/drag frame | ✓ TR-01 | live-drag delay GC-02 | ✓ SNAP-* | ✓ | ✓ | VR-02/03 | E2E-01 |
| Duplicate-drag (Alt) | ✓ axis w/ Shift | Alt evaluated at **release** vs. begin — assert spec | ✓ | ✓ (clone discarded) | ✓ | — | E2E-01 var |
| Resize (8 handles) | ✓ TR-02/03/04 | — | equal-dim SNAP-04 | ✓ | ✓ | VR-01 | E2E-01 |
| Rotate | ✓ TR-05 | — | angle snap | ✓ | ✓ | VR-04 | E2E-01 |
| Shear | TR-07 | — | — | ✓ | ✓ | — | smoke |
| Content scale (direct select) | ✓ | — | — | ✓ | ✓ | — | smoke |
| Shape/frame creation | ✓ DR-02/03 | space DR-04, arrows DR-05/06/07 | grid/guides | ✓ | ✓ | VR-05 | E2E-02 |
| Pen tool | Alt DR-09 | Esc DR-11 | anchor snap | ✓ | ✓ per-path | VR-06 | E2E-03 |
| Direct path edit | ✓ handle symmetry | — | ✓ | ✓ | ✓ | VR-06 | smoke |
| Marquee select | Shift add SEL-03 | — | — | ✓ | n/a* | VR-07 | E2E-04 |
| Click-through drill | Cmd HT-05 | — | — | n/a | n/a | — | smoke |
| Text drag select | granularity SEL-05 | — | — | ✓ | n/a* | — | smoke |
| Drag-and-drop text | — | Esc returns text | — | ✓ | ✓ | — | smoke |
| Text threading | — | Esc TH-03 | — | ✓ | ✓ | VR-08 | E2E-05 |
| Guide drag | — | Esc GD-03 | snaps to ruler ticks? per spec | ✓ | ✓ | VR-09 | E2E-06 |
| Pan (space/hand) | — | — | — | n/a (non-mutating) | n/a | — | E2E-08 |
| Zoom drag / pinch | — | — | — | n/a | n/a | VR-10 | E2E-08/10 |

\* If selection is non-undoable (InDesign behavior), assert that explicitly — tests should fail if someone accidentally makes selection emit Operations.

---

## 7. Performance & Latency Testing

### 7.1 Budgets (asserted in CI on pinned hardware)

| Metric | Budget | Measured how |
|---|---|---|
| Hit-test, 1,000-object page | < 0.2 ms p99 | criterion bench (L1) |
| Snap resolution, 5,000 candidates | < 0.5 ms p99 | criterion bench (L1) |
| GestureUpdate boundary call | < 5 µs mean | WB-05 |
| Input → committed scene update (main thread) | < 8 ms p95 | Playwright trace, E2E perf suite |
| Sustained drag frame rate, 500-object doc | ≥ 58 fps over 5 s scripted drag | Playwright + `requestAnimationFrame` probe |
| Sustained drag, 10,000-object stress doc | ≥ 30 fps, no >100 ms hitches | scheduled nightly |
| WASM heap during 10-min gesture soak | growth plateau, < +10 MB | IT-06 |
| Gesture begin latency (pointerdown → first chrome update) | < 16 ms p95 | E2E perf |

### 7.2 Method

- **criterion.rs** benchmarks in Rust core with regression detection (fail PR on >10% p99 regression vs. main).
- Playwright performance suite runs on a **dedicated, pinned CI runner** (fixed GPU, fixed driver, fixed display scaling) — perf numbers from shared runners are noise.
- Synthetic stress documents generated deterministically: 100 / 1k / 10k frames, deep groups (depth 12), 500 guides, long threaded stories.
- Record Chrome traces on failure and attach to CI artifacts.

---

## 8. Device & Platform Matrix

### 8.1 Input devices

| Device | Coverage | Notes |
|---|---|---|
| Mouse (3-button + wheel) | L6 automated | Primary path |
| Trackpad (macOS) | Manual checklist + recorded tapes | Pinch (ctrl+wheel emulation in CI), momentum scroll during gesture, force-click suppression |
| Pen/stylus (Wacom, Surface Pen — in Chrome) | Recorded tapes + manual checklist per release | Hover events, barrel button, pressure ignored unless spec'd, palm rejection relies on browser |
| Touch (single + multi) | Playwright touch dispatch + manual | Touch slop larger than mouse slop; pinch = zoom not resize unless on handle; assert per spec |

### 8.2 Browser/OS

Current support policy: **Chrome (stable) with WebGPU is the only supported browser and must work perfectly.** Everything else is out of scope until that bar is met.

| Tier | Targets | Cadence |
|---|---|---|
| Blocking CI | Chrome stable, Linux, real GPU runner (Vulkan); SwiftShader fallback lane for logic-only suites when the GPU runner is saturated | every PR |
| Scheduled | Chrome stable Win11 + macOS (Metal backend) — same browser, different WebGPU backends, since Dawn behavior differs across D3D12/Metal/Vulkan | nightly |
| Deferred | Firefox, Safari, Edge-specific quirks, mobile browsers | re-evaluate after Chrome target is solid |

Even within Chrome-only scope, two variance axes still need coverage: the **WebGPU backend per OS** (Vulkan/Metal/D3D12 via Dawn) and **Chrome version drift** — add a nightly lane on Chrome Beta so WebGPU-breaking changes surface weeks before they hit stable.

---

## 9. Fuzzing & Chaos

| ID | Approach |
|---|---|
| FZ-01 | **Sample-stream fuzzer:** seeded random walks of InputSamples (random begins, jitter, modifier flapping at up to 100 Hz, timestamp jitter incl. duplicates and regressions, pointercancel injection). Invariants INV-1/2/3/8 asserted continuously. Runs 15 min nightly, seed logged for repro; any panic minimized via `cargo-fuzz` + libFUZZER harness on the gesture crate. |
| FZ-02 | **Document fuzzer:** gestures replayed against mutated documents (degenerate frames, NaN-adjacent values rejected at import, 0-pt pages) — hit-test and snapping must never panic. |
| FZ-03 | **Channel chaos:** randomized interleaving of scripting-channel Operations, undo/redo, and gesture sessions; INV-7 asserted. |
| FZ-04 | **Event-order chaos in shell:** keyboard events delivered before/after pointer events in same frame; focus/blur storms; Dockview re-layout during hover. |

---

## 10. Tooling Summary

| Concern | Tool |
|---|---|
| Rust unit/property | cargo test, proptest, insta (snapshot), criterion (bench), cargo-fuzz |
| WASM boundary | Playwright + harness page (`page.evaluate`); tsify contract snapshot check in CI |
| Shell unit | Playwright component tests (`@playwright/experimental-ct-react`), `page.clock` for timer control |
| Integration | Playwright + harness page, real WASM artifact + tape fixtures; the backend spawned with temp SQLite via Playwright `webServer` config |
| Visual | Playwright `toHaveScreenshot`; scene-digest via R3 API |
| E2E | Playwright (TypeScript) on Chrome WebGPU; CDP raw input (`Input.dispatchMouseEvent`) where the high-level API is insufficient |
| Coverage | cargo-llvm-cov (Rust); v8 coverage collected through Playwright (`coverage.startJSCoverage`) for TS |
| CI | GitHub Actions: PR-blocking (L1–L4 + smoke L5/L6), nightly (full L5/L6, fuzz, perf, Chrome Beta lane, Win/macOS backend lanes), release gate (full suite + manual checklist sign-off) |

One runner for everything browser-side keeps fixtures, trace viewing, retries policy, and CI reporting uniform — a failing boundary test and a failing E2E test produce the same Playwright trace artifact.

---

## 11. CI Pipeline & Gating

*Status note (2026-10-02): this section predates the implementation; see [ADR 216](../adr/216-test-tiers.md) for the test tiers that run and where each one gates.*

**Per PR (blocking, target < 15 min wall clock):**
1. `cargo fmt` / `clippy -D warnings` / `cargo test` (L1) — parallel
2. WASM build → Playwright boundary suite (L2) on harness page
3. Playwright component tests (L3) + tape replay (L4), sharded across workers
4. Playwright smoke: E2E-01, E2E-07 on Chrome (SwiftShader lane acceptable for these)
5. Contract drift check (WB-03), criterion quick-bench regression gate

**Nightly:** full E2E + visual suite on the pinned GPU runner, 15-min fuzz, perf suite, soak IT-06, Chrome Beta lane, Win11/macOS backend lanes.

**Release gate:** everything green for 3 consecutive nightlies, manual device checklist (trackpad/pen/touch — all in Chrome) signed off, zero open INV-class bugs.

**Flake policy:** Playwright retries are allowed only in L5/L6 (`retries: 1`, and a retried pass is still reported); L2–L4 run with `retries: 0` — they must be fully deterministic by construction. Quarantine label auto-applied after 2 unexplained failures; quarantined tests must be fixed or deleted within 2 weeks.

---

## 12. Coverage Targets & Exit Criteria

| Area | Target |
|---|---|
| `crates/gesture`, `crates/snap`, `crates/transform` line coverage | ≥ 90% |
| Gesture state-machine transition coverage | 100% of defined transitions + all rejection paths |
| Gesture inventory (§6) | Every cell of the matrix has at least one passing test before the corresponding gesture ships behind-flag → GA |
| Golden tapes | ≥ 25 family tapes + ≥ 10 real-user session tapes, all green |
| Invariants INV-1…8 | Encoded as shared assertion helpers, referenced by ≥ 95% of L4 tests |

**Definition of Done for any new gesture:** spec'd modifier table, L1 state-machine + constraint tests, abort tape, golden commit tape, undo test, one visual case, matrix row in §6 updated, perf within budget on stress doc.

---

## 13. Risk Register (testing-specific)

| Risk | Mitigation in this plan |
|---|---|
| WebGPU CI flakiness / driver variance | Scene-digest tests as primary visual net (R3); pixel tests small, pinned runner |
| Coordinate precision bugs at high zoom / far coordinates | HT-10, TR-11, explicit coordinate envelope; f64 throughout document space |
| Modifier-mid-gesture regressions (the classic) | INV-5 purity rule + GSM-08 + fuzz FZ-01 modifier flapping |
| Dockview floating panes breaking coordinate mapping | IN-08, E2E-09 |
| tsify contract drift breaking shell silently | WB-02/03 build-time gates |
| Tape fixtures rotting as document format evolves | Versioned tape format + fixture migration script tested itself |
| Perf regressions landing unnoticed | criterion PR gate + pinned perf runner nightly |

---

## Appendix A — Tape File Schema (v1)

```json
{
  "version": 1,
  "name": "move_shift_axis_flip",
  "fixture": "docs/two-frames-a4.json",
  "viewport": { "zoom": 1.0, "pan": [0, 0], "dpr": 2 },
  "samples": [
    { "t": 0,    "type": "pointerdown", "pos": [120.5, 88.0], "buttons": 1, "mods": [], "device": "mouse", "pointerId": 1 },
    { "t": 16,   "type": "pointermove", "pos": [131.0, 89.0], "buttons": 1, "mods": ["shift"], "device": "mouse", "pointerId": 1 },
    { "t": 200,  "type": "keydown",     "key": "ArrowRight" },
    { "t": 480,  "type": "pointerup",   "pos": [240.0, 92.0], "buttons": 0, "mods": ["shift"], "device": "mouse", "pointerId": 1 }
  ],
  "expect": {
    "operations_digest": "blake3:…",
    "doc_hash_after": "blake3:…",
    "committed": true
  }
}
```

## Appendix B — Manual Release Checklist (excerpt)

All items performed in Chrome:

- [ ] Trackpad (macOS, Chrome): pinch zoom anchors under cursor; momentum scroll during move-drag doesn't jitter document
- [ ] Pen (Wacom/Windows, Chrome): hover shows correct cursors; barrel button doesn't trigger context menu mid-stroke
- [ ] Touch (Chrome on touch-capable device): long-press behavior over canvas; two-finger pan vs. one-finger drag disambiguation
- [ ] Dockview float window: pointer capture and coordinate mapping intact
- [ ] 4K @ 150% Windows scaling: 1-px chrome crisp, handle hit areas comfortable
- [ ] WebGPU backend spot-check: same golden scene renders identically on Vulkan (Linux), Metal (macOS), D3D12 (Windows)
- [ ] Esc during every gesture family with devtools throttled CPU 6×: no stuck states