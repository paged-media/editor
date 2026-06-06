/* tslint:disable */
/* eslint-disable */
/**
 * Description of a node about to be inserted. Carries the minimal
 * Stage-1 supported field set plus `item_transform` — `RemoveNode` →
 * undo → re-insertion round-trips these reliably. (Without the
 * transform, undoing a deleteFrame snapped the frame back to the page
 * origin — the editor-suite AC-E2E-PROVE-3 finding.) Remaining
 * non-essential fields (drop_shadow, opacity, effects, …) still
 * default on re-insertion; that residue of the Stage 1 limitation
 * tightens in later stages.
 */
export type NodeSpec = { kind: "textFrame"; self_id: string; bounds: [number, number, number, number]; fill_color?: string | null; stroke_color?: string | null; stroke_weight?: number | null; item_transform?: [number, number, number, number, number, number] | null } | { kind: "rectangle"; self_id: string; bounds: [number, number, number, number]; fill_color?: string | null; stroke_color?: string | null; stroke_weight?: number | null; item_transform?: [number, number, number, number, number, number] | null } | { kind: "oval"; self_id: string; bounds: [number, number, number, number]; fill_color?: string | null; stroke_color?: string | null; stroke_weight?: number | null; item_transform?: [number, number, number, number, number, number] | null } | { kind: "graphicLine"; self_id: string; bounds: [number, number, number, number]; anchors?: PathAnchorSpec[]; subpath_starts?: number[]; subpath_open?: boolean[]; stroke_color?: string | null; stroke_weight?: number | null; item_transform?: [number, number, number, number, number, number] | null } | { kind: "polygon"; self_id: string; bounds: [number, number, number, number]; anchors?: PathAnchorSpec[]; subpath_starts?: number[]; subpath_open?: boolean[]; fill_color?: string | null; stroke_color?: string | null; stroke_weight?: number | null; item_transform?: [number, number, number, number, number, number] | null } | { kind: "cloneTranslate"; self_id: string; source: NodeId; dx: number; dy: number; destination_spread_id?: string | null };

/**
 * Editor-ops — wire mirror of `paged_parse::GradientFeatherParams`.
 * Whole-struct authoring (kind + axis + stop LIST change together;
 * `Value` has no generic list form, so the drop-shadow per-field
 * shape doesn\'t fit). The renderer already draws this effect; only
 * authoring was missing. `stop_color` round-trips faithfully but the
 * rasterizer currently consumes `alpha_pct` only.
 */
export interface GradientFeatherSpec {
    /**
     * `\"Linear\"` or `\"Radial\"`.
     */
    gradientType?: string | null;
    startPoint?: [number, number] | null;
    endPoint?: [number, number] | null;
    angleDeg?: number | null;
    stops?: GradientFeatherStopSpec[];
}

/**
 * Editor-ops — wire mirror of `paged_parse::GradientFeatherStop`
 * (the AST type predates `PartialEq`/`Tsify`; the mirror keeps the
 * op wire-shaped, the `PathAnchorSpec` precedent).
 */
export interface GradientFeatherStopSpec {
    stopColor?: string | null;
    locationPct: number;
    alphaPct: number;
    midpointPct?: number;
}

/**
 * Hint to downstream caches about what the apply touched. Lists
 * instead of a single enum so a Batch aggregates by union without
 * losing per-node detail. Consumers (renderer, glyph cache, layout
 * cache) decide which lists to honour. Stays advisory — nothing in
 * `paged-mutate` invalidates anything itself.
 */
export interface InvalidationHint {
    frameGeometry: NodeId[];
    frameStyle: NodeId[];
    textReflow: NodeId[];
    /**
     * Set when the tree shape changed (any Insert/Remove/Move).
     */
    structural: boolean;
}

/**
 * One stop of a gradient on the wire. Mirrors `GradientStopRef`.
 */
export interface GradientStopSpec {
    /**
     * `Color/<id>` reference for this stop.
     */
    stopColor: string;
    /**
     * 0..=100 position along the ramp.
     */
    locationPct: number;
    /**
     * 0..=100 midpoint to the next stop; `None` ⇒ linear (50).
     */
    midpointPct?: number | null;
}

/**
 * Phase H — address of one Bezier handle inside a `Polygon`\'s
 * `PathPointArray`. `index` is the flat anchor index across all
 * subpaths (compound polygons concatenate subpaths into one
 * `anchors` Vec; `subpath_starts` marks each contour\'s first
 * index).
 */
export interface PathPointAddress {
    index: number;
    role: PathPointRole;
}

/**
 * Phase H — which corner of a `PathAnchor` the path-point edit
 * targets: the anchor itself or one of its two Bezier handles.
 */
export type PathPointRole = "anchor" | "left" | "right";

/**
 * Result of a successful `apply`. Holds the original op, the
 * pre-computed inverse op (ready to push onto an undo stack), and
 * the invalidation hint.
 */
export interface AppliedOperation {
    op: Operation;
    inverse: Operation;
    invalidation: InvalidationHint;
}

/**
 * SDK Phase 5 (v1 sweep) — wire enum for Pathfinder ops. Mirrors
 * `pathfinder::PathfinderKind` (the internal enum used by the
 * flo_curves layer) — kept separate so the apply layer doesn\'t
 * leak `flo_curves` types onto the wire.
 */
export type PathfinderKind = "union" | "intersect" | "subtract" | "exclude";

/**
 * Stable identifier for a scene-graph node. The string payload is the
 * IDML `Self` attribute (e.g. `\"TextFrame/u14\"`) — stable for the
 * lifetime of the document. Operations reference nodes by ID, never
 * by path or index, so an Op generated on one client applies
 * meaningfully on another even after the tree has shuffled.
 *
 * Variants today cover the page-item kinds the inspector mutates plus
 * the structural containers an `InsertNode`/`MoveNode` Op can target
 * as a parent.
 */
export type NodeId = { kind: "TextFrame"; id: string } | { kind: "Rectangle"; id: string } | { kind: "Oval"; id: string } | { kind: "Polygon"; id: string } | { kind: "GraphicLine"; id: string } | { kind: "Group"; id: string } | { kind: "Spread"; id: string } | { kind: "Page"; id: string } | { kind: "Layer"; id: string } | { kind: "StoryRange"; id: { story_id: string; start: number; end: number } } | { kind: "Table"; id: { story_id: string; table_id: string } } | { kind: "TableCell"; id: { story_id: string; table_id: string; row: number; col: number } };

/**
 * Stable page identity, independent of position in the page vector.
 *
 * Derived from the IDML `<Page Self=\"...\">` attribute where present;
 * synthesised as `\"page-<spread_idx>-<local_idx>\"` when missing
 * (older / synthetic fixtures without `Self`). The canvas keys
 * display-list caches and LOD tiles by `PageId`, so the value must
 * stay stable across re-layouts — only document-structural edits
 * (insert/delete page) should ever change the set of `PageId`s.
 */
export type PageId = string;

/**
 * The canonical mutation primitive. A closed set, extended only with
 * deliberation. Collection mutations (swatches, styles) operate on the
 * document\'s `BTreeMap` palettes/stylesheets rather than the scene
 * tree, so they\'re top-level variants rather than `InsertNode`.
 */
export type Operation = { kind: "SetProperty"; node: NodeId; path: PropertyPath; value: Value } | { kind: "InsertNode"; parent: NodeId; position: number; node: NodeSpec; z_slot?: number | null } | { kind: "RemoveNode"; node: NodeId } | { kind: "MoveNode"; node: NodeId; new_parent: NodeId; position: number } | { kind: "Batch"; ops: Operation[] } | { kind: "InsertPage"; after_page_id?: string | null; master_id?: string | null; spread_self_id?: string | null; page_self_id?: string | null; restore_spread_json?: string | null } | { kind: "RemovePage"; page_id: string } | { kind: "MoveLayer"; layer_id: string; new_index: number } | { kind: "InsertLayer"; position: number; name: string; self_id?: string | null } | { kind: "RemoveLayer"; layer_id: string } | { kind: "CreateSwatch"; spec: SwatchSpec } | { kind: "EditSwatch"; swatch_id: string; spec: SwatchSpec } | { kind: "DeleteSwatch"; swatch_id: string } | { kind: "CreateParagraphStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameParagraphStyle"; style_id: string; name: string } | { kind: "DeleteParagraphStyle"; style_id: string } | { kind: "CreateCharacterStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameCharacterStyle"; style_id: string; name: string } | { kind: "DeleteCharacterStyle"; style_id: string } | { kind: "CreateObjectStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameObjectStyle"; style_id: string; name: string } | { kind: "DeleteObjectStyle"; style_id: string } | { kind: "CreateCellStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameCellStyle"; style_id: string; name: string } | { kind: "DeleteCellStyle"; style_id: string } | { kind: "CreateTableStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameTableStyle"; style_id: string; name: string } | { kind: "DeleteTableStyle"; style_id: string } | { kind: "CreateGradient"; spec: GradientSpec } | { kind: "EditGradient"; gradient_id: string; spec: GradientSpec } | { kind: "DeleteGradient"; gradient_id: string } | { kind: "CreateColorGroup"; spec: ColorGroupSpec } | { kind: "EditColorGroup"; group_id: string; spec: ColorGroupSpec } | { kind: "DeleteColorGroup"; group_id: string } | { kind: "SetStyleProperty"; collection: StyleCollection; style_id: string; path: PropertyPath; value: Value } | { kind: "PathfinderBoolean"; kept: NodeId; others: NodeId[]; opKind: PathfinderKind } | { kind: "LinkFrames"; from: string; to: string } | { kind: "UnlinkFrames"; frame: string; prev_next?: string | null } | { kind: "ApplyStyle"; story_id: string; start: number; end: number; style: string; scope: StyleScope } | { kind: "InsertField"; story_id: string; offset: number; field: FieldKind } | { kind: "DeleteField"; story_id: string; offset: number; field: FieldKind } | { kind: "InsertGuide"; spread_id: string; orientation: GuideOrientationSpec; position: number; page_index?: number; guide_id?: string | null } | { kind: "MoveGuide"; guide_id: string; position: number } | { kind: "DeleteGuide"; guide_id: string } | { kind: "SetConditionVisible"; condition: string; visible: boolean } | { kind: "ActivateConditionSet"; set: string } | { kind: "RestoreConditionVisibility"; states: [string, boolean][] } | { kind: "ApplyMasterToPage"; page: string; master?: string | null } | { kind: "DuplicatePage"; page: string; clone_spread_json?: string | null } | { kind: "InsertSection"; at_page: string; prefix?: string | null; numbering_style?: string | null; start_at?: number | null; self_id?: string | null } | { kind: "EditSection"; section_id: string; prefix?: string | null | null; numbering_style?: string | null; start_at?: number | null | null } | { kind: "DeleteSection"; section_id: string } | { kind: "SetRowHeight"; story_id: string; table_id: string; row: number; height?: number | null } | { kind: "SetColumnWidth"; story_id: string; table_id: string; col: number; width?: number | null } | { kind: "InsertTableRow"; story_id: string; table_id: string; at: number; restore?: TableLineRestoreJson | null } | { kind: "DeleteTableRow"; story_id: string; table_id: string; at: number } | { kind: "InsertTableColumn"; story_id: string; table_id: string; at: number; restore?: TableLineRestoreJson | null } | { kind: "DeleteTableColumn"; story_id: string; table_id: string; at: number };

/**
 * Track J — wire-shape mirror of `paged_parse::PathAnchor`. The
 * parse-side type doesn\'t carry `Deserialize`/`PartialEq`/`Tsify`,
 * and the mutate API needs all three so this Op crosses the wasm
 * boundary. The field shapes match exactly: `anchor` is the
 * on-curve point, `left` / `right` are the incoming / outgoing
 * Bezier handles, all in the page item\'s inner coordinate system.
 */
export interface PathAnchorSpec {
    anchor: [number, number];
    left: [number, number];
    right: [number, number];
}

/**
 * Typed payload for a `SetProperty` Op. Each variant carries a value
 * of a specific kind; the apply layer\'s `TypeMismatch` error fires if
 * the variant doesn\'t match what the path expects.
 */
export type Value = { type: "bounds"; value: [number, number, number, number] } | { type: "colorRef"; value: string | null } | { type: "length"; value: number | null } | { type: "transform"; value: [number, number, number, number, number, number] | null } | { type: "pathPoint"; value: { address: PathPointAddress; position: [number, number] } } | { type: "pathPointInsert"; value: { index: number; anchor: PathAnchorSpec; prevSubpathStarts?: number[] | null } } | { type: "pathPointRemove"; value: { index: number; prevSubpathStarts?: number[] | null } } | { type: "pathPointCurveType"; value: { index: number; smooth: boolean; prev?: PathAnchorSpec | null } } | { type: "bool"; value: boolean } | { type: "text"; value: string } | { type: "framePath"; value: { anchors: PathAnchorSpec[]; subpathStarts: number[] } } | { type: "pathOpenAt"; value: { index: number; prevAnchors?: PathAnchorSpec[] | null; prevSubpathStarts?: number[] | null; prevSubpathOpen?: boolean[] | null } } | { type: "outlineStroke"; value: { width: number; cap: string; join: string; miterLimit: number; prevAnchors?: PathAnchorSpec[] | null; prevSubpathStarts?: number[] | null; prevSubpathOpen?: boolean[] | null } } | { type: "offsetPath"; value: { delta: number; join: string; miterLimit: number; prevAnchors?: PathAnchorSpec[] | null; prevSubpathStarts?: number[] | null; prevSubpathOpen?: boolean[] | null } } | { type: "simplifyPath"; value: { tolerance: number; prevAnchors?: PathAnchorSpec[] | null; prevSubpathStarts?: number[] | null; prevSubpathOpen?: boolean[] | null } } | { type: "gradientFeather"; value: GradientFeatherSpec | null } | { type: "paragraphRule"; value: ParagraphRuleSpec | null } | { type: "tabStops"; value: TabStopSpec[] };

/**
 * Typed property path for `SetProperty` Ops. A closed enum (rather
 * than free-form `Vec<String>`) preserves Rust\'s exhaustiveness
 * guarantee inside `apply`/`invert`, and the `serde` rename lets the
 * wire format read like the dotted path the briefing illustrates
 * (`\"fill.color\"`) — so JS callers don\'t need to learn the Rust
 * enum shape.
 */
export type PropertyPath = "frameBounds" | "frameFillColor" | "frameStrokeColor" | "frameStrokeWeight" | "frameOpacity" | "frameTransform" | "imageContentTransform" | "framePathPoint" | "pathPointInsert" | "pathPointRemove" | "pathPointCurveType" | "layerVisible" | "layerLocked" | "layerPrintable" | "layerName" | "characterFontSize" | "characterLeading" | "characterTracking" | "characterFillColor" | "paragraphSpaceBefore" | "paragraphSpaceAfter" | "paragraphFirstLineIndent" | "appliedParagraphStyle" | "appliedCharacterStyle" | "appliedObjectStyle" | "appliedCellStyle" | "appliedTableStyle" | "framePath" | "frameNonprinting" | "frameFillTint" | "frameGradientFillAngle" | "frameGradientFillLength" | "frameGradientStrokeAngle" | "frameGradientStrokeLength" | "pathOpenAt" | "outlineStroke" | "offsetPath" | "simplifyPath" | "frameGradientFeather" | "pageBounds" | "frameDropShadowMode" | "frameDropShadowXOffset" | "frameDropShadowYOffset" | "frameDropShadowSize" | "frameDropShadowOpacity" | "frameDropShadowColor" | "frameDropShadow" | "frameFittingCrops" | "frameFittingType" | "frameTextWrapMode" | "frameTextWrapOffsets" | "paragraphJustification" | "frameStrokeEndCap" | "frameInsetSpacing" | "appliedConditions" | "characterFontFamily" | "characterFontStyle" | "characterKerningMethod" | "characterCase" | "characterPosition" | "characterLanguage" | "characterBaselineShift" | "characterHorizontalScale" | "characterVerticalScale" | "characterSkew" | "characterUnderline" | "characterStrikethru" | "characterLigatures" | "characterOtfFeatures" | "paragraphLeftIndent" | "paragraphRightIndent" | "paragraphDropCapCharacters" | "paragraphDropCapLines" | "paragraphHyphenation" | "paragraphKeepLinesTogether" | "paragraphKeepWithNext" | "paragraphRuleAbove" | "paragraphRuleBelow" | "paragraphTabStops" | "paragraphListType" | "paragraphBulletCharacter" | "paragraphNumberingFormat" | "textFrameColumnCount" | "textFrameColumnGutter" | "textFrameColumnBalance" | "textFrameVerticalJustification" | "textFrameAutoSizing" | "textFrameFirstBaseline" | "textWrapInvert" | "frameFittingReferencePoint" | "frameAutoFit" | "frameStrokeType" | "frameStrokeJoin" | "frameStrokeMiterLimit" | "frameStrokeAlignment" | "frameStrokeGapColor" | "frameStrokeGapTint" | "frameCornerOptionTopLeft" | "frameCornerOptionTopRight" | "frameCornerOptionBottomLeft" | "frameCornerOptionBottomRight" | "frameCornerRadiusTopLeft" | "frameCornerRadiusTopRight" | "frameCornerRadiusBottomLeft" | "frameCornerRadiusBottomRight" | "frameRotationAngle" | "frameScaleX" | "frameScaleY" | "frameFlipH" | "frameFlipV" | "frameOverprintFill" | "frameOverprintStroke" | "frameInnerShadowEnabled" | "frameInnerShadowBlendMode" | "frameInnerShadowColor" | "frameInnerShadowOpacity" | "frameInnerShadowAngle" | "frameInnerShadowDistance" | "frameInnerShadowSize" | "frameInnerShadowChoke" | "frameInnerShadowNoise" | "frameOuterGlowEnabled" | "frameOuterGlowBlendMode" | "frameOuterGlowColor" | "frameOuterGlowOpacity" | "frameOuterGlowSpread" | "frameOuterGlowSize" | "frameOuterGlowNoise" | "frameInnerGlowEnabled" | "frameInnerGlowBlendMode" | "frameInnerGlowColor" | "frameInnerGlowOpacity" | "frameInnerGlowChoke" | "frameInnerGlowSize" | "frameInnerGlowSource" | "frameInnerGlowNoise" | "frameBevelEnabled" | "frameBevelStyle" | "frameBevelTechnique" | "frameBevelDepth" | "frameBevelDirection" | "frameBevelSize" | "frameBevelSoften" | "frameBevelAngle" | "frameBevelAltitude" | "frameBevelHighlightColor" | "frameBevelShadowColor" | "frameBevelHighlightOpacity" | "frameBevelShadowOpacity" | "frameSatinEnabled" | "frameSatinBlendMode" | "frameSatinColor" | "frameSatinOpacity" | "frameSatinAngle" | "frameSatinDistance" | "frameSatinSize" | "frameSatinInvert" | "frameFeatherEnabled" | "frameFeatherWidth" | "frameFeatherCornerType" | "frameFeatherNoise" | "frameFeatherChoke" | "frameDirectionalFeatherEnabled" | "frameDirectionalFeatherLeftWidth" | "frameDirectionalFeatherRightWidth" | "frameDirectionalFeatherTopWidth" | "frameDirectionalFeatherBottomWidth" | "frameDirectionalFeatherAngle" | "frameDirectionalFeatherNoise" | "frameDirectionalFeatherChoke" | "frameBlendMode" | "nextTextFrame" | "previousTextFrame" | "cellFillColor" | "cellFillTint" | "cellInsetTop" | "cellInsetLeft" | "cellInsetBottom" | "cellInsetRight" | "cellVerticalJustification";

/**
 * W0.2 — wire mirror of `paged_parse::TabStop`. The `ParagraphTabStops`
 * path replaces the paragraph\'s whole `<TabList>` in one op; `Value`
 * has no per-element list-edit form, so the UI sends the full new
 * stop list (the gradient-feather stop-list precedent).
 */
export interface TabStopSpec {
    position: number;
    alignment?: string | null;
    alignmentCharacter?: string | null;
    leader?: string | null;
}

/**
 * W0.2 — wire mirror of `paged_parse::styles::ParagraphRule` (the
 * AST type predates `Tsify`; the mirror keeps the op wire-shaped,
 * the `GradientFeatherSpec` precedent). Carries every field the
 * parser models so the whole-struct `ParagraphRuleAbove` /
 * `ParagraphRuleBelow` paths round-trip a paragraph\'s rule verbatim.
 */
export interface ParagraphRuleSpec {
    on?: boolean | null;
    color?: string | null;
    tint?: number | null;
    weight?: number | null;
    offset?: number | null;
    leftIndent?: number | null;
    rightIndent?: number | null;
    width?: string | null;
}

/**
 * W0.5 — character- vs paragraph-level style application for
 * [`Operation::ApplyStyle`].
 */
export type StyleScope = "paragraph" | "character";

/**
 * W0.5 — the kind of field marker inserted by
 * [`Operation::InsertField`]. Extensible; v1 implements `PageNumber`
 * (the IDML auto current-page-number marker, U+E018).
 */
export type FieldKind = "pageNumber" | "nextPageNumber";

/**
 * W0.5 — wire mirror of `paged_parse::GuideOrientation`
 * (which is `Deserialize` but lives in the parse crate; kept here so
 * the operation wire type doesn\'t depend on the parser\'s
 * serialization shape).
 */
export type GuideOrientationSpec = "vertical" | "horizontal";

/**
 * Which style collection a `SetStyleProperty` targets.
 */
export type StyleCollection = "paragraph" | "character" | "object" | "cell" | "table";

/**
 * Wire description of a colour group, mirroring `ColorGroupEntry`.
 */
export interface ColorGroupSpec {
    selfId?: string | null;
    name?: string | null;
    /**
     * `Color/<id>` (or `Swatch/<id>`) member refs, in order.
     */
    members?: string[];
}

/**
 * Wire description of a gradient swatch, mirroring `GradientEntry`.
 */
export interface GradientSpec {
    selfId?: string | null;
    name?: string | null;
    /**
     * `Type`: `\"Linear\"` | `\"Radial\"`.
     */
    kind: string;
    stops: GradientStopSpec[];
}

/**
 * Wire-format description of a colour swatch (`<Color>`), mirroring
 * the editable fields of `paged_parse::ColorEntry` with primitive,
 * `Deserialize`-able types (the AST `ColorEntry` is `Serialize`-only).
 * Carried by the swatch-collection mutations so create / edit /
 * delete-undo are lossless. `space` / `model` / `alternate_space` are
 * the IDML attribute strings (`ColorSpace::as_attr` etc.).
 */
export interface SwatchSpec {
    /**
     * IDML `Self` id. `None` on create ⇒ the apply layer assigns a
     * deterministic non-colliding `Color/u<n>`.
     */
    selfId?: string | null;
    name?: string | null;
    /**
     * `Space` attribute: `\"CMYK\"` | `\"RGB\"` | `\"LAB\"` | `\"Gray\"`.
     */
    space: string;
    /**
     * Channel values in `space` (4 for CMYK, 3 for RGB/Lab, 1 for Gray).
     */
    value: number[];
    /**
     * `Model`: `\"Process\"` (default) | `\"Spot\"`.
     */
    model?: string | null;
    alternateSpace?: string | null;
    alternateValue?: number[];
    tint?: number | null;
    alpha?: number | null;
}


export class Inspector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Apply an Operation. `op_json` is the wire form of
     * `paged_mutate::Operation`. Returns the wire form of
     * `AppliedOperation` on success.
     */
    apply(op_json: string): string;
    /**
     * Open an IDML by bytes.
     */
    constructor(idml: Uint8Array);
    /**
     * Return property descriptors for a node. `node_json` matches
     * `NodeIdJson` (e.g. `{"kind":"TextFrame","id":"TextFrame/u1"}`).
     */
    properties(node_json: string): string;
    /**
     * Redo the most recently undone op. Symmetric to `undo`.
     */
    redo(): string;
    /**
     * Render a page as PNG bytes. Requires the `render` feature.
     */
    renderPage(page_index: number, dpi: number): Uint8Array;
    /**
     * Return the inspector tree as a JSON string.
     */
    tree(): string;
    /**
     * Undo the most recent op. Returns the resulting
     * `AppliedOperation` (whose `op` is the inverse that just
     * ran) as JSON, or the literal `"null"` when the undo stack
     * is empty.
     */
    undo(): string;
}

export function on_start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_inspector_free: (a: number, b: number) => void;
    readonly inspector_apply: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_new: (a: number, b: number) => [number, number, number];
    readonly inspector_properties: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_redo: (a: number) => [number, number, number, number];
    readonly inspector_renderPage: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_tree: (a: number) => [number, number, number, number];
    readonly inspector_undo: (a: number) => [number, number, number, number];
    readonly on_start: () => void;
    readonly qcms_enable_iccv4: () => void;
    readonly qcms_profile_precache_output_transform: (a: number) => void;
    readonly qcms_transform_data_bgra_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_bgra_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgb_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgb_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgba_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgba_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_release: (a: number) => void;
    readonly qcms_profile_is_bogus: (a: number) => number;
    readonly qcms_white_point_sRGB: (a: number) => void;
    readonly lut_inverse_interp16: (a: number, b: number, c: number) => number;
    readonly lut_interp_linear16: (a: number, b: number, c: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
