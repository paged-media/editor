# Paged — Concept 1: The Toolbar

June 2026. Concept paper. Sections describe intent; where the implementation differs, `../status.md` and the ADRs in `../adr/` are authoritative.

Sections not relevant outside the original planning context have been removed; numbering is unchanged. Source comments in this repository cite this paper as "Concept 1", with its decision ids (T1–T9) and acceptance-criteria numbers.

> **Status note 2026-06-07 — "dockview substrate" → "cockpit".** Where this doc
> says the tool rail lives in shell chrome *outside the dockview substrate*, the
> substrate is now the **Cockpit** (Dockview removed; see
> [ADR 002](../adr/002-cockpit-over-dockview.md)). The point is unchanged and in fact
> sharper: the rail is fixed chrome, not a Cockpit panel slot — it never floats,
> tabs, or pops out (the Cockpit has no floating panels at all). Read "dockview
> substrate" as "the Cockpit's panel region" throughout.

---

## Scope

This concept covers the left tool rail (the InDesign "Toolbox") and the chrome that travels with it: the tool set as registry contributions, the flyout/grouping model, the keyboard and modifier system, the fill/stroke/apply cluster at the foot of the rail, the screen-mode selector, and the relationship between a tool and the gesture handler it mounts on the canvas overlay.

In scope:

- The `ToolRegistry` as the fifth registry / Contribution-API arm, and the `ToolContribution` shape.
- The `activeTool` model, including the transient-override stack that spring-loading needs.
- The `GestureHandler` contract a tool carries, and its lifecycle against the gesture spine.
- The flyout-group derivation, default-tool semantics, and tool-options surface.
- The keyboard layer: single-key shortcuts, text-context suppression, modifier-driven temporary tools, double-click semantics, Tab/Escape.
- The cursor system (`CursorSpec`, state-dependent cursors).
- The fill/stroke/apply composition and the screen-mode selector, and why they make the toolbar a hybrid rather than a pure expert leaf.
- Where the rail lives relative to the dockview substrate (chrome, not a dock panel).

Out of scope:

- The gesture pipeline internals — this concept defines the *contract* a tool's handler implements and the *activation* path, not the pointer-routing or overlay-rendering machinery.
- The individual geometry/text Operations each handler emits — those are catalogued in [panel-catalog.md](panel-catalog.md) §7 and are renderer-side work.
- The Control / Properties contextual bars (`paged.control`, `paged.properties`) — separate compositions, Tier 6.

## Position in the architecture

*Status note (2026-10-02): this section predates the implementation; see [ADR 002](../adr/002-cockpit-over-dockview.md) (there is no `DockingSubstrate`; the rail is `packages/shell/src/chrome/ToolRail.tsx`, chrome beside the cockpit's panel region).*

The toolbar sits in the **shell chrome**, not inside the dockview substrate. This is the first non-obvious placement decision. A dock panel is something the user can move, float, tab, and pop out; the tool rail is none of those things in any DTP tool — it is fixed chrome anchored to an edge, like the application header. The catalog's `Surface: bar` is exactly this distinction (`bar` ≠ `dock`). So the rail is rendered by the shell directly, outside the `DockingSubstrate`, in the same layer as the header and the future Control strip.

That placement has a consequence worth stating: the toolbar does **not** import `dockview-react`, does not participate in layout serialization, and is not subject to the panel-bridge path. It reads the `ToolRegistry` and the `activeTool` observable, and it writes `activeTool`. It is chrome that observes registry data — structurally closer to the header's file-picker than to the Pages panel.

```
┌──────────────────────────────────────────────────────────┐
│  Shell chrome (header, tool rail, future Control strip)    │
│  ┌──────┐  ┌─────────────────────────────────────────┐    │
│  │ Tool │  │  DockingSubstrate (dockview)            │    │
│  │ rail │  │   canvas (center) · pages · outline …   │    │
│  │ +F/S │  │                                          │    │
│  └──────┘  └─────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
        │                         ▲
   writes activeTool        the gesture spine reads
        ▼                    activeTool and mounts the handler
   ToolRegistry  ───────────────────────────────────────────►
```

## Where it sits in the catalog

The catalog ([panel-catalog.md](panel-catalog.md)) classifies `paged.tools` as an **expert-leaf bar on the left rail**, reading and writing the `activeTool` observable, with the full tool list enumerated (§6, Tier 6, Phase 5). So the open question is not *whether* it exists or *what* it contains — the catalog already answers that. The concept work is **how it is built so it stays consistent with the registry → bridge → substrate discipline**, and the recognition that the catalog's single `E` tag understates the rail's true shape (see "the bottom cluster" below).

## The load-bearing decision: a tool is a contribution, not a string

*Status note (2026-10-02): this section predates the implementation; see [ADR 208](../adr/208-tools-are-data-plus-gesture-handler.md). In `packages/shell/src/registries/tool.ts` as built, `group` is a free-form string naming one rail slot, a separate `section` field carries the four clusters, `gesture` is optional, and a `status: "planned"` marker exists for tools that are not implemented.*

`activeTool: Observable<ToolId>` is enough to *track* the active tool, but not to *define* the tool set. A tool carries an icon, a label, a keyboard shortcut, a flyout group, a cursor, modifier behaviour, optional tool-level options, an enablement predicate, and — critically — **the gesture handler it mounts on the canvas overlay when active**. That bundle is a registry entry, exactly like a panel or a command.

This is a **fifth registry** (or a fifth arm of the Contribution API) alongside Panel / Command / SemanticGroup / Keybinding:

```typescript
// packages/shell/src/registries/tool.ts

export interface ToolContribution {
  /** Stable id. Format "<namespace>.<tool>", e.g. "paged.tool.pen". */
  id: ToolId;
  /** Rail label and tooltip. */
  title: string;
  /** Icon for the rail slot. */
  icon: string;
  /** Single-key shortcut, e.g. "v", "a", "p". Claimed via KeybindingRegistry. */
  shortcut?: string;
  /** Flyout group. Tools sharing a group occupy one rail slot with a fly-out. */
  group: ToolGroupId;
  /** Ordering within the group's fly-out. */
  order?: number;
  /** Marks the group's default tool (the one shown when the slot is at rest). */
  isGroupDefault?: boolean;
  /** Cursor while active. May be a function of handler state (see CursorSpec). */
  cursor?: CursorSpec;
  /** The gesture handler factory the spine mounts on activation. */
  gesture: () => GestureHandler;
  /** Optional tool-level options (e.g. Polygon sides), shown in a popover. */
  options?: ToolOptionsSpec;
  /** Optional enablement predicate against application state. */
  when?: VisibilityPredicate;
}

export type ToolGroupId =
  | "selection" | "drawType" | "transform" | "modNav";

export interface ToolRegistry {
  register(contribution: ToolContribution): Disposable;
  unregister(id: ToolId): void;
  get(id: ToolId): ToolContribution | undefined;
  list(): ToolContribution[];
  /** Group → ordered members, derived; the rail renders from this. */
  groups(): Map<ToolGroupId, ToolContribution[]>;
  onChange(handler: (e: ToolRegistryEvent) => void): Disposable;
}
```

The same three-part split the shell already uses for panels reappears one layer up:

| Panels | Tools |
| ------ | ----- |
| `PanelRegistry` (data) | `ToolRegistry` (data) |
| `PanelBridge` (glue) | `Toolbar` chrome (the view that renders the registry) |
| `DockingSubstrate` (consumer) | **gesture spine** (mounts the active tool's handler) |

`activeTool` is the wire between view and consumer: the rail writes it on click or shortcut; the gesture spine subscribes and swaps the mounted handler. The toolbar reads `ToolRegistry.groups()` to lay out slots and reads/writes `activeTool` for the active state. The *tools* are separate contributions, supplied by a core bundle (`@paged-media/tools`), never hardcoded into the rail. This matters for the same reason panels-as-data matters: a third-party bundle can contribute a tool (a custom measure tool, a barcode placer) through the identical path the built-ins use.

## The GestureHandler contract

*Status note (2026-10-02): this section predates the implementation; see [ADR 208](../adr/208-tools-are-data-plus-gesture-handler.md). The spine is built (`packages/shell/src/tools/gesture-spine.ts`, mounted by `apps/canvas/src/ui/useGestureSpine.ts`), and `onDeactivate` takes the reason (`"switch"` or `"suspend"`) that the next section asks for.*

A tool's gesture handler is the object the gesture spine mounts on the overlay when the tool becomes active. The toolbar concept does not implement the spine, but it must pin the *contract*, because `ToolContribution.gesture` returns one and because the handler is what makes a tool more than an icon.

```typescript
// packages/shell/src/tools/gesture-handler.ts  (contract only; the spine is implemented separately)

export interface GestureHandler {
  /** Called when the tool becomes active. Receives the editor handle. */
  onActivate(paged: PagedEditor): void;
  /** Called when another tool takes over (commit/cancel any in-flight gesture). */
  onDeactivate(): void;

  /** Pointer lifecycle on the canvas overlay, in document (pt) coordinates. */
  onPointerDown(e: CanvasPointerEvent): void;
  onPointerMove(e: CanvasPointerEvent): void;
  onPointerUp(e: CanvasPointerEvent): void;

  /** Keyboard while the tool is active (e.g. Enter to commit a pen path). */
  onKey?(e: KeyboardEvent): void;

  /** State-dependent cursor (Pen near an anchor differs from Pen on empty canvas). */
  cursorAt?(e: CanvasPointerEvent): CursorSpec | undefined;

  /** What the tool draws on the overlay during a gesture (rubber-band, handles). */
  renderOverlay?(ctx: OverlayContext): void;
}
```

The discipline from the catalog holds: a handler **mutates only through `paged.mutate(Operation::…)`** (or the gesture-spine's atomic `SetFrameBounds` for drag), never by reaching into the model. A drag with the Selection tool emits one `SetFrameBounds` on pointer-up (with live preview on the overlay during the drag); the Pen tool emits `AddAnchor`/`ConvertAnchor` as the path is built; the Rectangle tool emits a create-frame Operation on pointer-up. Imperative *rendering* of the in-progress gesture; declarative *contract* for the committed mutation. This is invariant 9 of [client-sdk.md](client-sdk.md) §9, applied to tools.

The lifecycle ordering matters for correctness: switching tools must `onDeactivate()` the outgoing handler (committing or cancelling any in-flight gesture) before `onActivate()` on the incoming one. Spring-loading (below) makes this ordering load-bearing.

## The activeTool model: a stack, not a scalar

Spring-loaded tools — hold `Space` for a momentary Hand, hold `Cmd` for a momentary Direct-Selection, hold the tool key to peek another tool — mean `activeTool` cannot be a single value. Model it as a base selection plus a transient-override stack:

```typescript
interface ActiveToolState {
  base: ToolId;                 // set by click or sticky keypress
  overrides: ToolId[];          // pushed by spring-load, popped on key-up
}
// The "effective" tool is overrides.at(-1) ?? base.
```

- A **click** or a **sticky single-key press** sets `base`.
- A **held modifier/key** pushes an override; releasing it pops. Nested holds (Space over a Pen peek) are why it's a stack, not a single override slot.
- The gesture spine reads only the *effective* tool, deactivating the previous effective handler and activating the new one on each change. Because spring-load is frequent and cheap, the effective-tool derivation must be allocation-free and the activate/deactivate path must be idempotent for the same id.

This is the cleanest place to absorb a subtlety: the override should not fire `base`'s deactivation in a way that cancels an in-flight gesture the user expects to resume. A momentary Hand pan during a Pen path must not discard the path. So `onDeactivate()` distinguishes *suspend* (spring-load, resumable) from *commit/cancel* (real tool switch). Encode that as a parameter on deactivation rather than discovering it later.

## Flyout groups (the little triangle)

*Status note (2026-10-02): this section predates the implementation; see [ADR 208](../adr/208-tools-are-data-plus-gesture-handler.md) and [ADR 207](../adr/207-honest-seams.md). `packages/tools/src/built-in-tools.ts` registers 28 tools, five of them (Gap, Content Collector, Content Placer, Free Transform, Note) as inert `planned` entries; it does not register Type-on-Path, the three anchor tools, Erase or Measure.*

The rail's four clusters are visual section breaks, not the flyout model. The actual flyouts are the hidden-tool stacks:

- **Selection group:** Selection, Direct Selection, Page, Gap, Content Collector/Placer.
- **Drawing & Type group:** Type / Type-on-Path; Line; Pen / Add-Anchor / Delete-Anchor / Convert-Direction-Point; Pencil / Smooth / Erase; Rectangle-Frame / Ellipse-Frame / Polygon-Frame; Rectangle / Ellipse / Polygon.
- **Transformation group:** Scissors; Free Transform / Rotate / Scale / Shear; Gradient Swatch; Gradient Feather.
- **Modification & Navigation group:** Note; Eyedropper / Measure; Hand; Zoom.

Each rail slot shows the **last-used tool of its group** (`isGroupDefault` seeds the initial choice). Click-hold / long-press / right-click reveals the stack; selecting a hidden tool promotes it to the slot's visible face. The rail derives slots purely from `ToolRegistry.groups()` plus a small per-slot "last used" memory persisted alongside the layout. Tearing off a flyout into a floating mini-toolbar is a v2 nicety; the data model already permits it because a flyout is just a group projection.

## Tool options and double-click

Several tools carry options: Polygon (number of sides, star inset), Pencil/Smooth (fidelity), Eraser (width), Gap, Free Transform constraints, Eyedropper (which attributes to pick up). Model `ToolContribution.options` as a small composition spec rendered in a popover anchored to the rail slot — pure composition, single-property writes against tool-scoped settings (`documentMeta`/app-state, not the document). Double-click on a tool opens its options popover; if it has none, double-click is a no-op (or opens app preferences for that tool family later).

## The keyboard layer

*Status note (2026-10-02): this section predates the implementation; see [ADR 209](../adr/209-command-is-the-action-primitive.md) and `packages/shell/src/state/commands/tool-commands.ts`. Cycling within a group is built as Alt+click on the rail slot (`packages/shell/src/chrome/ToolRail.tsx`), not as a repeated `Shift`+shortcut.*

Tool shortcuts are single-key (`V`, `A`, `T`, `P`, `M`, `L`, `N`, `\`, `C`, `E`, `R`, `S`, `O`, `G`, `I`, `K`, `H`, `Z`, plus `Shift`-modified variants) and route through the `KeybindingRegistry` — which the original shell spec deferred, and this is one of its first real consumers. Four constraints, each non-obvious:

- **Text-context suppression.** Single-key tool shortcuts must be inert while a text caret is active, or typing "v" in a story switches to the Selection tool. The `when` predicate is `contentSelection == null`. This is the natural first real use of `when` on a keybinding, and it must cover *all* single-key tool shortcuts as a class, not tool by tool.
- **Modifier-driven temporary tools.** `Cmd` → momentary Direct-Selection (or last selection tool); `Space` → momentary Hand; `Cmd`+`Space` → momentary Zoom-in, add `Alt` for Zoom-out. These push onto the override stack and are gesture-spine-owned, not registry entries.
- **Tool-specific gesture modifiers.** `Shift` constrains (proportional scale, 45° line, square/circle); `Alt`/`Opt` draws from centre or duplicates; `Space` mid-draw repositions a frame being drawn. These are read by the *active handler*, not the rail — they belong in `GestureHandler`, not `ToolContribution`.
- **Cycle within a group.** Repeated `Shift`+shortcut cycles through a group's hidden tools (InDesign behaviour). The registry's group ordering drives the cycle.

Plus the global chrome keys that live with the toolbar: `Tab` hides all panels (and the rail), `Shift`+`Tab` hides panels but keeps the rail, `Escape` cancels an in-flight gesture (delegated to the active handler), `X` swaps fill/stroke, `D` resets fill/stroke to default, `W` toggles Preview screen mode (also text-suppressed).

## The cursor system

Cursors are not decoration in a DTP tool — they carry state. The Pen shows distinct cursors over empty canvas (new path), over a path segment (add anchor), over an endpoint (close path), over an anchor (delete/convert). Model `CursorSpec` as either a CSS cursor token, a custom image with an explicit hotspot, or a *function of handler state* (`GestureHandler.cursorAt`). The rail sets the base cursor on activation; the active handler overrides per-pointer-position. Keep the custom-cursor set small and SVG-based so it scales with device pixel ratio.

## The bottom cluster is *not* tools — the toolbar is a hybrid

The foot of the toolbox — fill/stroke swatch wells, swap (`X`) and default (`D`), the `[colour]`/`[gradient]`/`[None]` apply buttons, the formatting-affects-container-vs-text toggle (`J`), and the screen-mode selector (`W`) — is mostly **not** `activeTool` state:

- **Fill / stroke wells.** Applying colour is a `selectionProperty` write (`frameFillColor` / `frameStrokeColor`) — [panel-catalog.md](panel-catalog.md) §5.3. With nothing selected, it writes the **document default** for new objects, a `documentMeta`-style write. So the wells read the current selection's fill/stroke (or the document default) and write through the *same path the Swatches panel uses* — they are a view onto the colour model of Concept 2 (colours and swatches; like Concept 3, PDF export, a companion paper that is not in this repository), not bespoke leaf code. The well also opens the colour mixer (`paged.color`) on double-click and accepts drops from the Swatches grid.
- **Swap / default.** `X` swaps the two `selectionProperty` values; `D` sets the default pair (black stroke, no fill). Both are tiny composition actions or commands.
- **Apply buttons.** `[colour]` applies the last solid colour, `[gradient]` the last gradient, `[None]` clears — three quick `selectionProperty` writes targeting whichever of fill/stroke is active.
- **Formatting-affects toggle.** Application state: does a colour click target the container frame or the text inside it.
- **Screen mode.** View state (see next section).

So the honest disposition is **hybrid**: an expert-leaf tool rail on top, a small composition cluster (fill/stroke/apply, bound to `selectionProperty` + document default) at the foot. The catalog's single `E` tag for `paged.tools` is a simplification worth correcting in the next catalog revision — the fill/stroke wells must reuse **Concept 2's** colour model and the §5.3 apply path, not reimplement colour as bespoke leaf code.

## Screen modes

The screen-mode selector cycles Normal / Preview / Bleed / Slug / Presentation. Each is **view state on the overlay layer**, not a document mutation:

- **Normal** — frame edges, guides, grids, hidden characters, frame-fitting indicators visible.
- **Preview** — non-printing items hidden, pasteboard masked, page shown on neutral background.
- **Bleed** — Preview plus the bleed area revealed.
- **Slug** — Preview plus the slug area revealed.
- **Presentation** — full-screen, dark surround, no chrome, click/arrows to advance (a quick review mode).

This is the same category as `paged.separations-preview`'s view-only writes: the tool's `.bindings.ts` would declare `writes: []` against the document. Screen mode lives in app/view state and feeds the overlay renderer. `W` toggles Normal↔Preview and is text-suppressed like the tool shortcuts.

## Tool → handler / Operation map (the gesture-spine work this implies)

| Tool | Shortcut | Effective write |
| ---- | -------- | --------------- |
| Selection | V | `selection` (hit-test); drag → `SetFrameBounds` (spine) |
| Direct Selection | A | `selection` (path/anchor); drag → anchor geometry Operations |
| Page | Shift+P | page geometry Operations |
| Gap | U | inter-object gap geometry (spine) |
| Content Collector / Placer | B | conveyor buffer (far-future, Tier 8) |
| Type / Type-on-Path | T / Shift+T | `contentSelection` + text mutations |
| Line | \\ | create-line geometry |
| Pen + Add/Delete/Convert Anchor | P / = / - / Shift+C | `AddAnchor`, `DeleteAnchor`, `ConvertAnchor` (§7) |
| Pencil / Smooth / Erase | N | freehand path + `SmoothPath` |
| Rectangle/Ellipse/Polygon Frame | F | create-frame geometry |
| Rectangle/Ellipse/Polygon (shape) | M / L | create-shape geometry |
| Scissors | C | `OpenPath` / path split |
| Free Transform / Rotate / Scale / Shear | E / R / S / O | `SetFrameBounds`, `FrameRotation`, `FrameScaleX/Y`, `FrameShear` (spine) |
| Gradient Swatch / Gradient Feather | G / Shift+G | `FrameGradient` / `FrameGradientFeather` drag (spine) |
| Note | — | annotation (later) |
| Eyedropper / Measure | I / K | copy attributes / read-only measure |
| Hand | H | `camera` (pan) — view state |
| Zoom | Z | `camera` (zoom) — view state |

The geometry Operations are catalogued in [panel-catalog.md](panel-catalog.md) §7 (`AddAnchor`, `ConvertShape`, `PathfinderOp`, …). The toolbar concept's contribution is recognising that **each tool's gesture handler is the producer of those Operations** — which is why `ToolContribution` carries the `gesture` factory and why the concept cannot be *finished* before the gesture spine lands, only *started* (rail + `activeTool` + the fill/stroke composition).

## What not to do

- **Don't put the tool rail inside the dockview substrate.** It is chrome, not a dock panel. Putting it in dockview makes it floatable/closable, which is wrong, and entangles it with layout serialization.
- **Don't model `activeTool` as a single `ToolId`.** Spring-loading needs the override stack from day one; retrofitting it after handlers assume a scalar is painful.
- **Don't let a `GestureHandler` reach into the model.** Mutations go through `paged.mutate` or the spine's atomic bounds write. A handler that writes the scene directly breaks invariant 9 and undo.
- **Don't hardcode the tool list in the rail.** Tools are registry contributions from `@paged-media/tools`; the rail renders whatever is registered.
- **Don't reimplement colour in the fill/stroke wells.** They are a view onto Concept 2's model and the §5.3 apply path. Build Concept 2 first.
- **Don't wire single-key tool shortcuts without the `contentSelection == null` guard.** The "typing v switches tool" bug is the canonical regression.
- **Don't treat screen mode as a document mutation.** It is view state; `writes: []`.
- **Don't build tear-off flyouts or the full tool-preferences UI in v1.** Group flyouts and per-tool options popovers are enough; tear-off is a v2 projection of the same data.

## Acceptance criteria

1. `ToolRegistry` exists as the fifth registry; `@paged-media/tools` registers every tool in the tool map above as a contribution; the rail contains zero hardcoded tool entries.
2. The rail renders grouped slots from `ToolRegistry.groups()`; flyouts reveal hidden tools; selecting one promotes it to the slot face.
3. Clicking a tool, or pressing its single-key shortcut, sets the effective tool and the rail reflects it.
4. Single-key tool shortcuts are inert while a text caret is active.
5. Holding `Space` gives a momentary Hand that reverts on release without cancelling an in-flight gesture; the same holds for `Cmd` → Direct-Selection.
6. Switching tools deactivates the outgoing handler (committing or cancelling its gesture) before activating the incoming one.
7. The fill/stroke wells read and write `frameFillColor`/`frameStrokeColor` through the same path as the Swatches panel, and write the document default when nothing is selected; `X` swaps and `D` resets.
8. The screen-mode selector changes overlay rendering only and writes nothing to the document; `W` toggles Preview and is text-suppressed.
9. The tool rail lives in shell chrome and is the *only* tool surface; it imports neither `dockview-react` nor `@/components/ui/*` directly (it goes through `@paged-media/ui` like other chrome).
10. A third-party-style bundle can register a new tool through the same `ToolRegistry.register` call the built-ins use, and it appears in its declared group.

## Decision triggers

1. **Before building handlers, after the rail + shortcuts land.** Confirm the `activeTool` stack and the suspend-vs-commit deactivation distinction feel right against the first two real handlers (Selection drag, Pen). If the override stack feels heavy for two tools, it is the floor, not overengineering — spring-loading is pervasive.
2. **When Concept 2's colour model lands.** Wire the fill/stroke wells then, not before; revisit whether the well needs anything from the model the Swatches panel doesn't already surface.
3. **When the gesture spine stabilizes.** Reassess the `GestureHandler` contract against the messiest handler (the Pen, with its anchor/handle/close states and overlay rendering). The Pen is the stress test; if the contract survives the Pen, it survives the rest.

## Decisions register

*Status note (2026-10-02): this section predates the implementation; see [ADR 208](../adr/208-tools-are-data-plus-gesture-handler.md) for the tool registry, the active-tool stack and the handler contract as built, and [ADR 207](../adr/207-honest-seams.md) for tools that are registered but not implemented.*

| # | Decision | Status |
| - | -------- | ------ |
| T1 | Tools are registry contributions, not a hardcoded rail. Add a `ToolRegistry` (5th registry / Contribution-API arm). | Proposed |
| T2 | `activeTool` is a base + transient-override **stack**, with a suspend-vs-commit distinction on deactivation, so spring-loading is correct. | Proposed |
| T3 | The toolbar is a **hybrid**: expert-leaf rail + a fill/stroke/apply composition reusing Concept 2's colour model. Correct the catalog's `E` tag. | Proposed |
| T4 | The rail lives in **shell chrome**, outside the dockview substrate — not a dock panel. | Proposed |
| T5 | Tool single-key shortcuts route through `KeybindingRegistry` with a class-wide `contentSelection == null` guard. First real KeybindingRegistry consumer. | Proposed |
| T6 | `GestureHandler` is the contract a tool carries; handlers mutate only via `paged.mutate` / the spine's atomic bounds write (invariant 9). | Proposed |
| T7 | Screen-mode and formatting-affects toggles are view/application state, declared `writes: []`. | Proposed |
| T8 | Tear-off flyouts and full tool-preferences UI are v2; group flyouts + per-tool options popovers ship first. | Proposed |
| T9 | The toolbar cannot be finished before the gesture spine; ship rail + `activeTool` + shortcuts + fill/stroke first, handlers as the spine lands. | Proposed |

## How this fits with the other two

- The toolbar's **fill/stroke wells consume Concept 2's colour model directly** — the §5.3 apply path surfaced on the rail. So `paged-color` (Concept 2) must exist before the bottom cluster is built.
- **Suggested position in the build sequence: second.** Build `paged-color` first (Concept 2), then the toolbar (rail + `activeTool` + shortcuts can precede the spine; the bottom cluster follows Concept 2; handlers follow the gesture spine), then PDF export (Concept 3). Each concept stands on the previous one's spine rather than re-deriving it.
