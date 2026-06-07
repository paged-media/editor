# Panel reference — current state & target end-state

> **Status moved to paged-media/state.** The ✓/◐/○ glyphs below are the
> 2026-06-05 audit snapshot and are NO LONGER maintained here — the
> canonical per-panel status lives in the registry
> (`state/registry/features/editor-panels.yaml`, ids `editor.panels.*`)
> and on the dashboard: https://state.paged.media (Matrix → area
> `editor`). Status changes are registry PRs, never edits to this file
> (CLAUDE-state-block rule 3). This document remains the panel
> ARCHITECTURE + end-state reference: composition/binding mechanics,
> per-panel end-state targets, and the engine-gap analysis.

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
> The _end state_ column is the product target derived from the design-system
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
collapses multi-selection to a uniform value or an em-dash _mixed_ sentinel,
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

| Kind                                | Shown sections                                              |
| ----------------------------------- | ----------------------------------------------------------- |
| Text (content selection)            | Character + Paragraph compositions                          |
| Image (element with `hasImage`)     | Object Transform + Frame fitting + Stroke                   |
| Frame (other element)               | Object Transform + Stroke                                   |
| Page (rail steer, nothing selected) | Page summary (real page count + size; margins/bleed = seam) |
| none                                | guidance hint                                               |

The gallery's selection sub-header ("Frame · 1 frame" / "Text selection")
renders under the title with the overset alert chip as a seam (em-dash until
gap 1). AI Assistant card renders below every populated inspector (visible,
inert). Hooks: `data-properties-panel`, `data-inspector-kind`,
`data-properties-section`, `data-selection-label`, `data-overset-seam`.

**End state** — the kit's full per-type inspectors: **Text** adds font
family/style selects, kerning, the violet overset banner
(_"8 % overset · 18 words hidden"_), frame columns/language rows; **Image**
adds SmartDial transforms (scale/rotation/opacity), link status, effective
PPI, colourspace, alt text; **Page** adds margins/bleed/columns, parent
master, production status; a **Table** variant appears when table selection
lands. AI card becomes functional (diagnose → propose → apply with impact
note). Gaps: 1, 2, 3, 5, 6, 8, 9.

### Object — `paged.object-transform` ✓ (gallery card) — W2.3 live 2026-06-06

Bespoke: **X/Y + W/H rows are LIVE derived projections over
`frameBounds`** (translate preserving size / resize anchored top-left);
Opacity metric → `frameOpacity`. W2.3 (protocol v28, decompose gap 6/16
closed): Rotation SmartDial → `frameRotationAngle` (deg); Scale X/Y →
`frameScaleX`/`frameScaleY` (multiplier; UI shows percent); Flip H button →
`frameFlipH`. Read = decomposed components of `item_transform`; write
recomposes. All apply to every path kind + Group. Seams: reference-point
grid (no transform-anchor convention), lock-aspect, and **Flip V** —
`frameFlipV` is WRITE-only on the v28 wire (the read-side reflects
`frameFlipH` only), so it would em-dash on read.
**End state** — `frameFlipV` read-side + reference-point convention land;
lock-aspect; absorbed into Properties ▸ Transform.

### Stroke — `paged.stroke` ✓ (gallery card) — W2.2 live 2026-06-06

Live (protocol v28, engine gap 17 closed bar dash-array + arrowheads):
Weight → `frameStrokeWeight`; Colour swatch → `frameStrokeColor`; Type select
→ `frameStrokeType` (the built-in `StrokeStyle/$ID/{Solid,Dashed,Dotted}`
refs the renderer maps to a dash pattern); Cap segments → `frameStrokeEndCap`;
Join segments → `frameStrokeJoin` (`{Miter,Round,Bevel}EndJoin`); Miter →
`frameStrokeMiterLimit`; Align segments → `frameStrokeAlignment`
(`{Center,Inside,Outside}Alignment`); Gap colour swatch → `frameStrokeGapColor`
(mirrors the stroke-colour swatch binding); Gap tint → `frameStrokeGapTint`.
Join / Miter / Align are Rectangle-only parse fields — they em-dash on
TextFrame / Oval / Polygon / GraphicLine (same kind-specific honesty as Cap).
The enum-string selects carry the RAW IDML strings the canvas read-side
returns, so they reflect + round-trip. Seam: the collapsed "Dashes & arrows"
disclosure (dash-pattern editor + start/end arrowhead selects) — no
`frameStrokeDashArray` or arrowhead PropertyPath on the v28 wire.
**End state** — custom dash-pattern array + arrowheads as those engine paths
land.

### Effects — `paged.effects` ✓ (gallery effect-row stack) — W2.2 live 2026-06-06

Live (protocol v28, engine gap 18 closed): Opacity → `frameOpacity`; object
Blend select → `frameBlendMode` (InDesign `BlendMode` enum strings). The
EFFECTS list ships eight live per-effect disclosures (the drop-shadow
enabled-pill + violet-railed per-field template, generalised): **Drop shadow**
(enable `frameDropShadow`; Mode/X/Y/Blur/Colour/Opacity → `frameDropShadow*`),
**Inner shadow**, **Outer glow**, **Inner glow** (+source), **Bevel and
emboss** (style/technique/depth/direction/size/soften/angle/altitude/
highlight+shadow colour+opacity), **Satin** (+invert), **Feather**
(width/corner/noise/choke), **Directional feather** (4 widths/angle/noise/
choke). Each non-drop family enables via `frame{Family}Enabled`; the apply arm
materialises a default effect struct on enable so the per-field editors have a
target. Enum-string fields carry the IDML strings (blend modes, bevel
style/technique/direction, inner-glow source EdgeGlow/CenterGlow, feather
corner Sharp/Rounded/Diffusion). Seam: shadow Spread (no `frameDropShadowSpread`
path).
**End state** — the per-target selector (Object/Stroke/Fill/Text), isolate
blending / knockout, global light.

### Frame Fitting — `paged.frame-fitting` ✓ (gallery card) — W2.3 live 2026-06-06

Fit text segments (None/Fill/Fit/Content) → `frameFittingType`; Crop row4 →
`frameFittingCrops`. W2.3 (protocol v28): reference-point grid →
`frameFittingReferencePoint` (bespoke; the 3×3 row-major cell index ↔ the raw
IDML `FittingAlignment` anchor string — `{Top,Center,Bottom}{Left,Center,
Right}Point`); Auto-fit pill → `frameAutoFit` (Bool). Rectangle-only — every
field is a `NodeId::Rectangle` apply arm, so other kinds em-dash. Seam:
fill-frame-proportionally (place-time behaviour, no PropertyPath).
**End state** — merged into the Image inspector's Fitting section (kit);
auto-fit on place; AI crop suggestion becomes real.

### Attributes — `paged.attributes` ✓ (gallery check rows) — W2.3 live 2026-06-06

Nonprinting pill → `frameNonprinting`; W2.3 (protocol v28) Overprint pair →
`frameOverprintFill` / `frameOverprintStroke` (Bool; mixed sentinel
supported). Kind coverage: OverprintStroke on every stroked kind,
OverprintFill on every filled kind (TextFrame / Rectangle / Oval / Polygon —
NOT GraphicLine); a kind without the PropertyEntry em-dashes the pill. Seams:
Visible/Locked pills (layer-level today), gap colour well.
**End state** — visible/locked per frame, story direction; folded into
Properties ▸ Frame.

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

### Character — `paged.character` ✓ (content scope, gallery card) — W2.1 live 2026-06-06

Live (protocol v28, gaps 5/11 closed): Family (bespoke select over the
`fonts` collection → `characterFontFamily`), Style → `characterFontStyle`,
Size/Leading/Tracking → `characterFontSize/Leading/Tracking`, Kerning →
`characterKerningMethod`, Baseline → `characterBaselineShift`, H/V scale +
Skew → `characterHorizontalScale/VerticalScale/Skew`, Case (ab/AB/Ab) →
`characterCase`, Position segments → `characterPosition`, Underline /
Strikethrough / Ligatures → `characterUnderline/Strikethru/Ligatures`,
Language → `characterLanguage`, Fill → `characterFillColor`. Seam: the
bespoke OPENTYPE chip row (Liga/Frac/Ordn/OldS) — `characterOtfFeatures`
is an opaque feature-tag string with no per-chip mapping.
**End state** — OpenType tag-string editor over `characterOtfFeatures`.

### Paragraph — `paged.paragraph` ✓ (content scope, gallery card) — W2.1 live 2026-06-06

Live (protocol v28, gap 12 closed): Align glyph segments →
`paragraphJustification`; L/R/1st indents →
`paragraphLeftIndent/RightIndent/FirstLineIndent`; Space before/after →
`paragraphSpaceBefore/After`; Drop cap (chars/lines) →
`paragraphDropCapCharacters/Lines`; Hyphenate → `paragraphHyphenation`;
Keep lines together / Keep with next →
`paragraphKeepLinesTogether/KeepWithNext`; Paragraph rules disclosure
(bespoke whole-struct `Value::ParagraphRule`) → `paragraphRuleAbove/Below`
(pill on/off, null clears). Seam: Align to baseline grid (no matching
PropertyPath on the v28 wire).
**End state** — baseline-grid path; tabs in the Tabs panel.

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

### Text Frame — `paged.text-frame-options` ✓ (gallery card) — W2.3 live 2026-06-06

Live: inset row4 grid → `frameInsetSpacing`. W2.3 (protocol v28, engine gap
13 closed): Columns count/gutter → `textFrameColumnCount` (clamped ≥1) /
`textFrameColumnGutter`; Balance pill → `textFrameColumnBalance`; Vert. justify
glyph segments → `textFrameVerticalJustification` (`{Top,Center,Bottom,
Justify}Align`); Auto-size select → `textFrameAutoSizing` (`Off | HeightOnly |
WidthOnly | HeightAndWidth | HeightAndWidthProportionally`); First baseline
select → `textFrameFirstBaseline` (`AscentOffset | CapHeight | XHeight |
EmBoxHeight | LeadingOffset | FixedHeight`). All are **TextFrame-only** parse
fields — no PropertyEntry on Rectangle / Oval / Polygon / GraphicLine, so every
control em-dashes on those kinds. Enum-string selects carry the RAW IDML
strings the read-side returns, so they reflect + round-trip; an unset field
reads `Value::Text("")`.
**End state** — column auto-balance refinement; min-first-baseline metric.

### Text Wrap — `paged.text-wrap` ✓ (gallery card) — W2.3 live 2026-06-06

Live: Wrap glyph segments → `frameTextWrapMode`; Offset row4 →
`frameTextWrapOffsets`; W2.3 (protocol v28) Invert pill → `textWrapInvert`
(Bool; note the wire name is `textWrapInvert`, not `frameTextWrapInvert`). All
three share one `Option<TextWrap>` field — the apply layer preserves the unset
members (mode / offsets / invert). Applies to every wrap-capable kind
(TextFrame / Rectangle / Oval / Polygon / GraphicLine). Seams: Wrap-to (side)

- Contour-source selects — no PropertyPath on the v28 wire.
  **End state** — contour-source options, wrap-to-side, master-only flag.

### Fonts — `paged.fonts` ✓ (gallery card) — W2.12 2026-06-06

All / In use / Missing filter tabs over the families-in-use rows
(`fonts` collection; All ≡ In use today). Each row carries a **status
dot** (green resolved / red substituted) + a `missing` badge; the
**Missing tab filters on `FontSummary.isMissing`** (gap 4) with a live
count, falling back to the "no missing fonts" state when all resolve.
**End state** — replace-font action; the panel already feeds the
prepress "missing font" finding + Health's "Missing fonts" count.

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

### Color Wheel — `paged.color-wheel` ✓ _(new, fully live)_

The brand kit's colour wheel as a panel: conic HSV disc + value track,
HEX·RGB·CMYK·HSL synced fields (naive client-side conversions; the
CMM-accurate path stays `colorCompute`), six colour-theory harmonies drawn
on the wheel; "Add to Swatches" lands the harmony palette as real swatches
through ONE batched `createSwatch` (single undo). Linked from the Color
panel ("Open color wheel").
**End state** — done; gains eyedropper + document-palette seeding later.

### Color Groups — `paged.color-groups` ✓ _(now live CRUD)_

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

### Document Map — `paged.document-map` ◐ _(kit: design/review LEFT panel)_ — W2.12 2026-06-06

Search filter · real spread tree (`spreads` collection walked in document
order) with live page-snapshot thumbnails + per-page margin/column readout
(`PageSummary` gap 10) · click → fit camera · **named section chips**
(`sections` collection — prefix/range/numbering, click → jump) · **"Add
section"** rides the real v28 `insertSection` Operation (undoable) ·
**Publication Health footer** with real metrics + live risk counts
(overset stories / missing links / missing fonts) + PDF/X-4 pill.
**End state** — kit screenshot exactly: per-section **status chips**
(Approved/In Review/Comments — collaboration), drag-reorder sections,
section prefix/numbering editing (`editSection`).

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

### Links — `paged.links` ✓ (gallery ListRows) — W2.12 2026-06-06

Glyph rows (filename, filter at >8 rows) with the W0.6 wire summaries:
**status dot** (`LinkSummary.status` ok/missing) + `missing` badge,
**colourspace + effective PPI** on the mono secondary line, and a
`lo-res` badge below the 150-ppi convention (gaps 2–3). Seam toolbar
(update/relink/go-to) until those Operations ship.
**End state** — relocate/update/break actions; the panel already feeds
Health's "Missing links" + "Low-res images" counts.

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

### Publication Health — `paged.publication-health` ◐ — W2.12 2026-06-06

Real metric tiles (pages/stories/frames/glyphs/links/colour mode) + X-4
readiness pill; the Risks section now renders **live counts** (gaps 1–4):
overset stories (`DocumentStats.overset_stories`), missing links
(`LinkSummary.status`), low-res images (`effectivePpi` < 150), missing
fonts (`FontSummary.isMissing`), and last-export preflight findings by
severity (the shared findings store). A clean count shows 0 + an OK
check; the preflight row stays a seam until Validate output runs.
**End state** — each non-zero row jumps to its findings; accessible-PDF
issues join once tagged-PDF preflight lands.

### Preflight — `paged.preflight` ◐ — W2.12 2026-06-06

"Validate output" runs a **real dry PDF export**; the structured
`PreflightFinding{code,severity,page_index}` (gap 20) ride the
`pdfExported` reply into the shared findings store and render as
**Errors / Warnings groups**, each finding a **jump target** (click →
`navigateToPages([pageIndex])`, the Document-Map/filmstrip hand-off).
Clean docs show the "no findings" affordance; real links inventory;
PPI/bleed checks = seam. Older wasm with no structured findings falls
back to the flat-string Warnings cards.
**End state** — output profile selector, live re-validation, canvas
issue markers (error/warn/a11y pins), per-finding fix actions.

### Output readiness — `paged.output-readiness` ◐ — W2.6 2026-06-07

PDF/X-4 checklist, now honest-or-live per row. **LIVE** (the same W0.6 wire
summaries Preflight/Health read): CMYK working space (`meta.cmykProfileActive`),
**All fonts available** (`FontSummary.isMissing` count), **All links present**
(`LinkSummary.status === "missing"` count), **Images ≥ 150 PPI**
(`LinkSummary.effectivePpi`). Each shows a check/x icon + a mono detail
(`"ok"` / `"N missing"` / `"N low-res"`); the X-4 pill is the AND of the live
verdicts. **HONEST seam**: Bleed 3 mm (no bleed-coverage accessor on the wire).
Hooks: `data-readiness-row`, `data-readiness-pass`, `data-seam`.
**End state** — jump-to-fix per row; bleed flips live when the engine grows a
bleed accessor; colour section reads live profile/intent/ink limit.

### Export Center — `paged.export-center` ✓ _(export-mode canvas main)_ — W2.6 2026-06-07

Kit centred readiness table, now **honest-or-live for every row** (six outputs).
**LIVE** through the published client surface, each with a real per-row
"Export…" action: **Print PDF (PDF/X-4)** (readiness from working space; opens
the live `ExportPdfDialog`), **Page images (PNG)** (`client.requestSnapshot` →
real PNG bytes per page, downloaded; DPI/scope from the inspector's inline
settings), **IDML package** (`client.exportIdml` → real `.idml`, downloaded —
the same bytes as File ▸ Save As IDML). **HONEST seams** ("soon", disabled):
Web bundle / Social crops / Print package; Fix-issues / Save-preset stay seams.
Row selection syncs the Outputs nav + Export inspector via the shared store;
"Export selected" runs the selected LIVE target. Hooks: `data-export-target`,
`data-export-live`, `data-cockpit-action="export-center-<id>"`,
`data-status-pill="readiness-<id>"`.
**End state** — the seam targets become real with the multi-format publishing
pipeline; checkbox batch export, saved presets, preflight-gated readiness.

### Outputs — `paged.outputs` ✓ · Export settings — `paged.export-inspector` ✓ — W2.6 2026-06-07

Left target nav (six rows; per-target readiness dot — `data-output-dot`,
`data-output-live`) + right per-target inspector with **inline per-target
settings driving the live action**: the **image** target carries a real
DPI (72/150/300) + scope (all/current page) select, persisted under
`paged.export.image.v1`, feeding `runImageExport`; the **PDF** target opens the
dialog (where its richer settings live); the **IDML** target a one-click run.
HONEST targets show the "Coming soon" pill + concept copy, no run button.
Hooks: `data-output-nav`, `data-export-inspector-panel`,
`data-export-image-settings`, `data-cockpit-action="export-inspector-run-*"`.
**End state** — per-target presets/profiles, batch select, as each remaining
pipeline lands.

### Stories — `paged.stories` ◐ · Story inspector — `paged.story-inspector` ◐ — W2.12 2026-06-06

Real **story list** off the `paged.stories()` script host (there is no
`"stories"` document collection on the wire — `StorySummary` is
script-host-only): one row per story with character + paragraph counts,
an **overset badge** (`StorySummary.overset`, gap 1), and click →
content selection at the story head. Words/approval = seam.
**End state** — kit Content mode inspector (words, language-expansion
risk, comments, approval). Needs a `stories` collection accessor +
collaboration; word count on the wire.

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

### Tabs — `paged.tabs` ✓ — W2.4 live 2026-06-06

A live ruler-style **whole-list** stop editor over the v28
`paragraphTabStops` path (`Value::TabStops(TabStopSpec[])`, the
gradient-feather stop-list precedent — `Value` has no per-element
list-edit form, so each change commits the full new stop list in one
`setElementProperty`, undoable). Add/remove/reorder stops; per-stop
position, alignment (L/C/R/Decimal → `LeftAlign`/`CenterAlign`/
`RightAlign`/`CharacterAlign`), leader string, and align-on character
(decimal stops). The marker ruler lights the live positions.
Content-scope; the apply layer rounds the StoryRange to whole
paragraphs.
**Target** — repeat-tab + drag-on-ruler authoring polish.

### Glyphs — `paged.glyphs` ◐ _(partially live)_ — W2.12 2026-06-06

With an active text caret the glyph grid **inserts via the real
`insertText` mutation** (undoable); recently-used grid is panel-local.
The **Font family select is fed real families** from the `fonts`
collection and scopes the grid's preview font. Seams: Show scope +
per-style face select (no style faces on the wire — `FontSummary` is
family-only).
**Target** — full character map, OpenType-feature filter, alternates
flyout, glyph sets.

### Bullets & Numbering — `paged.bullets-numbering` ◐ _(partially live)_ — W2.4 2026-06-06

List type segments (None/Bullet/Number → `paragraphListType` IDML enum
`NoList`/`BulletList`/`NumberedList`), the bullet glyph
(`paragraphBulletCharacter`) and the numbering-format expression
(`paragraphNumberingFormat`, e.g. `^#.^t`) are **live** over the v28
list-authoring text paths (content-scope, paragraph-rounded; one mutate
per commit). Seams: list definition / level / numbering-style picker /
char style / restart / position + the static preview (await a
list-definition surface on the paragraph model).
**Target** — full list definitions (named lists, level nesting, restart
scope, position) on the paragraph model.

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
   inspector banner, AI problem line, canvas marker. _(W0.6/W2.12: wire-
   side DONE — `DocumentStats.overset_stories` + `StorySummary.overset`
   drive Health's "Overset stories", the Stories overset badge; residual =
   per-frame canvas marker + inspector banner.)_
2. **`LinkSummary` status + colourspace** — missing links, image inspector.
   _(W0.6/W2.12: `status` + `colorspace` consumed by the Links panel
   (status dot, missing badge, colourspace line) + Health "Missing links".)_
3. **Effective PPI** for placed images — low-res findings, image inspector.
   _(W0.6/W2.12: `LinkSummary.effectivePpi` drives the Links `lo-res`
   badge + Health "Low-res images" (< 150 ppi); fixtures omit the attr.)_
4. **`FontSummary` missing/embedded flag** — font warnings. _(W0.6/W2.12:
   `isMissing` consumed — Fonts Missing tab/dot/badge + Health "Missing
   fonts". `embedded` intentionally not on the wire.)_
5. **`characterFontFamily/Style/Kerning` property paths** — text inspector
   font selects.
6. **Rotation/scale decompose primitive** — typed transform dials.
7. **`SpreadSummary` page membership** — true spread grouping.
8. **Table selection + table/cell ops** — table toolbar, Table Composer,
   cell/table style apply.
9. **`stories` / `sections` collections** — story list, Document Map
   sections. _(W2.12: `sections` collection consumed by the Document-Map
   chips + `insertSection`; the story list reads the `paged.stories()`
   script host — a true `stories` collection accessor is still pending.)_
10. **Page margin/bleed/column reads** — page inspector geometry. _(W0.6/
    W2.12: `PageSummary` margins/columns surfaced in the Document-Map
    spread-row meta; bleed still pending in the page inspector.)_

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
    align-to-path, gap colour, arrowheads. _(W2.2: type/join/miter/align/gap
    live on `frameStroke*`; residual = custom dash-array + arrowheads.)_
18. **Effects architecture** — per-target selector (Object/Stroke/Fill/
    Text), blend modes, three feather types, glow/bevel/satin models,
    isolate blending, knockout, global light. _(W2.2: object blend +
    inner-shadow/outer-glow/inner-glow/bevel/satin/feather/directional-
    feather per-field editors live; residual = per-target selector, isolate/
    knockout, global light, shadow spread.)_
19. **Page sections & numbering** — section marker/prefix/style, start
    number, shuffle toggles (extends 9's sections). \_(W2.12: `insertSection`
    wired from the Document Map's Add-section button; section chips show
    prefix/range/numbering. Residual = `editSection` prefix/start authoring
    - shuffle toggles.)\_
20. **Structured preflight findings** — severity + page refs on export
    diagnostics (drives the Errors/Warnings groups + jump-to). _(W2.12:
    `PreflightFinding{code,severity,pageIndex}` consumed by the Preflight
    panel (severity groups + page jump) + Health's preflight count. NOTE:
    `client.exportPdf` surfaces only `diagnostics`; the structured
    `findings` are captured off the `pdfExported` broadcast — a typed
    `findings` return on the client helper is the clean follow-up.)_
21. **Tab stops** — per-paragraph stop table (the Tabs panel). _(W2.4:
    DONE — `paragraphTabStops` whole-list read/write; the Tabs panel is
    a live ruler-style stop editor.)_
22. **List definitions** — bullets & numbering model (the B&N panel).
    _(W2.4: list type + bullet glyph + numbering format live via the
    `paragraphListType`/`paragraphBulletCharacter`/`paragraphNumberingFormat`
    text paths; residual = named list definitions, level nesting, restart
    scope, position.)_
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
