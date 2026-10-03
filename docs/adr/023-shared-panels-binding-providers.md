# ADR 023 — Shared panels: the host owns the panel, plugins provide the values

**2026-08-04 · decision record · status: ACCEPTED 2026-08-04 — implementation
in progress; see the sequencing addendum at the end.**
Panels are being duplicated between the editor and the plugins, and the
duplication is already three-deep for Layers. The obvious fix — publish a
shared panel *component library* each plugin instantiates — is the wrong one:
it multiplies panels rather than the content types they serve. This ADR
proposes the inverse split — **one host-owned panel, with plugins registering
as the value provider for the current selection** — plus a smaller additive
primitive (panel slots), and requires the seam to be proven against **three
consumers of different shape** (Layers, Character/Paragraph, Swatches) before
it is called generic.

**Sources:** the measured panel inventories (`apps/canvas/src/panels/`,
55 panels; `plugin-draw: packages/draw-bundle/src/panels/` = appearance / fill / graphic-styles /
layers / live-paint / stroke / symbols; `plugin-image: glue/src/panels/`
= one `image-panel.tsx` carrying `LayersSection` + `BrushSection` + Color /
Effects / Levels / Selection; `plugin-doc` = outline; `plugin-sheets` =
datasets / grid / workbook); the existing contribution surface
(`contributeSchemaPanel`, `contributePanel`, `contributeEditContext`,
`BindingsSurface.publish/get` at
`plugin-sdk: packages/plugin-api/src/host.ts:1326-1334`,
`WidgetValueBinding` with `selectionProperty`, and the `SchemaListSpec` /
`SchemaRowAction` / `applyEntity` list tier from B-01/G3 schema v1.1); the
internal gap register's rows **B-01/G3** (the list tier landed; *"Still absent: tree rows,
drag-reorder, inline rename"*) and the row that reserves `contribute.objectType`;
`plugin-sdk: CLAUDE.md` (*"No speculative surface — a type joins
the façade when a real bundle needs it"*); and the internal feature catalogs'
architecture rule (*"avoid product-name conditionals; use capability
interfaces"*).

## The problem

The same panel is being written more than once, in more than one repo:

| Panel | Editor | Plugin copies |
|---|---|---|
| **Layers** | `paged.layers` | `plugin-draw` `layers-panel.tsx`, `plugin-image` `LayersSection` |
| **Stroke** | `paged.stroke` | `plugin-draw` `stroke-panel.ts` |
| **Fill / colour** | `color`, `swatches`, `gradients` | `plugin-draw` `fill-panel.ts`, `plugin-image` Color section |
| **Effects** | `paged.effects` | `plugin-image` Effects + Levels sections |
| **Outline** | `paged.outline` | `plugin-doc` `outline-panel` |

Layers exists **three times**. And the pressure is not spent: text
formatting is the next one — the editor has Character / Paragraph / OpenType
/ Glyphs / styles panels, and `paged.doc` (DOCX runs), `paged.sheet` (cell
text) and `paged.image` (raster type) all want the same controls over
different storage. Nothing in the platform currently lets them have it, so
each will grow its own.

This is not carelessness. The platform offers exactly two ways to put a panel
on screen — `contributeSchemaPanel` (declarative, host-rendered) and
`contributePanel` (the plugin ships React) — and **both produce a NEW panel.**
There is no way to contribute *into* an existing one, and no way for a plugin
to serve the values a host panel binds to. Given only those tools, "write
another Layers panel" is the correct local decision every time.

## Why the obvious fix is the wrong one

The tempting answer is a shared panel **component library**: publish
`<LayersPanel>` / `<CharacterPanel>` from the shell, let each plugin mount its
own instance against its own data.

Reject it. It optimises the wrong axis — it removes code duplication while
*keeping* panel duplication. The user still ends up with three things called
"Layers" in the rail and has to know which one is live for the current
selection. Neither Illustrator nor InDesign works that way: there is **one**
Character panel, and it retargets as the selection changes. That is the
behaviour to copy, and it is a statement about panel *identity*, not about
code reuse.

It also fails the platform's own isolation posture: shipping React components
across the contract boundary drags host code into bundle module graphs, which
is precisely why `plugin-api` is type-only.

## Decision

Two primitives. The first is load-bearing; the second is convenience.

### 1. Binding providers

A schema panel's `WidgetValueBinding` today resolves `selectionProperty`
against core. Extend the model so that **while an edit context is active, the
owning plugin may register as the resolver** for a declared set of property
paths — reads and writes both.

One host-owned Character panel then serves a core text frame, a DOCX story, a
sheet cell and a raster text layer, with no branching on plugin identity. The
panel keeps binding to `characterFontSize`; *who answers* changes with the
selection.

This composes with machinery that already exists rather than inventing a
parallel one: `contributeEditContext` already establishes who owns the current
selection, and `BindingsSurface` already lets a bundle publish reactive values
the host re-renders on. What is missing is the **property-path resolver** role.

### 2. Panel slots

Host panels declare named insertion points; a plugin contributes a
schema-described *section* into one. This is the additive case —
`paged.image` wants a Levels section inside Effects, not a second Effects
panel. Strictly less powerful than (1) and only worth building once (1) exists,
because a section with nowhere to read from is an empty box.

## Sequencing

**Superseded in part.** This section originally argued for a single first
consumer — Layers — on the grounds that its duplication was already paid for
while text's was merely predicted. That reasoning was right about *cost* and
wrong about *proof*: one consumer cannot demonstrate a generic seam, it only
demonstrates something shaped like its only caller. The proof set is now the
three shapes tabulated in the addendum. What survives from the original
argument is the dependency, which is real and unchanged:

**The schema widget tier is a hard dependency that must be scheduled, not
assumed.** The list tier from B-01/G3 landed (`SchemaListSpec`,
`SchemaRowAction`, `applyEntity`), and its own row records what is still
absent: **tree rows, drag-reorder, inline rename**. A Layers panel needs all
three. So the *panels* are editor-work-first — but note the **contract is
not**: the provider mechanism has no widget dependency and lands ahead of it
(phase A before phase B; see the addendum table).

Order within the proof set follows dependency, not preference: Layers and
Swatches both need the collection tier; Character/Paragraph needs only the
scalar tier that already exists, so it is the cheapest to stand up and the
sharpest test of the value model (mixed values).

But **colour carries the most weight of the three**, because it is the only
one every plugin needs (7/7 by measurement, vs 2 for Layers and 3 for text)
and the only one where a plugin is ALREADY doing the work without a surface
— `plugin-sheets` mints document swatches from production code
(`plugin-sheets: packages/sheet-host-model/src/lower-to-mutations.ts:297`,
`plugin-sheets: packages/sheet-host-model/src/chart.ts:350`).
If the seam serves only two of the three, colour is the one that must be
served.

## Consequences

- **The provider interface must be capability-shaped, not identity-shaped.**
  The failure mode is a host panel accumulating `if (pluginId === "image")`.
  A shared panel with product conditionals is worse than three honest separate
  ones, and the catalogs name this exact anti-pattern.
- **Panel identity becomes a host concern.** Plugins stop owning "a Layers
  panel" and start owning "the Layers data for my content type". That is a
  real reduction in plugin autonomy and should be stated plainly rather than
  discovered during migration.
- **Retiring the duplicates is a migration, not a deletion.** `plugin-draw`'s
  layers/stroke/fill panels and `plugin-image`'s sections are shipped surfaces
  with tests; they retire one at a time behind the provider seam.
- **`contributePanel` (React) does not go away.** It stays the escape hatch
  for genuinely plugin-specific surfaces — Live Paint, Symbols, Graphic
  Styles, the brush engine — which have no host counterpart and should not
  pretend to.

## What this ADR does NOT decide

The wire/contract shape of the resolver registration; whether a provider may
serve paths core does not model (a raster text layer's storage is not an IDML
property path, and inventing synthetic paths is its own decision); whether
slots are ordered or named-only; and the migration order beyond "Layers
first". Those belong in the RFC that follows if this is accepted.

## Status

**ACCEPTED 2026-08-04.** Raised out of the observation that basic capability
kept landing in whichever layer happened to be under the cursor — the same
root cause as grouping living in `paged.draw` and Arrange existing nowhere.
Recorded so the panel layer gets a deliberate placement decision instead of
the same drift.

## Implementation sequencing (addendum, 2026-08-04)

Four phases. The ordering is not arbitrary — phase C cannot be demonstrated
without phase B, and phase D cannot begin without A and C.

| # | Phase | Repo | Depends on |
|---|---|---|---|
| **A** | The binding-provider CONTRACT + host adapter: a bundle registers as resolver for declared property paths while its edit context is active; reads and writes both. | `plugin-sdk` (`plugin-api` types + `plugin-sdk: packages/plugin-sdk/src/host-impl.ts`, per its "the host adapter lives HERE, not in the editor" rule) | — |
| **B** | The schema widget tier B-01/G3 left open: **tree rows, drag-reorder, inline rename**. | `editor` | — |
| **C** | THREE host-owned panels — **Layers**, **Character/Paragraph**, **Swatches/colour** — rendered from the schema tier, reading through the provider seam. | `editor` | A + B |
| **D** | draw/image register as Layers providers; doc/sheet/image as text providers; draw/image as colour providers. Duplicates retire ONE AT A TIME behind the seam. | plugins | A + C |

### Why the proof needs THREE consumers, of different shape

Amended 2026-08-04: a single consumer does not prove a
generic seam — it proves you built something shaped like its only caller. The
three are chosen because each stresses a *different* axis of the binding
model, and core already backs all three:

| | **Layers** | **Text formatting** | **Swatches / colour** |
|---|---|---|---|
| Shape | element COLLECTION — ordering, nesting, visibility, lock | SCALAR PROPERTIES over a RANGE | DOCUMENT-SCOPED RESOURCE collection + apply-to-selection |
| Addressing | element / layer identity | story id + character range | document-level, not per element |
| Value | one per row | **can be MIXED** across the selection | a resource the panel itself edits |
| Core backing | `LayerSummary`, `LayerMove`, the `layers` wire collection | **37 `Character*` / `Paragraph*` `PropertyPath` variants** | `swatches`/`colorGroups`/`gradients`/`inks` collections; `Create`/`Edit`/`Delete` × `Swatch`/`Gradient`/`ColorGroup`; **44 colour-bearing `PropertyPath`s** |

**Text is what constrains the value model.** A seam built only for Layers
would naturally assume element-scoped addressing and a single defined value
per path; both break on a Character panel over a multi-format selection, which
must report **mixed** rather than silently picking one.

**Colour is what constrains the scope model.** It is neither element- nor
range-scoped: the swatch list is a *document resource* the panel edits
directly, as well as a value applied to a selection. A seam that only answers
"the value of path P for the current selection" does not cover "the document's
swatch list, which the panel may add to and rename".

**Colour also makes the ADR's open question concrete.** `paged.image` works in
raster RGB/CMYK pixel values and `paged.web` in CSS colours — neither is an
IDML swatch. So *"may a provider serve values core does not model?"* stops
being hypothetical. Answering "no — providers resolve core-modelled vocabulary
only, and non-core colour stays a plugin-owned panel" is a legitimate boundary;
leaving it ambiguous for phase C to discover is not.

**Colour is also the most UNIVERSAL of the three, and that is measured, not
assumed.** Files touching colour vocabulary (`swatch` / `colorRef` /
`fillColor` / rgb / cmyk), excluding tests and `node_modules`:

| plugin | files | plugin | files |
|---|---|---|---|
| `image` | 75 | `publish` | 19 |
| `draw` | 36 | `web` | 11 |
| `sheets` | 17 | `doc` | 8 |
| | | `data` | 1 |

**Seven of seven.** Layers reaches two plugins and text three; colour reaches
every one. And it is not aspirational — `plugin-sheets` already emits `createSwatch` from PRODUCTION code —
`plugin-sheets: packages/sheet-host-model/src/lower-to-mutations.ts:297` for data-bar colours and
`plugin-sheets: packages/sheet-host-model/src/chart.ts:350` for chart series — i.e. a plugin is *already minting document
swatches*, through the raw ops, with no shared panel to do it from.
(An earlier revision cited `swatchCreateOps`; that is the TEST helper in
`plugin-sheets: packages/sheet-host-model/test/chart.spec.ts`. The substance holds — the production
call sites are the two above — but the citation was wrong.) The
document-resource write path the colour shape needs is therefore not
speculative; it is in production use and simply has no surface.

Named consumers — text: `paged.doc` (DOCX runs), `paged.sheet` (cell text),
`paged.image` (raster text layers). Colour: **all seven**, with `sheets` and
`doc` as the ones that prove the case beyond the vector/raster pair. In every
case over the editor's EXISTING panels, while plain core content keeps
resolving through core.

**A is independent of B** — a common mis-read of the "editor work first"
argument above. That argument is about the *Layers panel* (phase C), which
cannot render without the widget tier. The provider mechanism itself has no
such dependency and can land first.

**Panel slots are deliberately NOT in this sequence.** Per the ADR body they
are worth building only once providers exist, and only when a real consumer
asks — `paged.image`'s Levels-into-Effects is the candidate, not a
requirement.

**The retirement in D is the risk to watch.** `plugin-draw`'s layers/stroke/
fill panels and `plugin-image`'s sections are shipped surfaces with passing
tests and registry rows. Retiring them is a migration with a rollback story,
not a deletion — one panel at a time, each with its conformance spec moved to
the new seam before the old surface goes.

## Outcome (2026-08-05) — all three consumers proven

| Consumer | Axis | Where | Verdict |
|---|---|---|---|
| **Layers** | COLLECTION | editor `08e2ff4`/`14eb7d4`, draw `d4539b5`/`2339bce` | Retargets; draw serves the entered context's object stack, so the test cannot pass by serving the same rows twice |
| **Swatches** | SCOPE (document resource) | editor `b3115ff`, sheets `25a6b05` | Retargets read AND write; a rename flows through as `editSwatch` → sheets → `createSwatch`, and the engine's collection gains the row |
| **Character/Paragraph** | VALUE (range-addressed, MIXED) | editor `6e2640a`, sheets `7c1c568`/`29288c0`, plugin-sdk `c3bbc83` | Retargets; MIXED asserted for core AND provider content |

**No host panel contains `if (pluginId === …)`.** Grepped across all three. The
only plugin-id comparison anywhere is `p.plugin === provider` inside
`writableByDeclaration` — comparing the answering provider to itself for a
capability lookup, never to a literal.

### The three-consumer requirement earned itself

Each axis needed something the previous ones did not, which is precisely the
argument for not stopping at one:

- **Layers** established the seam and the retargeting read — put in the
  PLATFORM, not the panel, so every schema list declaring `documentCollection`
  inherits it.
- **Swatches** needed a new host hook, `useCollectionOpOffered`.
  `useCollectionPathOffered` asks about a `PropertyPath`, and the
  `PropertyPath` union has no `swatchName` and no swatch colour — core models a
  swatch's mutable surface as structural OPS carrying a full `SwatchSpec`. The
  CONTRACT needed nothing (`provides.ops` was already there); the host did.
- **Character/Paragraph** needed a genuine contract addition,
  **`provides.writablePaths`** (plugin-sdk `c3bbc83`). Layers and Swatches write
  structurally through `applyMutation`, declared in `provides.ops`. The
  property-write lane had **no declaration at all** — `writeProperty` is a
  callback, and a callback's absence never reaches `activeProviders()`. Phase
  A's own doc called that absence "writes fall through to core, which is the
  honest behaviour"; it contradicted the op lane's rule and was the write-side
  form of the `absent` lie.

### Two live defects the proof exposed

Both were shipped, both predate this work, neither would have been found by a
single-consumer proof:

1. **`FillStrokeCluster` rendered a multi-colour text range as "None".** Core's
   own signal for mixed is *entry present, value `null`* — a different fact
   from *no entry at all* — and the binding hook collapsed both into
   `entry?.value ?? null` with no `mixed` flag for content scope. The
   composition leaves were fine either way; the cluster reads `.mixed` and so
   stated a falsehood about the user's own selection.
2. **A writability lookup keyed on plugin id shipped an enabled control over a
   read-only provider.** `paged.sheet` registers TWO providers on one context,
   so "the first entry from that plugin" read the *swatches* provider's
   declaration. The key is (plugin AND declares-the-path) — one more way of
   saying identity was never the key.

### The fourth consumer (2026-08-07) — and the write lane finally runs

**paged.image** joined as the fourth consumer, on its new `rasterImage`
context, and it is the one that closed a hole the three-consumer proof
could not see.

| Lane | What it does |
|---|---|
| **Layers** (collection) | serves the raster stack as core `LayerSummary` rows, so the host Layers panel shows raster layers inside the context. Groups become real tree rows for free — `LayerSummary` carries `parentId` and the host list already declares `tree`. Takes first refusal on `layerMove`/`SetVisible`/`SetLocked`/`SetName`/`Remove`. |
| **Character** (value) | **the first provider anywhere with a NON-EMPTY `writablePaths`.** |

**Why that matters.** paged.sheet proved the read side of the VALUE axis
and honestly declared `writablePaths: []`, because its engine has no
cell-style write API. So the host's property-WRITE path —
`writeSelectionProperty` / `useSelectionPathWritable` — had shipped and
**never executed against a real provider**. Raster type's settings are
ordinary writable session state, so paged.image runs it for the first
time.

**What it declined to serve, and why it is interesting.** Exactly one
path is served: `characterFontFamily`. `characterFontSize` is owned and
`absent`, because the host binds it to a length widget formatting in
document units while raster type measures in PIXELS. The conversion is
available (the composite path already derives points-per-pixel from the
frame box) — what is unresolved is a PRODUCT question: does that field
mean "points, absolutely" or "the size unit of what you are editing"?
Until that is answered, `absent` shows no value rather than a pixel
count in a control labelled in points.

That is a THIRD axis this ADR's design does not have a mechanism for.
Availability has `absent`; writability has `writablePaths`; **unit has
nothing**. A unit-carrying design was worked out and deliberately not
built — the governing rule (content with no intrinsic coordinate space
uses document units) puts every other content type in the document
family, so the axis has a population of one and cannot meet this ADR's
own three-consumer bar.

### Still open

- ~~**`EditContextContribution.panelIds` fights a retargeting panel**~~ —
  **CLOSED 2026-08-05** (editor `a0af30f`, plugin-sdk `edd7785`, `plugin-sdk: DESIGN.md`
  §18.12). Solved as a host-side DOCKING RULE inferred from `provides`, with
  **no contract member added**: on context enter the host opens each declared
  panel but WITHHOLDS the raise when the panel on screen is one the entering
  context's providers serve — a set intersection over `provides.collections` /
  `provides.paths` against what a mounted panel actually asks the seam about.
  The panel half is reported by the seam hooks themselves, not declared per
  panel, on this ADR's own precedent that the retargeting read belongs in the
  platform rather than the panel.
  A `servesPanelIds` field on the context lost on the strongest possible
  ground: whether raising one panel displaces another is a HOST LAYOUT fact,
  not a plugin fact — in a multi-pane shell the question never arises — and it
  would have put host panel IDS in plugin code, reintroducing one layer up
  exactly the identity coupling this ADR removed from the value lane.
  The authority is **purely negative**: "serves" can only withhold a
  displacement, never open, raise or close a panel, so a wrong declaration
  cannot hijack a user's dock.
  **Correction to this ADR's own record:** it was previously stated here that
  all three slices hit this. They did not. Only Layers did. `paged.sheet`'s
  context declares no `panelIds` at all — what displaced the Swatches and
  Character/Paragraph panels was `importAndLower` putting the workbook panel's
  file picker on screen. Those two re-raises are a user walking back to the
  panel under test, are legitimate, and stay; their comments blaming
  `panelIds` were cargo-culted from the Layers diagnosis and are corrected.
  An unmounted shared panel is safe by construction, not by care: resolution
  is pull-based at mount, so closed / behind a tab / in a collapsed group all
  behave identically. Residual: the tab STRIP outlives the panel it names, so
  a tab reading "Layers" gives no hint its content retargeted — a provenance
  mark on the tab is separate work.
- **Panel slots** — ADR primitive 2, deliberately unbuilt: worth it only once a
  real consumer asks.
- **Widget-tier state column.** The retired draw Layers panel drew eye/lock/
  print glyphs per row; `SchemaListSpec` has only static-label actions, so the
  toggles work but do not SHOW state. A Layers panel that cannot show
  visibility is not finished.

## Amendment — 2026-10-02

Checked against the code at `28dc764`, with the contract at plugin-sdk `d90f727` and the
providers at plugin-draw `0d12bf8`, plugin-image `f7d21e5` and plugin-sheets `71f37d7`. The
decision stands. The contract door is `bindingProvider(contextType, provider)`
(`plugin-sdk: packages/plugin-api/src/host.ts:468-471`); the host side is
`packages/shell/src/catalog/binding-providers.tsx`, whose header states the three rules it
enforces (`:28-46`); the docking rule recorded under "Still open" is
`packages/shell/src/catalog/panel-binding-surface.tsx:177` (`panelServedBy`), consulted at
`packages/shell/src/state/edit-context-controller.tsx:205`. Panel slots are still unbuilt:
`ContributionSurface` has no slot member (`plugin-sdk: packages/plugin-api/src/host.ts:380-485`).
Line numbers in Sources and Sequencing are those of 2026-08-04; `BindingsSurface`, for example,
is now at `plugin-sdk: packages/plugin-api/src/host.ts:1535-1549`. The text above no longer
matches the code in five places.

**1. Raster type serves fifteen paths, and font size is one of them.** "The fourth consumer"
says "Exactly one path is served: `characterFontFamily`" and that `characterFontSize` is owned
and `absent` until a product question is answered.

- `plugin-image: glue/src/binding-provider/text-provider.ts:67-148` — `VALUED_PATHS` lists
  fifteen paths, among them `characterFontSize`, `characterTracking`, `characterLeading` and
  `characterFontStyle`. `:211` declares the same list as `writablePaths`.
- `plugin-image: glue/src/binding-provider/text-provider.ts:69-93` — the comment records the
  answer taken on 2026-08-09: the field means "the size unit of whatever you are editing",
  shown in points, "with the plugin doing the conversion".
- `plugin-image: glue/src/binding-provider/text-provider.ts:235-252` — the read returns
  `sizePx * ptPerPx`, and `absent` while no composite exists to convert against.
- `plugin-image: glue/src/binding-provider/text-provider.ts:165-184` — eight paths remain owned
  and `absent`.

This supersedes the paragraph beginning "What it declined to serve, and why it is interesting".
The paragraph after it still holds for the contract: no member of
`plugin-sdk: packages/plugin-api/src/binding-provider.ts` carries a unit, and the comment at
`text-provider.ts:83-88` says the contract was deliberately not changed.

**2. The list tier shows row state.** The last "Still open" bullet says `SchemaListSpec` has
only static-label actions, so the Layers toggles "work but do not SHOW state".

- `packages/shell/src/catalog/schema-panel-types.ts:106-118` — a list action has an optional
  `state: { field, labelWhenOff }`.
- `packages/shell/src/catalog/leaves.tsx:1295-1299`, `:1307` — the row's field picks the button
  label and sets `data-row-state`.
- `apps/canvas/src/panels/layers-panel.tsx:185`, `:194`, `:227` — the Layers panel uses it for
  visible, locked and printable; its header records the change, dated 2026-08-22 (`:71-78`).

The state is shown as a label ("Hide" or "Show"), not as a glyph. The member exists in the
editor's schema type only; `SchemaListAction` in the published contract has `label`, `action`
and `enabled` (`plugin-sdk: packages/plugin-api/src/panel-schema.ts:175-183`).

**3. There are three plugin-id comparisons, none against a literal.** The Outcome section says
the only one is inside `writableByDeclaration`. That one is
`packages/shell/src/catalog/binding-providers.tsx:412`. The other two are
`apps/canvas/src/panels/swatches-panel.tsx:245` and `apps/canvas/src/panels/layers-panel.tsx:478`;
each looks up the entry of the provider that answered, to print its context type in a
"provided by" note (`swatches-panel.tsx:241-247`, `layers-panel.tsx:476-480`). All three compare
with the answering provider. The statement "No host panel contains `if (pluginId === …)`"
still holds.

**4. Phase D, as it stands at the pinned commits.** Three plugins register providers:

- `plugin-draw: packages/draw-bundle/src/activate.ts:531-535` — one, for the `layers` collection
  (`plugin-draw: packages/draw-bundle/src/binding-provider/layers-provider.ts:269-273`).
- `plugin-image: glue/src/activate.ts:728-747` — two, Layers and Character.
- `plugin-sheets: packages/sheet-bundle/src/activate.ts:362-366`, `:372` — two, Swatches
  (`plugin-sheets: packages/sheet-bundle/src/binding-provider/swatches-provider.ts:188-189`) and
  text, the latter still with `writablePaths: []`
  (`plugin-sheets: packages/sheet-bundle/src/binding-provider/text-provider.ts:327-332`).

plugin-doc (`76e1d06`), plugin-web (`653a95e`), plugin-data (`6b96ce5`) and plugin-publish
(`6994ad1`) contain no reference to `bindingProvider`. The phase D row of the sequencing table
names doc as a text provider and draw and image as colour providers; none of the three is
built, and `swatches` is served by plugin-sheets alone.

Of the duplicates in "The problem": plugin-draw's Layers panel is gone
(`plugin-draw: packages/draw-bundle/src/panels/` has no `layers-panel.tsx`). plugin-draw still
contributes its Stroke and Fill schema panels
(`plugin-draw: packages/draw-bundle/src/activate.ts:193`, `:195`), and plugin-image still renders
`LayersSection` inside its own panel (`plugin-image: glue/src/panels/image-panel.tsx:1111`,
`:2712`).

**5. plugin-sheets still carries local mirrors of the contract types.**
`plugin-sheets: packages/sheet-bundle/src/binding-provider/adr023-seam.ts:24-33` says the repo
installs `@paged-media/plugin-{api,sdk}@0.2.25-canary.0`, which lacks the door, and keeps
hand-written mirrors (`:56-131`) and a cast of `host.contribute` (`:156`, `:182`) for that
reason. Its `package.json` pins `0.2.33-canary.0`
(`plugin-sheets: packages/sheet-bundle/package.json:25-26`). plugin-draw, on the same pin
(`plugin-draw: packages/draw-bundle/package.json:24-25`), replaced its mirrors with re-exports
and notes that `0.2.28-canary.0` publishes the types
(`plugin-draw: packages/draw-bundle/src/binding-provider/adr023-seam.ts:62-69`). The header
comment in the plugin-sheets file is stale.
