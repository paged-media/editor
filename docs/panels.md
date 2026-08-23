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
**End state** — density/trapping when export consumes them.

### Separations & Ink Limit — `paged.separations` ✓

§21 advanced prepress, ink-coverage third. Press ink-limit presets
(sheet-fed/web/uncoated/newsprint); **swatch** ink-limit audit from
`SwatchSummary.totalAreaCoveragePct` (exact palette arithmetic — no render,
no profile, resolution-free); the job's plate list and per-page coverage from
the `inkCoverage` collection (max/mean TAC, per-plate area + max tint, TAC
histogram so the limit re-thresholds without a re-render); page rows jump the
canvas.

Two honest seams, both load-bearing:
- `separationAvailable === false` → no CMYK working profile is active, so the
  renderer resolved every swatch to display RGB and no plate exists. Rendered
  distinctly from "this page is all RGB artwork" — both read 0% measured and
  mean different things.
- Plate-isolated **preview on the canvas is NOT wired**. The canvas renders
  through Vello/WebGPU, which keeps no page-level ink-plane state; only the CPU
  rasterizer does. The engine can isolate plates
  (`paged-inspect --separations DIR --cmyk-profile PROFILE`, unmeasured pixels
  left transparent); the canvas cannot, and the panel says so instead of
  showing a second differently-rendered image.

**End state** — a WGSL separation pass (or a CPU-rasterised plate overlay) so
the canvas can isolate a plate; density/trapping data.

### Colour Settings — `paged.color-settings` ✓

CMYK profile select + .icc upload (`registerColorProfile`), rendering intent,
black-point compensation (`setColorSettings`); soft-proof on/off + profile +
paper-white (`setProofSetup`).
**End state** — essentially done; RGB working space/policies if added.

---

## 4 · Structure & navigation

### Document Map — `paged.document-map` ◐ _(kit: design/review LEFT panel)_ — W2.7 2026-06-07

Search filter · real spread tree (`spreads` collection walked in document
order) with live page-snapshot thumbnails + per-page margin/column readout
(`PageSummary` gap 10) · click → fit camera · **named section chips**
(`sections` collection — prefix/range/numbering, click → jump) · **"Add
section"** rides the real v28 `insertSection` Operation (undoable) ·
**Publication Health footer** with real metrics + live risk counts
(overset stories / missing links / missing fonts) + PDF/X-4 pill.
**Per-page status chips** (gaps 2–4): the **missing-links chip** is REAL
and per-page — each missing `LinkSummary` (status `"missing"`) names its
host frame (`hostSelfId`/`hostKind`), which `elementGeometry` resolves to
a `pageId`, so the count is bucketed per page; clicking the chip jumps to
that page. **Overset** and **missing-fonts** can't be attributed to a
page over the current wire (`StorySummary.overset` is per-story with no
story→page map; `FontSummary` carries no host attribution), so they
render as a single **honest seam chip** on the first page marking the
document-level signal ("overset: doc-level" / "fonts: doc-level") with a
tooltip naming the missing read — not a per-page claim. **Master applied**
per page is also unattributable (`PageSummary` exposes no `appliedMaster`)
→ no chip, noted as a follow-up.
**End state** — once the wire attributes per-page: real overset / missing-
font / applied-master chips per page; plus per-section **status chips**
(Approved/In Review — collaboration), drag-reorder sections, section
prefix/numbering editing (`editSection`).

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

### Stories — `paged.stories` ◐ · Story inspector — `paged.story-inspector` ◐ — W2.7 2026-06-07

Real **story list** off the live `stories` collection (`StorySummary` —
`useCollection("stories")`, refetched on every Operation push): one row
per story with character + paragraph counts, an **overset badge**
(`StorySummary.overset`, gap 1), and click → content selection at the
story head. Selecting a row opens the **per-story field inspector**
(gaps 9/10): the four honest `StorySummary` reads — story id,
**characters**, **paragraphs**, **overset** (with an Overset/Fits
StatusPill) — all live (they track edits because the inspector reads the
same refetched collection). The kit's richer fields are **honest seams**
that name the missing wire read: **frame chain / threading topology**
(no story→frame map; `StorySummary` carries no frame ids and
`nextTextFrame`/`previousTextFrame` are reachable only from a known
frame), **word count** (no word-count or story-text read), **first-
paragraph preview** (no story-text read). The inspector is read-only by
design — a story carries no rename Operation on the wire.
**End state** — kit Content mode inspector (words, language-expansion
risk, comments, approval). Needs, on the wire: a `frameChain` accessor
keyed by story id, a `wordCount` (or story-text read), a story-text /
paragraph-preview accessor; plus collaboration for approval/comments.

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

### Table — `paged.table` ✓ — W3.A2 live 2026-06-06; v2 (W2.11) 2026-06-07

LIVE against the protocol-v35 table surface. A click into a table cell
sets the selection (`HitResult.tableContext` → `TableSelectionContext`);
the panel drives the **selected cell**. All values read back via
`elementProperties(cell|table)` and re-fetch on every Operation push.

- **selected cell** — row/column index + `tableRowCount × tableColumnCount`
  totals (the Table NodeId carries them as integer-as-Length).
- **row & column** — `setRowHeight` / `setColumnWidth` (write-forward, no
  read entry); `insertTableRow` / `deleteTableRow` / `insertTableColumn` /
  `deleteTableColumn` at the selected index.
- **header & footer (v35)** — `insertHeaderRow` / `removeHeaderRow` /
  `insertFooterRow` / `removeFooterRow`. Header/footer rows count toward
  `tableRowCount`, so the panel shows the live **Total rows** read; the
  per-control header/footer counts beside the buttons are the panel-applied
  delta (the engine exposes **no** separate header/footer count read —
  seam). Hooks: `data-header-count`, `data-footer-count`,
  `data-table-total-rows`.
- **merge & split (v35)** — `setCellSpan {rowSpan, columnSpan}`: Merge 2×2,
  Split (1×1), and per-axis span inputs. Span has **no** read-back path on
  the cell properties surface, so the span inputs are write-forward (seed
  1×1 on each fresh cell selection, reflect the last applied span); the
  rendered cell geometry grows over the wire and undo restores it. Hook:
  `data-cell-span`.
- **cell** — fill colour (`cellFillColor`), insets ×4
  (`cellInset{Top,Left,Bottom,Right}`), vertical justify
  (`cellVerticalJustification`).
- **cell strokes (v35)** — per-edge colour / weight / tint for top / bottom
  / left / right (`cell{Top,Bottom,Left,Right}EdgeStroke{Color,Weight,Tint}`),
  with full read-back. Hooks: `data-edge-color-select`,
  `data-num-input="edge-weight-*"`, `data-num-input="edge-tint-*"`.
- **applied styles** — `appliedCellStyle` (on the cell) / `appliedTableStyle`
  (on the Table NodeId), each over its real *Styles collection.

**Cell text (v35)** — live: with the Type tool, a click into a cell carries
the hit's `tableContext`; the selection rides the v35 `ContentSelection.cell`
qualifier (cell-local offsets), the caret renders **in** the cell, and
typing/Backspace/Delete edit the cell's stream — routed through the SAME
caret/typing path body text uses (`canvas-panel` onHit → `ContentSelection.cell`
→ `useTextEditing`, which forwards the qualifier onto every `insertText` /
`deleteRange` and the caret-nav queries). Undo restores. Specs:
`table-ops.spec.ts` (v1) + `tables-v2.spec.ts` (spans / header rows /
edge strokes / cell-text).

Hooks: `data-table-panel`, `data-table-cell-address`, `data-table-dims`,
`data-cell-fill-select`, `data-cell-vjustify-select`, `data-cell-span`.
**Target** — visual span-drag merge gesture; a table descriptor read
exposing header/footer counts + cell span read-back (the two write-forward
seams above).

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

### Bullets & Numbering — `paged.bullets-numbering` ◐ _(partially live)_ — W2.4 2026-06-06; W2.10 list definitions 2026-06-07

List type segments (None/Bullet/Number → `paragraphListType` IDML enum
`NoList`/`BulletList`/`NumberedList`), the bullet glyph
(`paragraphBulletCharacter`) and the numbering-format expression
(`paragraphNumberingFormat`, e.g. `^#.^t`) are **live** over the v28
list-authoring text paths (content-scope, paragraph-rounded; one mutate
per commit). **W2.10 (protocol v35, engine gap 22)** adds the named
**list-definitions manager** on the W1.22 `NumberingList` surface: the
document's `<NumberingList>` resources read from the `numberingLists`
collection (one row each); **create** (`createNumberingList`) / inline
**rename** + **delete** (`editNumberingList` / `deleteNumberingList`,
each carrying a `NumberingListSpec`); a per-row **continuity toggle**
binds `continueAcrossStories` (the flag the renderer reads for
cross-story numbering continuity — restart-per-story when off); and an
**Assign** button applies the list to the selected paragraphs through
`paragraphAppliedNumberingList` (content scope, `Value::Text` = the
list selfId), active only with a content caret. Undo round-trips every
op. **Honest seam — the applied list cannot be reflected per
paragraph**: `paragraphAppliedNumberingList` is **write-only** on the
v35 wire (the paragraph property snapshot carries NO read-back entry),
so the panel labels Assign as a forward command. Remaining seams: Level
/ numbering-style picker / char style / restart scope / position + the
static preview (await a per-paragraph list-LEVEL model).
**Target** — per-paragraph list level + restart scope + position, the
numbering-style picker (1,2,3 vs i,ii,iii), and a `paragraphApplied
NumberingList` READ accessor so the assigned list reflects per paragraph.

### Anchored Object — `paged.anchored` ✓ _(new, live)_ — W2.12 2026-06-07

LIVE on the W1.16 anchored-object surface (protocol v35). A frame
anchored into a text story carries an `<AnchoredObjectSetting>`, which
the canvas read-side surfaces as **ten `anchored*` PropertyEntries** on
the element snapshot. The panel **detects an anchored selection by the
presence of those entries** (a non-anchored page frame's snapshot
carries NONE of them — verified on the `anchored.idml` fixture), reads
back the live values and drives the position. Element-scope
`setElementProperty` over: **Mode** → `anchoredPosition`
(`InlinePosition` / `AboveLine` / `Anchored`); **Spine relative** →
`anchoredSpineRelative` (Bool); **Lock position** →
`anchoredLockPosition` (Bool); and — enabled only in the custom
(`Anchored`) mode — **X/Y offset** → `anchoredXOffset` /
`anchoredYOffset` (Length pt); **Anchor point** → `anchorPoint` (the
9-cell `{Top,…,Bottom}{Left,Center,Right}Anchor`); **H/V reference** →
`anchoredHorizontalReference` / `anchoredVerticalReference` (the latter
including the **W1.16 line-ref metrics** — `LineBaseline` / `LineAscent`
/ `LineXheight` / `TopOfLeading` / `EmBoxBottom`, which the renderer
resolves against real line metrics); **H/V align** →
`anchoredHorizontalAlignment` / `anchoredVerticalAlignment`. The
enum-string selects carry the RAW IDML strings the read-side returns,
so they reflect + round-trip; in inline / above-line mode the
custom-position controls disable honestly (InDesign hides them there).
Undo round-trips. **For a non-anchored (or empty) selection the panel
states it honestly** — a status header ("Object is not anchored" /
"Select a single object") and no fake-enabled controls. NOTE: the
anchored frame is nested in the text flow, so it has **no page-level
`elementGeometry`** — its rendered placement is observed through its
HOST frame's region (the geometry-move spec asserts the host repaints).
Specs: `anchored-panel.spec.ts` (detection + read-back + honest non-
anchored state) + `e2e/anchored-ops.spec.ts` (read-back → mode +
offsets land → host-frame render moves → undo byte-identical).
**Target** — a visual on-canvas anchor handle/leader; once the wire
grows a page-level geometry accessor for inline-anchored objects, a
direct rect read; the InDesign "object anchor" badge on the host line.

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
   drive Health's "Overset stories", the Stories overset badge + the Story
   inspector's Overset/Fits pill. W2.7 residual: overset is per-story with
   NO story→page (or story→frame) map, so the Document-Map per-page chip
   is an honest doc-level seam — a per-story/per-frame PAGE attribution
   read would flip it to a real per-page chip + canvas marker.)_
2. **`LinkSummary` status + colourspace** — missing links, image inspector.
   _(W0.6/W2.12: `status` + `colorspace` consumed by the Links panel
   (status dot, missing badge, colourspace line) + Health "Missing links".
   W2.7: the Document-Map per-page MISSING-LINKS chip resolves each missing
   link's host frame to a page via `elementGeometry` — real per-page
   attribution, click → jump.)_
3. **Effective PPI** for placed images — low-res findings, image inspector.
   _(W0.6/W2.12: `LinkSummary.effectivePpi` drives the Links `lo-res`
   badge + Health "Low-res images" (< 150 ppi); fixtures omit the attr.)_
4. **`FontSummary` missing/embedded flag** — font warnings. _(W0.6/W2.12:
   `isMissing` consumed — Fonts Missing tab/dot/badge + Health "Missing
   fonts". `embedded` intentionally not on the wire. W2.7: `FontSummary`
   carries NO host/page attribution, so the Document-Map per-page font
   chip is an honest doc-level seam — per-page font usage on the wire
   would flip it to a real per-page chip.)_
5. **`characterFontFamily/Style/Kerning` property paths** — text inspector
   font selects.
6. **Rotation/scale decompose primitive** — typed transform dials.
7. **`SpreadSummary` page membership** — true spread grouping.
8. **Table selection + table/cell ops** — table toolbar, Table Composer,
   cell/table style apply. _(W3.A2/W2.11: LIVE — table-cell selection +
   the v30 line ops + the v35 header/footer/span ops + per-cell edge
   strokes + in-cell text editing all ship in the Table panel; residual
   seams = header/footer count read + cell-span read-back + a visual
   span-drag merge gesture.)_
9. **`stories` / `sections` collections** — story list, Document Map
   sections. _(W2.12: `sections` collection consumed by the Document-Map
   chips + `insertSection`. W3.A2/W2.7: the `stories` collection accessor
   IS live — the Stories panel reads `useCollection("stories")` for the
   list AND the per-story field inspector. Residual: `StorySummary` is
   four scalar fields (id/chars/paras/overset); the inspector's frame-
   chain / word-count / first-paragraph fields are honest seams pending a
   `frameChain` (story→frames), a `wordCount`, and a story-text /
   paragraph-preview read keyed by story id.)_
10. **Page margin/bleed/column reads** — page inspector geometry. _(W0.6/
    W2.12: `PageSummary` margins/columns surfaced in the Document-Map
    spread-row meta; bleed still pending in the page inspector. W2.7: the
    Document-Map APPLIED-MASTER per-page chip is unbacked — `PageSummary`
    exposes no `appliedMaster`; an `appliedMaster` field would add it.)_

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
    text paths. W2.10 (protocol v35, W1.22): the **named NumberingList
    surface** is live — the `numberingLists` collection + the
    create/edit/delete CRUD ops + `continueAcrossStories` continuity +
    assign via `paragraphAppliedNumberingList`. Residual: a
    `paragraphAppliedNumberingList` READ accessor (it is write-only
    today), per-paragraph list LEVEL nesting, restart scope, and
    position.)_
23. **Export metadata** — per-object alt text/role/conversion + per-style
    HTML/CSS/PDF tagging (Object Export Options, Export Tagging).
24. **Tint swatch children** + mixed-ink swatches (Swatches parity).
25. **Condition ops** — `SetConditionVisible`, `ActivateConditionSet`;
    **master apply** — `ApplyMasterToPage`; **page duplicate**.
26. **Anchored objects** — `<AnchoredObjectSetting>` position model (the
    Anchored Object panel). _(W2.12 (protocol v35, W1.16): LIVE — the ten
    `anchored*` PropertyPaths (`anchoredPosition`/`anchorPoint`/
    `anchoredXOffset`/`anchoredYOffset`/`anchored{Horizontal,Vertical}
    Reference` incl. the line-ref metrics/`anchored{Horizontal,Vertical}
    Alignment`/`anchoredSpineRelative`/`anchoredLockPosition`) read +
    write + undo; anchored rendering resolves real line-ref metrics.
    Residual: inline-anchored frames carry NO page-level `elementGeometry`
    (observed only through the host frame), and there is no on-canvas
    anchor handle/leader yet.)_

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
