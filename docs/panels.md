# Panel reference — current state & target end-state

> Compiled from source on 2026-06-05 (cockpit series, post dockview removal);
> revised the same day after the **panel-gallery pass** (gallery series) —
> every panel now carries the Panel Gallery's field layout
> (`brand/editor/ui_kits/editor/gallery-*.jsx` + `INDESIGN_PARITY.md`),
> with explicit honest seams (`seam: true` / disabled controls) for every
> unbacked field.
> Scope: every `PanelContribution` registered in `apps/canvas/src/main.tsx`.
>
> **Legend** — ✓ live (engine-backed) · ◐ partial (real data + visible seams) ·
> ○ honest stub (kit shape, `ComingSoon`, never fake-interactive).
>
> The *end state* column is the product target derived from the design-system
> kit (`brand/editor/ui_kits/editor/`), its screenshots, and the engine-gap
> analysis. Engine gaps are numbered at the bottom; a panel flips ◐/○ → ✓ when
> its gaps close.

## How panel inputs work

Most editing panels are **declarative compositions**: a `CompositionNode`
tree references catalog primitives — `PAGED_INPUT_LENGTH`,
`PAGED_INPUT_NUMERIC_SCRUB`, `PAGED_INPUT_COLOR_SWATCH`, `PAGED_INPUT_BOUNDS`,
`PAGED_INPUT_TOGGLE_GROUP`, `PAGED_INPUT_COLLECTION_SELECT`, plus the
gallery-pass additions `PAGED_INPUT_SELECT` (static enum select),
`PAGED_INPUT_TOGGLE_SWITCH` (bool pill), `PAGED_READOUT` (mono readout) and
the layout leaves `PAGED_LAYOUT_CLUSTER` (labelled multi-control rows) and
collapsible/headingless `PAGED_LAYOUT_SECTION` variants — and binds each
to a `PropertyPath` (element scope = selected frames; content scope = text
caret/range). A node with `seam: true` renders its control **visibly but
disabled** with a placeholder — the honest-seam convention at field scale.
Shared archetypes from the shell (`ApplyList`, `ListRows`/`PanelToolbar`,
`ReferencePointGrid`, `StatusBadge`, `PanelTarget`) carry the gallery's
list/style-manager/concept shapes. `useBindings` fetches live values via
`client.elementProperties()`, re-fetches on every mutation/undo/redo,
collapses multi-selection to a uniform value or an em-dash *mixed* sentinel,
and commits through `client.mutate({ op: "setElementProperty", … })` — every
input is undoable and stays in sync with gestures, scripts and other panels.

Read-only panels consume **document collections**
(`useCollection<T>("name")`) or **document meta/stats**
(`useDocumentMeta()`, `useDocumentStats()`), refreshed on
`documentLoaded` / `mutationApplied` / `undoApplied` / `redoApplied`.

---

## 1 · Selection & properties (context-inspector family)

### Properties — `paged.properties` ✓
The cockpit **context inspector** (the design-mode Properties tab; kit
`inspectors.jsx`). Routes by live selection — the panel rail's
Text / Image / Pages items steer the empty case via `inspectorContext`:

| Kind | Shown sections |
|---|---|
| Text (content selection) | Character + Paragraph compositions |
| Image (element with `hasImage`) | Object Transform + Frame fitting + Stroke |
| Frame (other element) | Object Transform + Stroke |
| Page (rail steer, nothing selected) | Page summary (real page count + size; margins/bleed = seam) |
| none | guidance hint |

The gallery's selection sub-header ("Frame · 1 frame" / "Text selection")
renders under the title with the overset alert chip as a seam (em-dash until
gap 1). AI Assistant card renders below every populated inspector (visible,
inert). Hooks: `data-properties-panel`, `data-inspector-kind`,
`data-properties-section`, `data-selection-label`, `data-overset-seam`.

**End state** — the kit's full per-type inspectors: **Text** adds font
family/style selects, kerning, the violet overset banner
(*"8 % overset · 18 words hidden"*), frame columns/language rows; **Image**
adds SmartDial transforms (scale/rotation/opacity), link status, effective
PPI, colourspace, alt text; **Page** adds margins/bleed/columns, parent
master, production status; a **Table** variant appears when table selection
lands. AI card becomes functional (diagnose → propose → apply with impact
note). Gaps: 1, 2, 3, 5, 6, 8, 9.

### Object — `paged.object-transform` ✓ (gallery card)
Bespoke: **X/Y + W/H rows are LIVE derived projections over
`frameBounds`** (translate preserving size / resize anchored top-left);
Opacity metric → `frameOpacity`. Seams: reference-point grid, rotation,
scale X/Y, Flip H/V (await the decompose primitive — gap 6).
**End state** — typed rotation + scale dials live, reference point wired,
lock-aspect; absorbed into Properties ▸ Transform.

### Stroke — `paged.stroke` ✓ (gallery card)
Weight metric → `frameStrokeWeight` · Colour swatch → `frameStrokeColor` ·
Cap 3-way toggle → `frameStrokeEndCap` (TextFrame unsupported → em-dash).
Seams: Type select, Join/Align segments, the collapsed "Dashes & arrows"
disclosure (dash/gap + arrowhead selects).
**End state** — stroke type (dash/dot), join, miter, align-to-path, gap
colour as engine stroke paths grow.

### Effects — `paged.effects` ✓ (gallery effect-row stack)
Opacity metric (live) + Blend select (seam) up top; the EFFECTS list with
per-effect pills: **Drop Shadow live** (`frameDropShadow` pill; expanded
fields Mode/X/Y/Blur/Opacity/Colour → `frameDropShadow*`); Inner Shadow,
Outer/Inner Glow, Feather, Bevel & Emboss = disabled seam pills.
**End state** — full effects stack live + the per-target selector
(Object/Stroke/Fill/Text), three feather types, global light.

### Frame Fitting — `paged.frame-fitting` ✓ (gallery card)
Fit text segments (None/Fill/Fit/Content) → `frameFittingType`; Crop row4 →
`frameFittingCrops`. Rectangle-only; other kinds em-dash. Seams: Auto-fit +
fill-proportionally pills, the inert reference-point grid.
**End state** — merged into the Image inspector's Fitting section (kit);
auto-fit on place; AI crop suggestion becomes real.

### Attributes — `paged.attributes` ✓ (gallery check rows)
Nonprinting pill → `frameNonprinting` (mixed sentinel supported). Seams:
Visible/Locked pills (layer-level today), OVERPRINT pair, gap colour well.
**End state** — visible/locked per frame, overprint, story direction;
folded into Properties ▸ Frame.

### Align — `paged.align` ✓ (gallery card)
Align-to scope select (Selection live; Page/Margins/Spread disabled pending
gap 7) · six align buttons + two distribute writing a `batch` of
`setElementProperty(frameBounds)` (one undo entry) · Use-spacing seam.
Enabled at ≥2 (align) / ≥3 (distribute) frames. Hooks: `data-align-kind`.
**End state** — page/margins/spread scopes, equal-spacing inputs, key object.

### Pathfinder — `paged.pathfinder` ✓ (gallery buttons grid)
Union / Intersect / Subtract / Exclude → `pathfinderBoolean`
(curve-preserving CSG; first selected is kept, others deleted). ≥2 frames.
Seams: Minus back / Divide buttons, CONVERT SHAPE row, corner select.
**End state** — divide/outline/trim, convert shape, compound path
make/release.

### Inspector — `paged.inspector` ✓ (gallery filter)
Raw single-element property snapshot with the gallery filter input + mono
footer; every wire property rendered by value type (bounds grid, colour
picker, length scrub, 6-cell transform editor); re-fetches after every
mutation; mixed → em-dash.
**End state** — stays the developer/expert raw inspector (Window menu); user
editing lives in the curated context inspector.

### Control — `paged.control` ✓
Horizontal strip of Object/Stroke/Character/Paragraph compositions.
**End state** — likely retired (the kit's context toolbar replaced the
bottom control bar) or kept as an optional InDesign-familiar Window panel.

---

## 2 · Text & styles

### Character — `paged.character` ✓ (content scope, gallery card)
Live: Size (in the "Style + size" cluster), Leading + Tracking cluster,
Fill → `characterFontSize/Leading/Tracking/FillColor`. Seams: Family/Style
selects, Kerning + Baseline cluster, Case (ab/AB/Ab) + Position segments,
Language select, the bespoke OPENTYPE chip row (Liga/Frac/Ordn/OldS).
**End state** — all seams live: family/style, kerning
(Metrics/Optical/value), baseline shift, case, language, OpenType. Gap 5.

### Paragraph — `paged.paragraph` ✓ (content scope, gallery card)
Live: Align glyph segments → `paragraphJustification`; Space before/after
cluster; first-line indent (in the L·R·1st cluster). Seams: L/R indents,
Drop cap cluster, Hyphenate + baseline-grid pills, the collapsed
"Paragraph rules" disclosure.
**End state** — left/right indents, hyphenation, keep options, drop caps,
rules live; tabs in the Tabs panel.

### Character / Paragraph / Object Styles ✓ (shared **ApplyList** archetype)
`paged.character-styles` / `paged.paragraph-styles` / `paged.object-styles`
— the gallery style-manager surface (`StyleApplyPanel` → shell `ApplyList`):
applied select (stable `data-collection` hook) + clickable style rows
applying through `appliedCharacterStyle` / `appliedParagraphStyle`
(content scope) / `appliedObjectStyle` (element scope); New/Delete ride
`create*Style` / `delete*Style` (Delete targets the applied style).
Seams: Redefine, style groups, override "+" markers, next-style.
**End state** — full style options editing, based-on chains, override
indicator + redefine, groups, next-style chaining.

### Text Frame — `paged.text-frame-options` ✓ (gallery card)
Live: inset row4 grid → `frameInsetSpacing`. Seams: COLUMNS section
(count + gutter cluster, Balance pill), Vert. justify segments, Auto-size +
First baseline selects.
**End state** — vertical justification, column count/width/gutter, auto-size
rules live.

### Text Wrap — `paged.text-wrap` ✓ (gallery card)
Live: Wrap glyph segments → `frameTextWrapMode`; Offset row4 →
`frameTextWrapOffsets` (one `Option<TextWrap>`; apply layer preserves the
unset half). Seams: Wrap-to + Contour selects, Invert pill.
**End state** — contour options, invert, master-only flag.

### Fonts — `paged.fonts` ✓ (gallery card)
All / In use / Missing filter tabs over the families-in-use rows
(`fonts` collection; All ≡ In use today). Missing tab = honest seam note.
**End state** — missing/embedded status (gap 4), replace-font action; feeds
the prepress "missing font" finding.

### Cell Styles / Table Styles — `paged.cell-styles` / `paged.table-styles` ✓ read-only
Readonly **ApplyList** variant ("Apply available once table selection
lands."); apply paths are wire-shape-only until the table NodeId surface.
**End state** — apply/edit once table selection + ops land (gap 8); backs
the Table panel + Composer presets.

---

## 3 · Colour

### Swatches — `paged.swatches` ✓
Fill apply select → `frameFillColor` + full manager:
"+ New" (`createSwatch`) · Libraries menu (.ase import via `importAseBytes`)
· per-row colour chip → **ColorMixer popover** (tabs CMYK/RGB/LAB/Gray,
channel scrubs, hex field, tint %, commits `editSwatch`) · inline rename ·
group assign (`editColorGroup`) · delete · live out-of-gamut badge (CMM) ·
kind badges (process/spot/paper/registration; reserved swatches locked).
**End state** — kit Swatches tab: drag-to-apply, tint swatches, duplicate,
merge-on-delete, library save/export round-trip. Close to done.

### Color — `paged.color` ✓
Fill select + Tint scrub (`frameFillTint`); standalone **ColorMixer** with
Apply (ephemeral swatch) and "+ Add to swatches"; live colour readout (chip,
name/model, hex, CMYK %); "Open color wheel" hand-off to `paged.color-wheel`.
**End state** — eyedropper pipeline, recents row; the mixer behind every
colour well.

### Gradients — `paged.gradients` ✓ (gallery card)
Apply select (gradient ref as fill); editor: Linear|Radial segments,
reverse icon button, the **GradientRamp** (drag stops + midpoints,
click-track to add), and the gallery **STOPS rows** — colour chip · swatch
select · position % per stop — all committing one `editGradient`.
**End state** — on-canvas gradient tool sync (angle/length), per-stop opacity
when the engine carries it, create-from-mixer.

### Color Wheel — `paged.color-wheel` ✓ *(new, fully live)*
The brand kit's colour wheel as a panel: conic HSV disc + value track,
HEX·RGB·CMYK·HSL synced fields (naive client-side conversions; the
CMM-accurate path stays `colorCompute`), six colour-theory harmonies drawn
on the wheel; "Add to Swatches" lands the harmony palette as real swatches
through ONE batched `createSwatch` (single undo). Linked from the Color
panel ("Open color wheel").
**End state** — done; gains eyedropper + document-palette seeding later.

### Color Groups — `paged.color-groups` ✓ *(now live CRUD)*
Collapsible group rows expanding to CMM-resolved member chips; per-group
delete + "+ New group" via `createColorGroup` / `deleteColorGroup`
(member assignment lives in the Swatches grid via `editColorGroup`).
**End state** — + filtering the Swatches list by group.

### Ink Manager — `paged.ink-manager` ✓
Standard-Lab toggle (`setUseStandardLabForSpots`); per-spot: convert-to-process
checkbox + alias select (`setInkSetting`); CMYK plates listed.
**End state** — density/trapping when export consumes them; separations
preview (prepress "Separations" toggle becomes real).

### Colour Settings — `paged.color-settings` ✓
CMYK profile select + .icc upload (`registerColorProfile`), rendering intent,
black-point compensation (`setColorSettings`); soft-proof on/off + profile +
paper-white (`setProofSetup`).
**End state** — essentially done; RGB working space/policies if added.

---

## 4 · Structure & navigation

### Document Map — `paged.document-map` ◐  *(kit: design/review LEFT panel)*
Search filter · real spread tree (`spreads` collection walked in document
order) with live page-snapshot thumbnails · click → fit camera ·
"Add section" (disabled seam) · **Publication Health footer** (real
pages/stories/frames/links + PDF/X-4 pill; risk counts = seam).
**End state** — kit screenshot exactly: named **sections** with ranges
(gap 10), per-section **status chips** (Approved/In Review/Comments/Overset
— collaboration + gap 1), drag-reorder sections, real red risk counts
(gaps 1–4).

### Pages (Navigator) — `paged.pages` ✓
Vertical thumbnail filmstrip, click → fit camera (live snapshots).
**End state** — conceptually replaced by the bottom ThumbnailRail + Document
Map; survives in the Window menu; gains 2-up spread thumbs + page
insert/delete/duplicate actions (ops exist).

### Pages (list) — `paged.pages-list` ✓ · Spreads — `paged.spreads` ✓ · Master Pages — `paged.master-pages` ✓
Gallery ListRows. Pages list gains the **live toolbar**: New rides
`insertPage` (after the selected page or document end), Delete rides
`deletePage` against the selected row; Duplicate = seam. Spreads/Masters
rows (label + page count); per-master Apply = seam.
**End state** — pages-list absorbed by Document Map; spreads gain page
membership (gap 7) and become the true grouping source; masters gain
"apply to page" (`ApplyMasterToPage`) + master editing entry.

### Links — `paged.links` ✓ (gallery ListRows)
Glyph rows (filename + mono host line, filter at >8 rows) + a seam toolbar
(update/relink/go-to).
**End state** — present/missing status badges, effective PPI, colourspace
(gaps 2–3), relocate/update/break actions; feeds Health "Missing Links".

### Conditions — `paged.conditions` ✓ · Condition Sets — `paged.condition-sets` ✓
Gallery ListRows: condition rows (visibility-toned dot, indicator method,
seam eye toggle) / set rows (counts, seam Apply).
**End state** — visibility toggles (`SetConditionVisible`,
`ActivateConditionSet`); conditional text for Data mode.

### Articles / Hyperlinks / Bookmarks / Cross References / Index ✓ (gallery ListRows)
Glyph rows (order + members / destination / format / sort order); Articles
carries the reading-order footer; Index gains the seam "+ Generate index".
**End state** — CRUD + jump-to; article order feeds accessible-PDF reading
order; index gains generate-index.

### Outline — `paged.outline` ✓
Heading anchors + TOC with page numbers (Tier-3 NumberingMap), click → jump.
**End state** — merges visually into Document Map's section tree once
sections exist.

### Tree — `paged.tree` ✓
Scene-graph rows with two-way selection sync (`sceneTree` +
`setElementSelection`).
**End state** — developer tool (Window menu).

### Layers — `paged.layers` ✓
Per-layer visibility/lock/printable toggles, dbl-click rename, drag reorder,
add, delete (`layerInsert/SetVisible/SetLocked/SetPrintable/SetName/Move/Remove`).
**End state** — per-object rows under layers, move-to-layer, layer colour
chips driving selection outline colours.

### Info — `paged.info` ✓ (gallery readout rows)
Label · mono tabular value rows with hairline separators: document, pages,
active page, units, colour mode, dirty.
**End state** — stays diagnostics; user-facing equivalents live in
DocTitleBar/Health.

---

## 5 · Cockpit mode surfaces

### Publication Health — `paged.publication-health` ◐
Real metric tiles (pages/stories/frames/glyphs/links/colour mode) + X-4
readiness pill; the Risks section renders the kit's risk ROWS (em-dash
counts + inert chevrons — never invented numbers).
**End state** — all kit counts real: overset frames, missing links, low-res
images, font warnings (gaps 1–4) + accessible-PDF issues; each row jumps to
its findings.

### Preflight — `paged.preflight` ◐
"Validate output" runs a **real dry PDF export** → findings as gallery
issue cards under the dotted "Warnings · N" group kicker; real links
inventory; PPI/bleed checks = seam.
**End state** — kit prepress panel: Critical/Warnings groups with per-finding
page jump + fix actions, output profile selector, live re-validation, canvas
issue markers (error/warn/a11y pins).

### Output readiness — `paged.output-readiness` ◐
PDF/X-4 checklist: CMYK working-space check real; fonts/PPI/links/bleed rows
seamed ("soon").
**End state** — every row real with jump-to-fix; colour section reads live
profile/intent/ink limit.

### Export Center — `paged.export-center` ◐  *(export-mode canvas main)*
Kit centred readiness table: Print PDF/X-4 row REAL (readiness from working
space; "Export…" opens the live dialog); Web bundle / Social crops / Print
package dimmed seams; Fix-issues / Save-preset seams; row selection syncs nav
+ inspector via shared store.
**End state** — all targets real with per-target settings, checkbox batch
export, saved presets, preflight-gated readiness.

### Outputs — `paged.outputs` ◐ · Export settings — `paged.export-inspector` ◐
Left target nav (status dots) + right per-target inspector ("Export Print
PDF (PDF/X-4)" button → live dialog).
**End state** — inline per-target settings (preset/profile/bleed/marks per
kit) as each pipeline lands.

### Stories — `paged.stories` ◐ · Story inspector — `paged.story-inspector` ◐
Real story **count** (DocumentStats); list/fields = seam.
**End state** — kit Content mode: story rows (name, words, status dot) with
click-to-select; inspector with words, overset risk, language-expansion
risk, comments, approval. Gaps 1, 10 + collaboration.

### Comments — `paged.comments` ○ · Review inspector — `paged.review-inspector` ○
ComingSoon seams.
**End state** — threaded comments with resolve/reply, canvas pins,
approve/request-changes, version history + compare (collaboration backend).

### Data Source — `paged.data-source` ○ · Data mapping — `paged.data-mapping` ○ · Generated pages — `paged.data-grid` ○
Source "not connected" + ComingSoon seams.
**End state** — kit Data Layout mode: connect PIM/CSV/API, record list with
per-record status, field→slot mapping with rules, Generate → real generated
pages in the canvas grid with per-card status (data-publishing engine).

### Component Library — `paged.component-library` ○
ComingSoon seam.
**End state** — kit Library tab: searchable component grid (use counts),
drag-to-place, component inspector (variants, slots→data, rules); powers
Data-mode generation.

---

## 6 · Dev / scripting (outside the kit chrome, Window menu)

### REPL — `paged.repl` ✓
Command line (`inspect <id>`, `set <id> <path> <type:value>`, undo/redo)
through the real Operation channel — undoable.
**End state** — dev tool; possibly folded into the Script editor console.

### Script editor — `paged.script-editor` ✓
Multi-line JS (Cmd-Enter) in the worker's embedded **Boa** engine with the
`paged.*` global; console output + errors; every write undoable.
**End state** — the automation backbone (plugins + the AI assistant execute
through it); gains API autocomplete/docs.

---

## 7 · Concept panels (panel-gallery pass — INDESIGN_PARITY.md)

Registered, Window-menu-reachable surfaces in the gallery's exact field
layouts, shipped as honest seams at panel scale: **Concept badge** up top,
the kit's **"Target ·" footnote** pinned below, every unbacked control
visibly disabled (shared `concept-kit.tsx`). Interactive/rich-media panels
(Buttons, Object States, Animation, Media) are **out of scope** per the
parity doc — not built, by decision.

### Table — `paged.table` ○
Rows/cols, row height (at-least), col width, alternating fills/strokes,
header/footer pills, cell inset, vert. justify — all seams.
**Target** — live with the Table NodeId surface (gap 8).

### Tabs — `paged.tabs` ○
Alignment segments (L/C/R/Decimal), position, the static stop ruler,
leader + align-on, repeat — all seams.
**Target** — the InDesign Tabs ruler, live with tab-stop reads/writes.

### Glyphs — `paged.glyphs` ◐ *(partially live)*
With an active text caret the glyph grid **inserts via the real
`insertText` mutation** (undoable); recently-used grid is panel-local.
Seams: Show scope + font selects (await the font registry).
**Target** — full character map, OpenType-feature filter, alternates
flyout, glyph sets.

### Bullets & Numbering — `paged.bullets-numbering` ○
List type segments, list/level, numbering style (format `^#.^t`, char
style, restart), position + the static preview — all seams.
**Target** — live with list definitions on the paragraph model.

### Object Export Options — `paged.object-export` ○
Alt Text | Tagged PDF | EPUB & HTML tabs (live local switcher) over seam
fields (alt-text source + textarea, tag role, conversion, CSS class).
**Target** — per-object alt text, tagged-PDF role, EPUB/HTML conversion —
feeds accessible PDF + EPUB output.

### Export Tagging — `paged.export-tagging` ○
Paragraph|Character scope toggle (live local state) over seam mapping
fields (HTML tag, class, epub:type, PDF tag) + the code preview.
**Target** — style → HTML tag/CSS class/PDF tag mapping for clean
EPUB/HTML + tagged PDF.

---

## Engine roadmap gaps (what flips ◐/○ → ✓)

1. **Overset signal** on the wire (stats + per-frame/story) — health count,
   inspector banner, AI problem line, canvas marker.
2. **`LinkSummary` status + colourspace** — missing links, image inspector.
3. **Effective PPI** for placed images — low-res findings, image inspector.
4. **`FontSummary` missing/embedded flag** — font warnings.
5. **`characterFontFamily/Style/Kerning` property paths** — text inspector
   font selects.
6. **Rotation/scale decompose primitive** — typed transform dials.
7. **`SpreadSummary` page membership** — true spread grouping.
8. **Table selection + table/cell ops** — table toolbar, Table Composer,
   cell/table style apply.
9. **`stories` / `sections` collections** — story list, Document Map
   sections.
10. **Page margin/bleed/column reads** — page inspector geometry.

Panel-gallery pass additions (consolidated from `INDESIGN_PARITY.md` + the
gallery seams; several extend gaps above):

11. **Character formatting paths** — font family/style (extends 5), kerning
    value, baseline shift, case, super/subscript, language, OpenType
    feature toggles, H/V scale, skew.
12. **Paragraph layout** — left/right indents, drop cap, hyphenation,
    keep options, span/split columns, baseline-grid align, paragraph rules.
13. **Text-frame geometry** — column count/gutter/balance, auto-size rules,
    vertical justification, first-baseline option.
14. **Text-wrap refinement** — wrap-to side, contour source, invert.
15. **Style infrastructure** — next-style, override indicators,
    redefine-from-selection, style groups.
16. **Object geometry** — per-corner corner options, Flip H/V, shear
    (extends 6).
17. **Stroke detail** — stroke type (dash/dot/stripe), join, miter limit,
    align-to-path, gap colour, arrowheads.
18. **Effects architecture** — per-target selector (Object/Stroke/Fill/
    Text), blend modes, three feather types, glow/bevel/satin models,
    isolate blending, knockout, global light.
19. **Page sections & numbering** — section marker/prefix/style, start
    number, shuffle toggles (extends 9's sections).
20. **Structured preflight findings** — severity + page refs on export
    diagnostics (drives the Critical/Warnings groups + jump-to).
21. **Tab stops** — per-paragraph stop table (the Tabs panel).
22. **List definitions** — bullets & numbering model (the B&N panel).
23. **Export metadata** — per-object alt text/role/conversion + per-style
    HTML/CSS/PDF tagging (Object Export Options, Export Tagging).
24. **Tint swatch children** + mixed-ink swatches (Swatches parity).
25. **Condition ops** — `SetConditionVisible`, `ActivateConditionSet`;
    **master apply** — `ApplyMasterToPage`; **page duplicate**.

Also (non-engine): collaboration backend (comments/approvals/presence/share),
data-publishing engine (Data mode), LLM backend (AI assistant), IDML
save-back (Save/Save as), and the GPU surround clear colour (hardcoded
`#e5e7eb` in `paged-canvas-wasm`) for dark-mode canvas fidelity.

## Cross-cutting end-state principles

- Panels exist **only** as right-dock tabs or mode slots — never floating;
  reachable via the panel-selector rail, the Window menu, and
  `paged.panel.show.*` commands. Plugin panels get the same treatment
  automatically via the registry.
- Values are mono/tabular with units (`11 pt`, `240 dpi`); mixed selections
  show em-dashes; sentence-case labels; no emoji.
- Nothing fake-interactive: a surface without a backend is a visible,
  disabled seam until it is real.
