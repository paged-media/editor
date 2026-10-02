# Paged SDK — Technical Concept

"SDK" here means the editor's client layer (`packages/client`, `packages/catalog`, `packages/shell`), not the plugin SDK and not the engine's viewer SDK.

May 2026. Concept paper. Sections describe intent; where the implementation differs, `../status.md` and the ADRs in `../adr/` are authoritative.

Sections not relevant outside the original planning context have been removed; numbering is unchanged. Source comments in this repository cite this paper as `sdk.md`.

---

## 3. Architectural position

*Status note (2026-10-02): this section predates the implementation; see [ADR 203](../adr/203-shell-is-a-registry-host.md) (the React adapter shipped as `@paged-media/shell`; there is no `@paged-media/react` package), [ADR 002](../adr/002-cockpit-over-dockview.md) (the dockview substrate was replaced by the cockpit layout) and [ADR 204](../adr/204-declarative-property-panels.md) (the catalog).*

The SDK sits between the renderer/scripting layer below and the contributed UI above. It is the middle of the four-layer architecture (renderer → scripting → shell → bundles), promoted from "shell internals" to a first-class, documented, framework-aware-but-not-framework-bound package set.

```
┌───────────────────────────────────────────────────────────┐
│  Producers:  hand-authored · declarative compositions ·    │
│              agentic (A2UI & others, via one adapter)      │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │  emit / reference catalog entries
                          ▼
┌───────────────────────────────────────────────────────────┐
│  Catalog  (finite, curated)                                │
│  entries = compositions (declarative) | leaves (primitive  │
│  @paged-media/ui widgets | expert code) — all with declared      │
│  binding points; all mutate only through the one door      │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│  Contributed UI (first-party now; bundles later)           │
│  Panels · menus · commands · tools — all declared as data  │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │  Contribution API  (register a manifest)
                          ▼
┌───────────────────────────────────────────────────────────┐
│  @paged-media/react   — React adapter                            │
│  Hooks · registries · dockview substrate · theming bridge  │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │  depends on (one direction only)
                          ▼
┌───────────────────────────────────────────────────────────┐
│  @paged-media/client  — framework-agnostic core (NO React)       │
│  CanvasClient · Operation channel · Gesture API · queries  │
│  ── the SAME surface the Boa script engine consumes ──     │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │  CanvasClient bridge — tsify'd contract
                          ▼
┌───────────────────────────────────────────────────────────┐
│  Rust renderer + worker (existing)                         │
│  Scene graph · four-tier pipeline · paged-mutate · gesture  │
└───────────────────────────────────────────────────────────┘
```

The single most consequential structural rule is the **package split between `@paged-media/client` and `@paged-media/react`**, addressed next.

---

## 4. The two-SDK split (the load-bearing decision)

*Status note (2026-10-02): this section predates the implementation; see [ADR 205](../adr/205-client-packaged-as-write-sdk.md) (the client package; its write door is `CanvasClient.mutate`), [ADR 203](../adr/203-shell-is-a-registry-host.md) (what §4.2 calls `@paged-media/react` is `@paged-media/shell`, which holds twelve registries, not four), [ADR 002](../adr/002-cockpit-over-dockview.md) (no docking substrate remains) and [ADR 206](../adr/206-package-layering-lint-zones.md) (the lint rule of §4.3).*

"The SDK touches React and talks to Rust" hides two SDKs with different stability and dependency requirements. Conflating them quietly breaks the scripting layer's one-door thesis. They must be separate packages with a one-directional dependency.

### 4.1 `@paged-media/client` — the framework-agnostic core

Contains everything that crosses the boundary to Rust or expresses document/canvas capability:

- The `CanvasClient` dispatch class (worker bridge, request/reply correlation).
- The **Operation channel**: construct and apply `Operation` / `Batch`; receive `AppliedOperation` (inverse + invalidation); subscribe to `mutationApplied` / `undoApplied` / `redoApplied`.
- The **Gesture API**: `begin` / `update` / `commit` / `cancel`, plus the gesture types from the canvas interaction design.
- **Read queries**: document tree, page/story metadata, structural resolution.
- **Selection + geometry queries**: visual selection, content selection, caret geometry, selection rects, and resolved-property reads for the current selection.
- **Application-state primitives** that are not view glue: the selection set, the active tool, the camera (via the SAB contract). These are state the canvas, the gesture spine, *and* the script engine all read.

**This package has no React dependency, on purpose.** It is the exact surface the Boa script engine consumes. Binding it to React would fork the document surface into "the script one" and "the React one," which is precisely the divergence this design exists to prevent. Keeping it framework-free is what lets one mutation surface serve the inspector, scripts, the UI, and eventually collaboration without parallel APIs.

### 4.2 `@paged-media/react` — the React adapter

Depends on `@paged-media/client`, never the reverse. Contains:

- The **hooks**: `useCanvasClient`, `useDocument`, `useCamera`, `useSelection`, `useContentSelection`, and the composite `usePaged`. These are thin adapters that subscribe to the core client and expose its state to the React tree with correct re-render isolation.
- The **four registries** as a React-mountable data layer: `PanelRegistry`, `CommandRegistry`, `SemanticGroupRegistry`, `KeybindingRegistry`.
- The **state contexts** (five focused providers, not one mega-context — re-render isolation matters: a selection change must not re-render every camera consumer).
- The **`DockingSubstrate`** wrapping dockview such that exactly one file in the entire codebase imports `dockview-react`.
- The **theming bridge** (one CSS-variable set themes both shadcn and dockview) and the `@paged-media/ui` design-system boundary (no contributed UI imports shadcn primitives directly).

### 4.3 The dependency rule, stated once

`@paged-media/react` → depends on → `@paged-media/client` → depends on → the tsify'd Rust contract. Never upward. A lint rule should enforce that `@paged-media/client` has no React import from day one; it is cheap now and a painful retrofit later.

---

## 5. The contribution model

*Status note (2026-10-02): this section predates the implementation; see [ADR 203](../adr/203-shell-is-a-registry-host.md) (the registries as built), [ADR 209](../adr/209-command-is-the-action-primitive.md) (commands), [ADR 208](../adr/208-tools-are-data-plus-gesture-handler.md) (tools, a registry this section does not list) and [ADR 002](../adr/002-cockpit-over-dockview.md) (panels are placed in cockpit mode slots, not dockview groups).*

A panel, command, menu item, or tool is **data**, registered against a registry. The registries are passive stores; bridges project their contents onto the imperative substrates (dockview for panels, the menu chrome for commands/menus, the tool layer for tools). The shapes are carried forward from the original editor architecture spec essentially unchanged — they are already the SDK's specification:

- **`PanelContribution`** — `id`, `title`, `component`, `defaultDock`, `defaultGroup` (semantic group name), `icon`, `when` (visibility predicate), `closable`, `movable`. The component receives a `paged` handle (the editor surface) and a `PanelApi` (lifecycle). It reads everything it needs from the handle; it is a thin renderer.
- **`CommandContribution`** — `id`, `title`, `category`, `icon`, `handler(paged, payload)`, `when` (enablement predicate). Every menu item and keybinding resolves to a command. Commands are the canonical action primitive.
- **`SemanticGroupRegistry`** — maps semantic placement names (`"structure"`, `"properties"`) to concrete dockview group IDs at runtime, so contributions never hardcode group IDs and survive the user dissolving a group.
- **`KeybindingContribution`** — `key`, `command`, `when`. Minimal now; the full registry can wait.

### 5.1 The one principled exception: the canvas panel

Everything in the registries is free-floating, declarative, and swappable — **except the WebGPU canvas**, which is bound to an `OffscreenCanvas`, a worker, and the camera SAB. It registers like any other panel but is non-closable, non-movable, and has no tab header. As *everything* becomes configurable the temptation is to make the canvas "just another panel" for symmetry. It must remain the single special case. A configurable shell that can accidentally unmount its own renderer is a regression, not a feature.

### 5.2 First-party as the rehearsal

First-party UI registers through the same path a bundle eventually will. There is no first-party shortcut. This is the rehearsal the original editor architecture spec describes — the shell's own panel registration is the dress rehearsal; the first external bundle is the real performance. Building it this way now costs only discipline and means the future third-party step is an *unlock*, not a rewrite.

---

## 6. The declarative component layer (catalog + bindings)

*Status note (2026-10-02): this section predates the implementation; see [ADR 204](../adr/204-declarative-property-panels.md) for the catalog, the binding kinds and the composition renderer as built. No adapter for A2UI or another external agent format (§6.4) exists in the repository. A plugin's declarative panel schema is mapped onto catalog compositions by `packages/shell/src/catalog/schema-panel-renderer.tsx`; see [ADR 312](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/312-panels-as-data.md).*

The contribution model in Section 5 makes *registration* declarative — a panel is data: id, title, placement, predicates. But its `component` field is an opaque React `ComponentType`; the registry declares *that* a panel exists and *where* it goes, while the panel's *interior* is imperative React code. The declarative component layer extends declarativeness to the second axis: a description of a panel's **interior** — its widgets, layout, and data bindings — as data, so the component becomes a tree of catalog references with bindings, rendered by the SDK, rather than a hand-written function.

This is a genuine, larger addition than registration-as-data, and it is worth building for two reasons that are already true of Paged rather than speculative:

- **The selection-property tier is a binding problem by nature.** Character, Paragraph, Stroke, Swatches, Effects, Object are sets of fields, each bound to a resolved property of the current selection, each writing back a `SetProperty`. A binding primitive for this tier is owed regardless (it is the same thing as the open question of snapshot-vs-live selection-property reads). The only choice is whether to make it *special* (a property-panel helper) or *general* (a component/binding model). Compatibility with external declarative-UI producers is what tips it to general.
- **The one-door invariant makes bindings sound.** A declarative binding that writes `leading = 14` is safe only because "write `leading`" means "construct a `SetProperty` Operation and call `apply`." That door already exists, so a binding is just a declarative spelling of an Operation. The hard part — a single mutation surface — is done.

So the declarative layer is not new risk piled on; it is the convergence of the binding primitive the property tier already needs with the Operation door already built.

### 6.1 The catalog is the bright line

The catalog is an explicit registry mapping stable string IDs → renderable components, each with declared props and binding points. It is simultaneously: what declarative panels reference, what an external agentic producer is allowed to emit, and what a future third-party bundle is constrained to. **One object, multiple consumers** — the same collapse the contribution registry uses for first-party-now / bundles-later. The catalog is the single auditable definition of "what UI is allowed to exist," which is exactly the trust boundary the deferred third-party work needs.

The catalog is **finite and curated, not extensible by the document**. The moment a declarative panel can define *new* component types inline, you have reinvented code execution and lost the security property. Custom components are added to the catalog deliberately, in code, reviewed — never emitted by an agent or a document.

### 6.2 Two kinds of catalog entry: compositions and leaves

Every catalog entry is one of two kinds, and the distinction is **purely how the leaf is implemented** — never how it is registered, referenced, bound, or how it touches the document:

- **Compositions** — declarative. A tree of references to other catalog entries, with bindings. This is what the property/structural panels are made of, and what an external producer emits. No code; pure data.
- **Leaves** — either a primitive `@paged-media/ui` widget (label, number field, color swatch, scrubbable input) or an **expert component**: hand-written React with custom geometry, canvas interaction, or a bespoke visualization the catalog vocabulary cannot express.

The critical property: an **expert component is a catalog leaf**, not an escape from the catalog. It declares its binding points — *what it reads, what Operations it writes* — exactly as a composition does. It renders its interior however it likes (custom canvas, WebGL, whatever), but its *relationship to the document* is still declared and still goes through `apply`. The expert component gets imperative **rendering**; it does not get imperative **mutation**. That asymmetry is the whole point: the author of a leaf writes code, the author of a composition writes data, but the *system* treats both as a catalog reference with declared props and bindings, and a producer (declarative layer or agent) can compose with either without knowing which kind it is.

### 6.3 The boundary: which kind is a given panel?

This must not be a per-panel taste decision, or "expert" drifts to become the default "to be safe." The boundary is objective and is the binding-shaped-vs-imperative-shaped line:

- **Binding-shaped → composition (declarative).** Fields bound to selection properties writing Operations: Character, Paragraph, Stroke, Swatches, Effects, Object/Transform, and the property bits of structural panels. These have no reason to be code; making them code reproduces the failure of a hundred near-identical hand-written property panels that should have been one binding model.
- **Imperative-shaped → expert leaf.** Custom geometry, canvas interaction, a gesture relationship, or a bespoke visualization the catalog cannot describe: the Tools panel, path-edit-mode chrome, a glyph/kerning visual editor, a 2D-gamut color picker.

The test when unsure: *can this panel's interior be expressed as catalog components bound to the selection-property surface?* If yes, it is a composition and making it expert is over-engineering. If no, it is an expert leaf. And crucially — **a panel that fails the declarative test is first a finding about the catalog, not a license to go imperative.** Maybe three panels want a `scrubbable-numeric` or `color-swatch-grid` the catalog lacks; add it to the catalog once, reviewed, before declaring any panel expert. Only genuinely bespoke interiors become expert leaves. This keeps the imperative set *small* — the same discipline as the canvas being *the one* special panel (Section 5.1). Expert components should be the *few* genuinely-bespoke panels, not the default.

### 6.4 The internal model is yours; external formats are adapters

The catalog + composition + binding model is **Paged's own**, designed against Paged's panels. It is *not* any external producer's format. Compatibility with A2UI and others is achieved by an **adapter** that translates external descriptions in and Paged compositions out (and back) — and that adapter is the *only* place in the codebase that knows the external format exists, exactly as `dockview-substrate.ts` is the only file that knows dockview exists. This is what keeps "and others" cheap: A2UI, AG-UI, a future format, or hand-authored JSON are all adapters over one internal tree. Adopting any external format *as* the internal model would turn every other producer into a translation-through-that-format tax forever.

---

## 7. The convergence requirement (the actual hard part)

The SDK's correctness does not come from "the UI calls a client method." It comes from the UI and the script engine calling **the same** method with **no privileged path** for either. With Boa already live, this is testable today rather than aspirational.

The panels are not homogeneous; they exercise different parts of the surface, and they reveal divergence in different places:

| Tier | Example panels | What it demands of the SDK | Re-render trigger |
|---|---|---|---|
| **Read-mostly structural** | Pages, Layers, Links, Articles | Query the tree; subscribe to structure mutations; apply node Operations; **drive selection + camera** (application state the canvas also consumes) | Structure mutation |
| **Selection-driven property** | Character, Paragraph, Stroke, Color/Swatches, Effects, Object/Transform | Read the **current selection's resolved properties**; render editors; write `SetProperty` | Selection change *and* mutation |
| **Tool / gesture** | Tools panel, tool switchers | Touch the **tool registry** and the **Gesture API**, not Operations directly | Active-tool change |

The structural tier's interesting demand is that it *pushes* application state (selection, camera) that the canvas and gesture spine consume — it makes the document-vs-application-state line concrete. The property tier's shared hard problem is "what is selected and what are its resolved properties right now," which all six panels in that row need; designing the contribution API against only a structural panel would miss that this tier needs a **selection-property-binding** primitive (or it gets reinvented six times).

This is why the first slice must span both binding-shaped tiers *and* one expert leaf — a declarative property composition, a structural panel, and an imperative leaf — rather than a breadth-first sweep of all panels. The selection-property-binding primitive this tier needs is the same binding model the declarative layer (Section 6) is built on; the property panel is where both are proven at once.

---

## 9. Invariants to hold throughout

*Status note (2026-10-02): this section predates the implementation; see [ADR 002](../adr/002-cockpit-over-dockview.md) (invariants 6 and 11 name a docking library that is no longer a dependency), [ADR 206](../adr/206-package-layering-lint-zones.md) (the lint enforcement of invariant 2) and [ADR 204](../adr/204-declarative-property-panels.md) (invariants 9, 10 and 12).*

These are the rules that keep "panels on the SDK" a clean foundation rather than a leaky one. Each is cheap to keep and expensive to retrofit.

1. **One door.** All mutation goes through `apply` (Operations). No panel, and no first-party code, gets a privileged mutation or read path the script engine lacks.
2. **Core stays React-free.** `@paged-media/client` never imports React. Enforced by lint from day one.
3. **The canvas is the one special case.** It is the only non-configurable panel. Everything else is data.
4. **Wrapping is not converging.** Re-exporting an existing method is not "on the SDK" unless the script path uses the same surface. Convergence is the deliverable.
5. **Five contexts, not one.** Re-render isolation is a correctness property; selection changes must not re-render camera consumers.
6. **One dockview seam.** Exactly one file imports `dockview-react`. Swapping the docking library is then a contained change.
7. **No stability commitment yet.** First-party-only means the API can and should evolve freely. Add fields, rename, break things — this is the cheap window.
8. **Panel friction is specification.** When a panel cannot do something through the SDK, fix the SDK (or the Rust Operation set), not the panel.
9. **Expert components are catalog leaves with declared bindings that write through the Operation door — never a parallel path.** An expert component gets imperative *rendering*, not imperative *mutation*. This is the single rule that keeps the escape hatch from becoming the hole everything leaks through.
10. **The catalog is finite and curated.** New component types are added in code, reviewed. Neither a document nor an agent may define a new component type inline — that is code execution by another name and forfeits the security and portability properties.
11. **The internal declarative model is Paged's own.** External formats (A2UI and others) live behind a single adapter, the way dockview lives behind a single substrate. No external format is the internal representation.
12. **A panel that fails the declarative test is first a catalog finding.** Add the missing widget to the catalog (once, reviewed) before declaring a panel an expert leaf. Expert leaves are the few genuinely-bespoke panels, not the default.
