# Panel reference — current state & target end-state

> Compiled from source on 2026-06-05 (cockpit series, post dockview removal).
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
`PAGED_INPUT_TOGGLE_GROUP`, `PAGED_INPUT_COLLECTION_SELECT` — and binds each
to a `PropertyPath` (element scope = selected frames; content scope = text
caret/range). `useBindings` fetches live values via
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

AI Assistant card renders below every populated inspector (visible, inert).
Hooks: `data-properties-panel`, `data-inspector-kind`, `data-properties-section`.

**End state** — the kit's full per-type inspectors: **Text** adds font
family/style selects, kerning, the violet overset banner
(*"8 % overset · 18 words hidden"*), frame columns/language rows; **Image**
adds SmartDial transforms (scale/rotation/opacity), link status, effective
PPI, colourspace, alt text; **Page** adds margins/bleed/columns, parent
master, production status; a **Table** variant appears when table selection
lands. AI card becomes functional (diagnose → propose → apply with impact
note). Gaps: 1, 2, 3, 5, 6, 8, 9.

### Object — `paged.object-transform` ✓
Bounds 4-cell grid (T/L/B/R pt) → `frameBounds`; Opacity scrub →
`frameOpacity`.
**End state** — X/Y/W/H presentation, typed rotation + scale (gap 6),
reference point, lock-aspect; absorbed into Properties ▸ Transform with
SmartDials.

### Stroke — `paged.stroke` ✓
Weight (length) → `frameStrokeWeight` · Colour swatch → `frameStrokeColor` ·
End-cap 3-way toggle → `frameStrokeEndCap` (TextFrame unsupported → em-dash).
**End state** — stroke type (dash/dot), join, miter, align-to-path, gap
colour as engine stroke paths grow.

### Effects — `paged.effects` ✓
Drop-shadow checkbox → `frameDropShadow`; when on: Mode (Drop/Inner), X/Y
offset, Blur size, Opacity scrub, Shadow colour → `frameDropShadow*`.
**End state** — full effects stack (feather, glow, bevel, blend modes) as
live sections.

### Frame Fitting — `paged.frame-fitting` ✓
Fit toggle (None/Proportional/Fill/FitContent) → `frameFittingType`; Crops
bounds → `frameFittingCrops`. Rectangle-only; other kinds em-dash.
**End state** — merged into the Image inspector's Fitting section (kit);
auto-fit on place; AI crop suggestion becomes real.

### Attributes — `paged.attributes` ✓
Nonprinting checkbox → `frameNonprinting` (mixed sentinel supported).
**End state** — visible/locked per frame, story direction; folded into
Properties ▸ Frame.

### Align — `paged.align` ✓
Six align buttons (L/C/R/T/M/B) + two distribute; computes target bounds and
writes a `batch` of `setElementProperty(frameBounds)` (one undo entry).
Enabled at ≥2 (align) / ≥3 (distribute) frames. Hooks: `data-align-kind`.
**End state** — align-to scope (selection/page/margins/spread), equal-spacing
inputs, key object.

### Pathfinder — `paged.pathfinder` ✓
Union / Intersect / Subtract / Exclude → `pathfinderBoolean`
(curve-preserving CSG; first selected is kept, others deleted). ≥2 frames.
**End state** — divide/outline/trim, compound path make/release.

### Inspector — `paged.inspector` ✓
Raw single-element property snapshot: every wire property rendered by value
type (bounds grid, colour picker, length scrub, 6-cell transform editor);
re-fetches after every mutation; mixed → em-dash.
**End state** — stays the developer/expert raw inspector (Window menu); user
editing lives in the curated context inspector.

### Control — `paged.control` ✓
Horizontal strip of Object/Stroke/Character/Paragraph compositions.
**End state** — likely retired (the kit's context toolbar replaced the
bottom control bar) or kept as an optional InDesign-familiar Window panel.

---

## 2 · Text & styles

### Character — `paged.character` ✓ (content scope)
Font size + Leading (length), Tracking (scrub), Fill (swatch) →
`characterFontSize/Leading/Tracking/FillColor`.
**End state** — kit Typography section: font family + style selects, kerning
(Metrics/Optical/value), baseline shift, case toggles, language. Gap 5.

### Paragraph — `paged.paragraph` ✓ (content scope, rounds to paragraphs)
Align 4-way toggle → `paragraphJustification`; Space before/after +
First-line indent (lengths).
**End state** — left/right indents, hyphenation, keep options, drop caps,
rules, tabs editor.

### Character Styles — `paged.character-styles` ✓
Apply select (`characterStyles` collection → `appliedCharacterStyle`) +
manager: "+ New" (`createCharacterStyle`), per-row delete
(`deleteCharacterStyle`).
**End state** — full style options editing, based-on chains, override
indicator + redefine, style groups.

### Paragraph Styles — `paged.paragraph-styles` ✓
Same pattern → `appliedParagraphStyle`; create/delete ops.
**End state** — as character styles + next-style chaining; powers the kit's
"Paragraph: Intro — Body" select.

### Object Styles — `paged.object-styles` ✓
Apply select (`objectStyles` → `appliedObjectStyle`, element scope).
**End state** — create/edit/delete capturing fill/stroke/effects/text-frame
options.

### Text Frame — `paged.text-frame-options` ✓
Inset spacing bounds → `frameInsetSpacing`.
**End state** — vertical justification, column count/width/gutter, auto-size
rules (the kit Frame section).

### Text Wrap — `paged.text-wrap` ✓
Mode 4-way toggle (none/bounding box/contour/jump) → `frameTextWrapMode`;
Offsets bounds → `frameTextWrapOffsets` (both share one `Option<TextWrap>`;
apply layer preserves the unset half).
**End state** — contour options, invert, master-only flag.

### Fonts — `paged.fonts` ✓ read-only
Families in use + reference counts (`fonts` collection).
**End state** — missing/embedded status (gap 4), replace-font action; feeds
the prepress "missing font" finding.

### Cell Styles / Table Styles — `paged.cell-styles` / `paged.table-styles` ✓ read-only
Style lists (`cellStyles` / `tableStyles`); apply paths are wire-shape-only
until the table NodeId surface exists.
**End state** — apply/edit once table selection + ops land (gap 8); backs
the Table Composer's part presets and the kit's table Preset chips.

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
name/model, hex, CMYK %).
**End state** — eyedropper pipeline, recents row, HSB parity; the mixer
behind every colour well.

### Gradients — `paged.gradients` ✓
Apply select (gradient ref as fill); **GradientRamp editor**: type
(linear/radial), reverse, drag stops + midpoints, click-track to add stop,
per-stop swatch select, remove stop — all `editGradient`.
**End state** — on-canvas gradient tool sync (angle/length), per-stop opacity
when the engine carries it, create-from-mixer.

### Color Groups — `paged.color-groups` ✓ read-only
Groups + member counts.
**End state** — group CRUD + filtering the Swatches list by group.

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
Read-only collection lists (index + size pt / label + page count / master +
page count).
**End state** — pages-list absorbed by Document Map; spreads gain page
membership (gap 7) and become the true grouping source; masters gain
"apply to page" (`ApplyMasterToPage`) + master editing entry.

### Links — `paged.links` ✓ read-only
Placed-image rows: filename (full URI tooltip), host kind/id.
**End state** — present/missing status, effective PPI, colourspace
(gaps 2–3), relocate/update/break actions; feeds Health "Missing Links".

### Conditions — `paged.conditions` ✓ · Condition Sets — `paged.condition-sets` ✓
Read-only: condition rows (visibility dot, indicator method) / set rows
(counts).
**End state** — visibility toggles (`SetConditionVisible`,
`ActivateConditionSet`); conditional text for Data mode.

### Articles / Hyperlinks / Bookmarks / Cross References / Index ✓ read-only
Collection lists (name + members / destination / format / sort order).
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

### Info — `paged.info` ✓ read-only
Meta rows: pages, active page, units, colour mode, name, dirty.
**End state** — stays diagnostics; user-facing equivalents live in
DocTitleBar/Health.

---

## 5 · Cockpit mode surfaces

### Publication Health — `paged.publication-health` ◐
Real metric tiles (pages/stories/frames/glyphs/links/colour mode) + X-4
readiness pill; Risks section = seam.
**End state** — all kit counts real: overset frames, missing links, low-res
images, font warnings (gaps 1–4) + accessible-PDF issues; each row jumps to
its findings.

### Preflight — `paged.preflight` ◐
"Validate output" runs a **real dry PDF export** → findings list; real links
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
