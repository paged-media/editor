/* tslint:disable */
/* eslint-disable */

export type MainToWorker = MainToWorkerKind & {
    seq: number;
    protocol: ProtocolVersion;
};

export type WorkerToMain = WorkerToMainKind & {
    seq: number | null;
    protocol: ProtocolVersion;
};


/**
 * A byte buffer that crosses the message channel. Wraps `Vec<u8>`
 * so transferable-via-`postMessage` semantics are explicit at call
 * sites; the wasm crate decides whether to clone or transfer based
 * on whether the value is the JS-side `Uint8Array` or a Rust-side
 * `Vec`. The wire form is whatever serde produces for `Vec<u8>` —
 * JSON renders an array of numbers; future binary protocols (CBOR
 * / messagepack) render a real bytes blob without code change.
 */
export type ByteBuf = number[];

/**
 * A content-space mutation. Phase 1 carries the *envelope* only —
 * the worker rejects each variant with `WorkerError::NotImplemented`.
 * Phase 3 lights these up incrementally.
 */
export type Mutation = { op: "insertText"; args: { storyId: string; offset: number; text: string } } | { op: "deleteRange"; args: { storyId: string; start: number; end: number } } | { op: "applyStyle"; args: { storyId: string; start: number; end: number; style: string; scope: StyleScope } } | { op: "insertField"; args: { storyId: string; offset: number; field: FieldKind } } | { op: "moveFrame"; args: { frameId: string; transform: [number, number, number, number, number, number] } } | { op: "resizeFrame"; args: { frameId: string; bounds: [number, number, number, number] } } | { op: "linkFrames"; args: { from: string; to: string } } | { op: "unlinkFrames"; args: { frame: string } } | { op: "insertPage"; args: { afterPageId: PageId | null; masterId: string | null } } | { op: "deletePage"; args: { pageId: PageId } } | { op: "resizePage"; args: { pageId: PageId; bounds: [number, number, number, number] } } | { op: "insertFrame"; args: { pageId: PageId; bounds: [number, number, number, number] } } | { op: "insertTextFrame"; args: { pageId: PageId; bounds: [number, number, number, number] } } | { op: "deleteFrame"; args: { frameId: string } } | { op: "insertLine"; args: { pageId: PageId; start: [number, number]; end: [number, number] } } | { op: "insertPath"; args: { pageId: PageId; anchors: PathAnchorSpec[]; open: boolean; smooth?: boolean } } | { op: "setDocumentDefaults"; args: { fillColor: string | null; strokeColor: string | null; strokeWeight: number | null } } | { op: "setColorSettings"; args: { cmykProfileName: string | null; rgbPolicy: string | null; intent: string | null; bpc: boolean | null } } | { op: "setProofSetup"; args: { profileName: string | null; simulatePaperWhite?: boolean; intent: string | null } } | { op: "importSwatchLibrary"; args: { bytes: number[]; groupName?: string | null } } | { op: "setInkSetting"; args: { spotId: string; convertToProcess?: boolean; aliasTo?: string | null } } | { op: "setUseStandardLabForSpots"; args: { enabled: boolean } } | { op: "pathPointInsert"; args: { elementId: ElementId; index: number; anchor: PathAnchorSpec; prevSubpathStarts?: number[] | null } } | { op: "pathPointRemove"; args: { elementId: ElementId; index: number } } | { op: "pathOpenAt"; args: { elementId: ElementId; index: number } } | { op: "outlineStroke"; args: { elementId: ElementId; width: number; cap: string; join: string; miterLimit: number } } | { op: "offsetPath"; args: { elementId: ElementId; delta: number; join: string; miterLimit: number } } | { op: "simplifyPath"; args: { elementId: ElementId; tolerance: number } } | { op: "createGroup"; args: { memberIds: ElementId[] } } | { op: "dissolveGroup"; args: { groupId: string } } | { op: "setPluginMetadata"; args: { elementId: ElementId; key: string; value?: string | null } } | { op: "pathPointCurveType"; args: { elementId: ElementId; index: number; smooth: boolean } } | { op: "pathPointSet"; args: { elementId: ElementId; index: number; role: PathPointRole; position: [number, number] } } | { op: "batch"; args: { ops: Mutation[] } } | { op: "layerSetVisible"; args: { layerId: string; visible: boolean } } | { op: "layerSetLocked"; args: { layerId: string; locked: boolean } } | { op: "layerSetPrintable"; args: { layerId: string; printable: boolean } } | { op: "layerSetName"; args: { layerId: string; name: string } } | { op: "layerMove"; args: { layerId: string; newIndex: number } } | { op: "layerInsert"; args: { position: number; name: string } } | { op: "layerRemove"; args: { layerId: string } } | { op: "setElementProperty"; args: { elementId: ElementId; path: PropertyPath; value: Value } } | { op: "pathfinderBoolean"; args: { kept: ElementId; others: ElementId[]; kind: PathfinderKind } } | { op: "createSwatch"; args: { spec: SwatchSpec } } | { op: "editSwatch"; args: { swatchId: string; spec: SwatchSpec } } | { op: "deleteSwatch"; args: { swatchId: string } } | { op: "createGradient"; args: { spec: GradientSpec } } | { op: "editGradient"; args: { gradientId: string; spec: GradientSpec } } | { op: "deleteGradient"; args: { gradientId: string } } | { op: "createColorGroup"; args: { spec: ColorGroupSpec } } | { op: "editColorGroup"; args: { groupId: string; spec: ColorGroupSpec } } | { op: "deleteColorGroup"; args: { groupId: string } } | { op: "createParagraphStyle"; args: { selfId?: string | null; name?: string | null; basedOn?: string | null } } | { op: "renameParagraphStyle"; args: { styleId: string; name: string } } | { op: "deleteParagraphStyle"; args: { styleId: string } } | { op: "createCharacterStyle"; args: { selfId?: string | null; name?: string | null; basedOn?: string | null } } | { op: "renameCharacterStyle"; args: { styleId: string; name: string } } | { op: "deleteCharacterStyle"; args: { styleId: string } } | { op: "createObjectStyle"; args: { selfId?: string | null; name?: string | null; basedOn?: string | null } } | { op: "renameObjectStyle"; args: { styleId: string; name: string } } | { op: "deleteObjectStyle"; args: { styleId: string } } | { op: "createCellStyle"; args: { selfId?: string | null; name?: string | null; basedOn?: string | null } } | { op: "renameCellStyle"; args: { styleId: string; name: string } } | { op: "deleteCellStyle"; args: { styleId: string } } | { op: "createTableStyle"; args: { selfId?: string | null; name?: string | null; basedOn?: string | null } } | { op: "renameTableStyle"; args: { styleId: string; name: string } } | { op: "deleteTableStyle"; args: { styleId: string } } | { op: "setStyleProperty"; args: { collection: StyleCollection; styleId: string; path: PropertyPath; value: Value } } | { op: "insertOval"; args: { pageId: PageId; bounds: [number, number, number, number] } } | { op: "insertGuide"; args: { spreadId: string; orientation: GuideOrientationSpec; position: number; pageIndex?: number } } | { op: "moveGuide"; args: { guideId: string; position: number } } | { op: "deleteGuide"; args: { guideId: string } } | { op: "setConditionVisible"; args: { condition: string; visible: boolean } } | { op: "activateConditionSet"; args: { set: string } } | { op: "applyMasterToPage"; args: { page: PageId; master?: string | null } } | { op: "duplicatePage"; args: { page: PageId } } | { op: "insertSection"; args: { atPage: PageId; prefix?: string | null; numberingStyle?: string | null; startAt?: number | null } } | { op: "editSection"; args: { sectionId: string; prefix?: string | null | null; numberingStyle?: string | null; startAt?: number | null | null } } | { op: "deleteSection"; args: { sectionId: string } } | { op: "setRowHeight"; args: { storyId: string; tableId: string; row: number; height?: number | null } } | { op: "setColumnWidth"; args: { storyId: string; tableId: string; col: number; width?: number | null } } | { op: "insertTableRow"; args: { storyId: string; tableId: string; at: number } } | { op: "deleteTableRow"; args: { storyId: string; tableId: string; at: number } } | { op: "insertTableColumn"; args: { storyId: string; tableId: string; at: number } } | { op: "deleteTableColumn"; args: { storyId: string; tableId: string; at: number } };

/**
 * Aftercare-A — `RequestWordBounds` reply payload. Story-local byte
 * offsets of the `[start, end)` span the word (or whitespace run)
 * containing the requested offset covers. Same address space as
 * [`LineBounds`] and `HitResult.offset_within_story`.
 */
export interface WordBounds {
    /**
     * Story byte offset of the word\'s first character.
     */
    start: number;
    /**
     * Story byte offset just past the word\'s last character.
     */
    end: number;
}

/**
 * Axis the snap line guides. `X` is a vertical guide (snaps the x
 * coordinate); `Y` is a horizontal guide (snaps the y coordinate).
 */
export type SnapAxis = "x" | "y";

/**
 * B-04 — creation spec for a page-item group. Members are NodeIds
 * of LEAF page items (flat groups in v1; nesting is a follow-up);
 * the apply layer resolves them to `FrameRef`s, orders them by
 * current document order, and performs the `frames_in_order`
 * surgery so z-order is provably unchanged. `self_id` follows the
 * page-item `u<hex>` convention (minted when absent; echoed
 * resolved in the applied op so the wire reports `createdId`).
 */
export interface GroupSpec {
    selfId?: string | null;
    members: NodeId[];
}

/**
 * B-06 — `RequestNearestPathPoint` reply payload. Coordinates are
 * in the element\'s local space (the `PathAnchors` space).
 */
export interface NearestPathPointResult {
    /**
     * Flat index of the segment\'s START anchor.
     */
    segStart: number;
    /**
     * Flat index of the segment\'s END anchor (wraps to the subpath
     * start on a closing segment).
     */
    segEnd: number;
    /**
     * Curve parameter on that segment, 0..=1.
     */
    t: number;
    point: [number, number];
    distance: number;
}

/**
 * Canonical selection / caret. `start == end` is a caret;
 * `start < end` is a range. Endpoints are normalised so `start ≤
 * end` always holds (use `Side` to recover direction information
 * elsewhere if needed).
 */
export interface ContentSelection {
    storyId: string;
    start: number;
    end: number;
    /**
     * Downstream affinity bit. See module docs.
     */
    affinity?: boolean;
}

/**
 * Coarse LOD tiers requested by the navigator + canvas (per spec §4.4).
 */
export type LodTier = "snapshot" | "midRes" | "live";

/**
 * Concept 2 — full gradient detail: the stop table the ramp
 * editor mutates and the chips render. Stops carry the swatch REF
 * (gradients reference swatches, never inline colours — edits to a
 * component swatch propagate, spot stops survive to Separation at
 * export) plus a display-resolved hex for painting the ramp.
 */
export interface GradientDetail {
    selfId: string;
    name: string;
    /**
     * \"linear\" | \"radial\" | \"unknown\".
     */
    kind: string;
    stops: GradientStopWire[];
}

/**
 * Concept 2 — one ink row for the Ink Manager: a spot swatch\'s
 * identity + its OUTPUT-TIME settings. Converting to process or
 * aliasing never edits the swatch itself (AC-8) — these are
 * separations decisions consumed by Concept 3\'s export encoding
 * (and, for `useStandardLabForSpots`, by the preview resolver).
 */
export interface InkSummary {
    /**
     * The spot swatch\'s `Color/<id>`.
     */
    spotId: string;
    /**
     * The ink/colourant name (the swatch name — for spots this IS
     * the colourant identity).
     */
    name: string;
    convertToProcess: boolean;
    /**
     * Output as another ink\'s plate (`Color/<id>` of the alias
     * target). `None` = own plate.
     */
    aliasTo: string | null;
}

/**
 * Concept 2 — one resolved gradient stop.
 */
export interface GradientStopWire {
    /**
     * `Color/<id>` reference — the model identity.
     */
    stopColorRef: string;
    /**
     * Display-resolved `#rrggbb` via the active CMM (ramp render).
     */
    resolvedRgbHex: string;
    /**
     * 0..=100 position along the ramp.
     */
    locationPct: number;
    /**
     * 0..=100 blend midpoint toward the NEXT stop; `None` = 50.
     */
    midpointPct: number | null;
}

/**
 * Concept 3 — PDF export options as the dialog sends them. Every
 * field is optional/defaulted so the wire stays forward-compatible;
 * the worker maps it onto `paged_export_pdf::ExportOptions`.
 */
export interface ExportPdfWireOptions {
    /**
     * \"pdf17\" (default) | \"pdfx4\".
     */
    standard?: string | null;
    /**
     * Output-intent profile NAME, resolved against the worker\'s
     * registered profile registry. `None` ⇒ the active working
     * space profile.
     */
    outputIntentProfile?: string | null;
    /**
     * Human-readable output condition for the OutputIntent dict.
     */
    outputCondition?: string | null;
    /**
     * \"preserveNumbers\" (default) | \"convertToDestination\".
     */
    colorPolicy?: string | null;
    /**
     * 0-based inclusive page range; both `None` = all pages.
     */
    pageFrom?: number | null;
    pageTo?: number | null;
    cropMarks?: boolean;
    registrationMarks?: boolean;
    colorBars?: boolean;
    pageInfo?: boolean;
    marksOffsetPt?: number | null;
    /**
     * Bleed override in pt (top, inside/left, bottom,
     * outside/right); `None` = the document\'s declared bleed.
     */
    bleedOverridePt?: [number, number, number, number] | null;
    /**
     * Resample images above this effective ppi; `None` = never.
     */
    downsamplePpi?: number | null;
    /**
     * Raster resolution for effect soft-mask stamps (default 150).
     */
    effectDpi?: number | null;
    /**
     * \"outline\" (default) | \"fail\".
     */
    restrictedFontPolicy?: string | null;
    /**
     * Document title for Info/XMP.
     */
    title?: string | null;
}

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
 * Direction for [`caret_nav`].
 */
export type CaretDirection = "up" | "down";

/**
 * Discriminated payload of a `WorkerToMain` message.
 */
export type WorkerToMainKind = { kind: "ready"; payload: { protocol: ProtocolVersion } } | { kind: "documentLoaded"; payload: DocumentHandle } | { kind: "loadFailed"; payload: { error: LoadError } } | { kind: "mutationFailed"; payload: { error: WorkerError } } | { kind: "displayListReady"; payload: { pageId: PageId; lod: LodTier; commands: number; layoutGeneration: number; numberingGeneration: number } } | { kind: "hitResult"; payload: HitResult } | { kind: "pagesDirty"; payload: { pageIds: PageId[] } } | { kind: "storyDirty"; payload: { storyId: string } } | { kind: "warning"; payload: { kind: string; details: string } } | { kind: "stats"; payload: DocumentStats } | { kind: "snapshotReady"; payload: SnapshotPng } | { kind: "snapshotFailed"; payload: { error: SnapshotError } } | { kind: "mutationApplied"; payload: { clientSeq: number; appliedSeq: number; pageIds: PageId[]; cacheStats: LayoutCacheStats; createdId?: ElementId | null; pageStructureChanged?: boolean; pageSizesPt?: [number, number][] | null } } | { kind: "selectionGeometry"; payload: { rects: SelectionRect[] } } | { kind: "caretGeometry"; payload: { caret: CaretGeometry | null } } | { kind: "caretNavResult"; payload: { offset?: number | null } } | { kind: "lineBoundsResult"; payload: { bounds?: LineBounds | null } } | { kind: "wordBoundsResult"; payload: { bounds?: WordBounds | null } } | { kind: "undoApplied"; payload: { undoneSeq: number; appliedSeq: number; pageIds: PageId[]; cacheStats: LayoutCacheStats; pageStructureChanged?: boolean; pageSizesPt?: [number, number][] | null } } | { kind: "redoApplied"; payload: { redoneSeq: number; appliedSeq: number; pageIds: PageId[]; cacheStats: LayoutCacheStats; pageStructureChanged?: boolean; pageSizesPt?: [number, number][] | null } } | { kind: "fontRegistered"; payload: { family: string } } | { kind: "fontRegistryCleared" } | { kind: "colorProfileRegistered"; payload: { name: string } } | { kind: "elementSelectionApplied"; payload: { ids: ElementId[] } } | { kind: "marqueeHits"; payload: { ids: ElementId[] } } | { kind: "elementGeometry"; payload: { items: ElementGeometryItem[] } } | { kind: "groupLeaves"; payload: { ids: ElementId[] } } | { kind: "pathAnchors"; payload: { result: PathAnchorsResult | null } } | { kind: "nearestPathPoint"; payload: { result: NearestPathPointResult | null } } | { kind: "layers"; payload: { items: LayerSummary[] } } | { kind: "collectionReply"; payload: { name: CollectionName; items: any } } | { kind: "documentMetaReply"; payload: { meta: DocumentMeta } } | { kind: "colorPreviewReply"; payload: { result: ColorPreview | null } } | { kind: "colorComputeReply"; payload: { rgbHex: string; cmyk: [number, number, number, number] | null; outOfGamut: boolean } } | { kind: "gradientDetailReply"; payload: { result: GradientDetail | null } } | { kind: "swatchLibraryExported"; payload: { aseBytes: number[] } } | { kind: "exportPdfBegun"; payload: { session: number; pageCount: number } } | { kind: "exportPdfProgress"; payload: { session: number; done: number; total: number } } | { kind: "pdfExported"; payload: { pdfBytes: number[]; diagnostics: string[]; findings?: PreflightFinding[] } } | { kind: "exportPdfCancelled"; payload: { session: number } } | { kind: "exportPdfFailed"; payload: { error: string } } | { kind: "idmlExported"; payload: { idmlBytes: number[] } } | { kind: "exportIdmlFailed"; payload: { error: string } } | { kind: "elementProperties"; payload: { result: ElementProperties | null } } | { kind: "sceneTree"; payload: { roots: SceneTreeNode[] } } | { kind: "scriptResult"; payload: { output: string[]; error: string | null } } | { kind: "gestureBegun"; payload: { handle: GestureHandle } } | { kind: "gestureUpdated"; payload: { handle: GestureHandle; pageIds: PageId[]; snapLines?: SnapLine[] } } | { kind: "gestureCommitted"; payload: { handle: GestureHandle; appliedSeq: number; pageIds: PageId[]; cacheStats: LayoutCacheStats } } | { kind: "gestureCancelled"; payload: { handle: GestureHandle; pageIds: PageId[] } } | { kind: "gestureFailed"; payload: { error: GestureFailure } } | { kind: "attachReady"; payload: { gpuActive: boolean; sceneCacheBudget: number } } | { kind: "gestureSnapLines"; payload: { snapLines: SnapLine[] } } | { kind: "resolutionDone"; payload: ResolutionResult };

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
 * Element address the user can select OR a `SetElementProperty`
 * mutation can target. The first six variants are page items
 * (selection state holds these); `StoryRange` is the half-open
 * character range that character / paragraph property writes
 * address. Selection state today never holds `StoryRange` (the
 * text-side caret + range live in `ContentSelection`); the
 * variant exists so the apply layer can be reached via the
 * existing `Mutation::SetElementProperty` wire shape — see
 * `docs/paged/sdk-implementation-plan.md` §3c.1 ADR.
 */
export type ElementId = { kind: "textFrame"; id: string } | { kind: "rectangle"; id: string } | { kind: "oval"; id: string } | { kind: "polygon"; id: string } | { kind: "graphicLine"; id: string } | { kind: "group"; id: string } | { kind: "storyRange"; id: { story_id: string; start: number; end: number } } | { kind: "table"; id: { story_id: string; table_id: string } } | { kind: "tableCell"; id: { story_id: string; table_id: string; row: number; col: number } };

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
 * Hit-test result.
 */
export interface HitResult {
    frameId: string | null;
    storyId: string | null;
    offsetWithinStory: number | null;
    /**
     * Selected frame\'s bounding box in page-local coordinates.
     * AABB of the transformed corners. Returned for back-compat with
     * callers that only want a quick rectangle.
     */
    frameBounds: FrameBounds | null;
    /**
     * Phase A — typed element identifier, the new canonical handle.
     * `frame_id` is kept as the raw-id alias for back-compat with
     * callers that haven\'t migrated.
     */
    element?: ElementId | null;
    /**
     * Phase A — the element\'s raw `GeometricBounds` (content-box
     * space). Combine with `item_transform` to draw an oriented
     * selection chrome on the main thread without re-deriving the
     * math. `[top, left, bottom, right]`.
     */
    bounds?: [number, number, number, number] | null;
    /**
     * Phase A — composed affine `[a, b, c, d, tx, ty]` on the hit
     * element. `None` for items with no `ItemTransform`.
     */
    itemTransform?: [number, number, number, number, number, number] | null;
    /**
     * Phase A — containing group ancestry, outer-most first. Empty
     * when the hit element is not nested in any group.
     */
    groupChain?: string[];
    /**
     * W3.A1 — table cell context when the point landed inside a cell
     * of the hit frame\'s story. `None` for non-table hits. Carries
     * `(tableId, row, col)` so the canvas can select / mutate the cell
     * without a second query.
     */
    tableContext?: TableHitContext | null;
}

/**
 * How a `SetElementSelection` request combines with the current set.
 * Mirrors the canonical macOS / industry convention:
 * - `Replace` — plain click; selection becomes the request.
 * - `Add` — Shift-click; union (already-selected ids stay).
 * - `Toggle` — Cmd/Ctrl-click; ids already in the set are removed,
 *   ids not in the set are added.
 */
export type SelectionMode = "replace" | "add" | "toggle";

/**
 * Inspector P1 — one node in the scene tree. Children are nested
 * (Spread → Page → Group? → frame leaf). `kind` is a short label
 * the panel renders (\"Spread\", \"Page\", \"TextFrame\", \"Group\", …).
 */
export interface SceneTreeNode {
    /**
     * Element id when the node is selectable (frames, groups). For
     * Spread / Page rows that don\'t address into the gesture spine,
     * `None`.
     */
    id?: ElementId | null;
    kind: string;
    /**
     * Human-readable label. For frames falls back to the kind + raw
     * id; for pages uses the parsed `<Page Name>`.
     */
    label: string;
    children?: SceneTreeNode[];
}

/**
 * Inspector P1 — one row of the inspector. `path` is the
 * `PropertyPath` discriminant (camelCase). `value` mirrors the
 * `Value` wire shape so the panel can pass it through to
 * `Mutation::SetElementProperty` without re-encoding.
 *
 * SDK Phase 3 — `value` is `Option<Value>` (was `Value`). `None`
 * signals \"mixed / indeterminate\" — a `NodeId::StoryRange` whose
 * `CharacterRun`s carry conflicting values for this path returns
 * `None` so the binding renderer can show a placeholder (em-dash)
 * rather than picking an arbitrary winner. For frame-level reads
 * the value is always `Some(_)`.
 */
export interface PropertyEntry {
    path: PropertyPath;
    value?: Value | null;
}

/**
 * Inspector P1 — typed property snapshot for one element. The
 * Inspector panel maps each entry to the right typed editor:
 * bounds → `BoundsInput`, transform → 6-cell matrix, colour ref →
 * `ColorPicker`, length → `LengthInput`, etc.
 */
export interface ElementProperties {
    id: ElementId;
    kind: string;
    /**
     * Optional human-readable name (frame label, layer name, …) when
     * the underlying type carries one.
     */
    name?: string | null;
    entries: PropertyEntry[];
}

/**
 * Lightweight serialisable variant — the canvas worker hands this
 * (encoded as a `WorkerToMain` message) to the main thread. The
 * `rgba` payload becomes a PNG so the main thread can stash it in
 * an `<img>` or `ImageBitmap` without per-byte serialisation cost.
 */
export interface SnapshotPng {
    pageId: PageId;
    widthPx: number;
    heightPx: number;
    layoutGeneration: number;
    numberingGeneration: number;
    pngBytes: number[];
}

/**
 * Modifier state captured on each pointer event. `shift` constrains
 * the gesture (snap rotation to 15°, lock aspect on resize / scale).
 * `alt` resizes from centre.
 *
 * `disable_snap` (Ctrl) makes the snap pass an identity transform on
 * the delta — InDesign-style \"temporarily disable snap\" affordance
 * per plan-2 §8.4. Optional on the wire so older callers keep
 * compiling (defaults to `false`).
 */
export interface GestureModifiers {
    shift: boolean;
    alt: boolean;
    disableSnap?: boolean;
}

/**
 * Numeric facts about an anchor\'s position. Phase H ships only
 * `page_number`; later phases populate the rest.
 */
export interface AnchorPosition {
    /**
     * 1-based page number, formatted via the section\'s numbering
     * format. Phase H uses Arabic numerals only.
     */
    pageNumber: number;
    /**
     * Stable page id where the anchor lives. Lets callers map
     * directly to LOD-cache tile keys without another lookup.
     */
    pageId: PageId | null;
    /**
     * Reserved for chapter / section / figure / footnote counters
     * once Phase 2 wires them. Empty today.
     */
    counters: Map<string, number>;
    /**
     * Heading text — the paragraph\'s concatenated `<Content>` text,
     * stripped of trailing whitespace. Empty for non-heading
     * anchors. Phase 2 outline + badge UI uses this directly.
     */
    text?: string;
    /**
     * Heading level (1..6) for `HeadingParagraph` anchors; 0 for
     * other anchor kinds. Lets the outline panel render
     * hierarchical indentation without re-walking the scene\'s
     * anchor table.
     */
    level?: number;
}

/**
 * One active snap line surfaced to the overlay. `position` is in
 * page-local pt on `page_id`.
 */
export interface SnapLine {
    axis: SnapAxis;
    position: number;
    pageId: PageId;
}

/**
 * One entry in the field diff: a field whose resolved text
 * changed between resolution iterations. The caller (Tier 3 →
 * Tier 2 feedback loop) marks the field\'s containing story as
 * content-dirty and re-runs Tier 2.
 */
export interface FieldChange {
    fieldId: string;
    storyId: string;
    oldText: string;
    newText: string;
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
 * One-time facts about a loaded document. Sent to the main thread
 * on a successful `LoadDocument` so the navigator + page count UI
 * can render before the first page is rasterised.
 */
export interface DocumentHandle {
    /**
     * Stable id assigned by the worker; used by the main thread when
     * addressing operations to a specific document (the worker may
     * hold more than one document open in the future).
     */
    docId: string;
    /**
     * Total page count. Stable for the life of the document unless
     * a mutation explicitly inserts / deletes pages.
     */
    pageCount: number;
    /**
     * Page ids in document order. The navigator displays them as
     * \"page N\" with `N = 1 + index`; the canvas uses the ids
     * directly for cache keys.
     */
    pageIds: PageId[];
    /**
     * Per-page dimensions in points. Same length as `page_ids`.
     * The navigator needs these to size thumbnails before any
     * rasterisation has happened.
     */
    pageSizesPt: [number, number][];
    /**
     * Aggregate counts for debugging / UI badges.
     */
    stats: DocumentStats;
    /**
     * Plan-2 §8.3 — ruler guides per page. The overlay renders
     * these and the snap pass treats them as targets. Total volume
     * is small (real docs ship a few dozen at most) so we ship them
     * inline on the handle rather than paging via a separate
     * request.
     */
    rulerGuides?: RulerGuideWire[];
}

/**
 * Opaque, monotone handle returned by `begin_gesture`. Callers pass
 * it back to `update_gesture` / `commit_gesture` / `cancel_gesture`.
 */
export type GestureHandle = number;

/**
 * Oriented geometry for one selected element. `bounds` is the raw
 * `GeometricBounds` (content-box space); `item_transform` is the
 * composed affine. The overlay layer multiplies bounds corners by
 * the transform to draw the oriented selection chrome.
 */
export interface ElementGeometryItem {
    id: ElementId;
    pageId: PageId;
    /**
     * `[top, left, bottom, right]`.
     */
    bounds: [number, number, number, number];
    /**
     * `[a, b, c, d, tx, ty]`.
     */
    itemTransform?: [number, number, number, number, number, number] | null;
    /**
     * Phase F — `true` when this element hosts a placed image
     * (`Rectangle` with `<Image>` / `<EPSImage>` / `<PDF>` /
     * `<ImportedPage>` nested). The TS overlay uses this to decide
     * whether a Cmd-drag should kick off `TranslateContent` instead
     * of `Translate`.
     */
    hasImage?: boolean;
}

/**
 * Phase 3 Item 4 — one rect-per-line in page-local coords for a
 * content selection range. Defined in the root so the channel
 * (Item 6) can reference it without depending on a yet-to-land
 * `geometry` module.
 */
export interface SelectionRect {
    pageId: PageId;
    frameId: string | null;
    leftPt: number;
    topPt: number;
    widthPt: number;
    heightPt: number;
}

/**
 * Phase 4 Step 2 — per-rebuild layout cache statistics.
 *
 * Sent piggyback on `MutationApplied` / `UndoApplied` / `RedoApplied`
 * so the main thread\'s HUD can show the incremental-layout win.
 */
export interface LayoutCacheStats {
    hits: number;
    misses: number;
    len: number;
    capacity: number;
    /**
     * Phase 4 instrumentation — wall-clock duration of the rebuild
     * that produced these stats, in milliseconds. Lets the HUD
     * compare cache wins against the underlying budget (AC-E-1
     * requires < 32 ms).
     */
    rebuildMs: number;
}

/**
 * Phase A→F gesture taxonomy. Translate ships in Phase B, Resize in
 * Phase C; Rotate / Scale stay reserved for Phase D.
 */
export type GestureType = { kind: "translate" } | { kind: "resize"; handle: ResizeHandle } | { kind: "rotate" } | { kind: "scale" } | { kind: "shear" } | { kind: "translateContent" } | { kind: "rotateContent" } | { kind: "scaleContent" } | { kind: "pathEdit"; address: PathPointAddress };

/**
 * Phase C — one of the eight handles on a selection rectangle\'s
 * oriented bbox. Cardinal handles move a single edge; diagonal
 * handles move two edges at once. Naming follows the compass
 * convention every creative tool uses (NW / N / NE / W / E / SW /
 * S / SE).
 */
export type ResizeHandle = "north" | "south" | "east" | "west" | "northEast" | "northWest" | "southEast" | "southWest";

/**
 * Phase D — anchor point passed at `begin_gesture` for gestures that
 * need to know where the user started dragging (rotate / scale; also
 * rotated-frame translate to support world-space delta math).
 * Page-local coords + the page id; the model converts to spread
 * coords by adding the page\'s spread origin.
 */
export interface GestureAnchor {
    pageId: PageId;
    pointInPage: [number, number];
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
 * Plan-2 §8.3 — wire shape of a ruler guide. `page_id` matches one
 * of `DocumentHandle::page_ids`. `orientation` is \"vertical\" (snaps
 * on x) or \"horizontal\" (snaps on y); `location` is the page-local
 * coord on the perpendicular axis.
 */
export interface RulerGuideWire {
    pageId: PageId;
    orientation: GuideOrientationWire;
    location: number;
}

/**
 * Resolution map keyed by anchor id. The `numbering_map()`
 * accessor on `ResolutionResult` exposes a borrow of this.
 */
export type NumberingMap = Record<AnchorId, AnchorPosition>;

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
 * SDK Phase 3 — one character style\'s summary. Same shape as
 * `ParagraphStyleSummary`; separate type so a future SwatchPicker
 * composition can disambiguate styles in its options source.
 */
export interface CharacterStyleSummary {
    selfId: string;
    name: string;
    basedOn: string | null;
}

/**
 * SDK Phase 3 — one gradient swatch\'s summary. `kind` is the
 * IDML `Type` attribute — `\"linear\"` / `\"radial\"` — so a picker
 * composition can icon-badge linear vs radial.
 */
export interface GradientSummary {
    selfId: string;
    name: string;
    kind: string;
}

/**
 * SDK Phase 3 — one paragraph style\'s identity + display name +
 * based-on link. Surfaced by `CanvasModel::paragraph_styles()`
 * (and `paged.paragraphStyles()`) so collection-backed Style
 * panels can render the hierarchy without re-parsing styles.xml.
 * The `based_on` field is the parent style\'s `selfId` (the cascade
 * root); `None` means this is a top-level style.
 */
export interface ParagraphStyleSummary {
    selfId: string;
    name: string;
    basedOn: string | null;
}

/**
 * SDK Phase 3 — one story\'s identity + total character length.
 * Surfaced by `CanvasModel::stories()` and the `paged.stories()`
 * script host function so consumers can pick valid character
 * ranges (e.g. `[0, length)` is always a well-formed StoryRange).
 */
export interface StorySummary {
    /**
     * IDML `Self` id (`Story/u123`).
     */
    selfId: string;
    /**
     * Total character count across every `CharacterRun.text` in
     * every paragraph. The largest valid `StoryRange.end`.
     */
    characterCount: number;
    /**
     * Number of paragraphs. Useful for binding-renderer fallbacks
     * that want to address \"the whole story\" without computing
     * the character count.
     */
    paragraphCount: number;
    /**
     * panels.md gap 1 — `true` when this story\'s text overflowed the
     * last frame in its chain at build time (overset). Derived from
     * the build\'s `OversetTextDropped` diagnostics; drives the
     * Preflight panel + the red \"+\" overset badge on the frame.
     */
    overset?: boolean;
}

/**
 * SDK Phase 3 — one swatch\'s identity + display name + kind.
 * Surfaced by `CanvasModel::swatches()` and the `paged.swatches()`
 * host fn so collection-backed panels (Swatches, the color picker
 * dropdown, the Character/Stroke fill-color enum-select) can
 * enumerate the document\'s colour palette without re-parsing the
 * graphic resource.
 *
 * `kind` is the IDML colour-model discriminant — `\"process\"` for
 * CMYK/RGB/Lab process colours, `\"spot\"` for named-ink swatches
 * (PANTONE etc.), `\"mixedInk\"` / `\"mixedInkGroup\"` for those
 * composites, and the literal labels `\"none\"` / `\"paper\"` /
 * `\"black\"` / `\"registration\"` for the four special swatches
 * IDML treats as built-ins. Renderers use this to badge the
 * swatch grid.
 */
export interface SwatchSummary {
    selfId: string;
    name: string;
    kind: string;
}

/**
 * SDK Phase 5 (D1) — closed enumeration of every document
 * collection a panel may bind against. Per
 * `panel-catalog-and-sdk-extension.md` §5.1. The Rust enum and the
 * TS `CollectionName` union (in `packages/catalog/src/types.ts`)
 * stay in lockstep; tsify emits a string-tag enum at the boundary
 * so consumers can pass names verbatim.
 *
 * Not every variant has a backing model accessor yet — the wire
 * surface lands here as the §5 binding ceiling, and the per-
 * collection accessors fill in as panels need them. The
 * `CanvasModel::collection(name)` dispatcher returns an empty
 * `serde_json::Value::Array` for unimplemented entries, surfacing
 * a runtime warning rather than a panic.
 */
export type CollectionName = "swatches" | "gradients" | "colorGroups" | "paragraphStyles" | "characterStyles" | "objectStyles" | "cellStyles" | "tableStyles" | "layers" | "spreads" | "pages" | "masterPages" | "links" | "articles" | "hyperlinks" | "bookmarks" | "crossReferences" | "conditions" | "conditionSets" | "fonts" | "indexTopics" | "inks" | "sections" | "stories";

/**
 * SDK Phase 5 (D1) — singleton document-level state. Per
 * `panel-catalog-and-sdk-extension.md` §5.6. Powers the Info panel,
 * status bar, and any chrome that reflects whole-document state
 * (vs. selection state). Scalar reads of singleton properties; the
 * six fields cover the v1 panel needs.
 *
 * `dirty` mirrors the Project\'s \"has uncommitted edits since the
 * last save\" flag (always `false` at v1 since there\'s no
 * save/export path through the worker yet — the flag exists so
 * the Info panel and tab title can react when one lands).
 */
export interface DocumentMeta {
    pageCount: number;
    activePage: PageId | null;
    /**
     * User-facing measurement unit — `\"pt\"` / `\"px\"` / `\"in\"` /
     * `\"mm\"` / `\"cm\"` / `\"pica\"` etc. Empty when the IDML doesn\'t
     * declare a default and the renderer hasn\'t established one.
     */
    units: string;
    /**
     * IDML\'s document colour mode — `\"cmyk\"` / `\"rgb\"`. Empty when
     * the source doesn\'t declare it.
     */
    colorMode: string;
    /**
     * Human-readable document name. Often the source `.idml`
     * filename minus extension; empty for synthetic / in-memory
     * documents.
     */
    documentName: string;
    /**
     * `true` when the worker has applied a mutation since
     * `LoadDocument`. Reset on save/export when that path lands.
     */
    dirty: boolean;
    /**
     * Editor-ops — document defaults for newly-created objects (the
     * triple `SetDocumentDefaults` writes). `None` = no fill / no
     * stroke / engine-default weight.
     */
    defaultFillColor?: string | null;
    defaultStrokeColor?: string | null;
    defaultStrokeWeight?: number | null;
    /**
     * Concept 2 — active colour-management settings (the state
     * `SetColorSettings` writes; seeded from the IDML designmap\'s
     * `CMYKProfile`/`SolidColorIntent` at load). `cmyk_profile_name`
     * is `None` until a registered profile is active by name.
     */
    cmykProfileName?: string | null;
    /**
     * Concept 3 — true when ACTUAL profile bytes back the working
     * space (explicit load bytes or a registry hit). The NAME above
     * can be a designmap declaration with no bytes behind it — the
     * export dialog\'s X-4 gate needs this, not the name.
     */
    cmykProfileActive?: boolean;
    rgbPolicy?: string | null;
    renderingIntent?: string | null;
    blackPointCompensation?: boolean | null;
    /**
     * Concept 2 — active soft-proof condition (`None` = proofing
     * off) + its paper-white flag.
     */
    proofProfileName?: string | null;
    proofSimulatePaperWhite?: boolean | null;
    /**
     * Concept 2 (Ink Manager) — global \"Use Standard Lab Values
     * for Spots\" toggle.
     */
    useStandardLabForSpots?: boolean | null;
}

/**
 * SDK Phase 5 (v1 sweep) — one `<Article>` summary. Backs
 * `documentCollection:articles`.
 */
export interface ArticleSummary {
    selfId: string;
    name: string;
    members: string[];
}

/**
 * SDK Phase 5 (v1 sweep) — one `<Bookmark>` summary. Backs
 * `documentCollection:bookmarks`.
 */
export interface BookmarkSummary {
    selfId: string;
    name: string;
    destination: string;
}

/**
 * SDK Phase 5 (v1 sweep) — one `<ColorGroup>` definition. Backs
 * `documentCollection:colorGroups` per §5.1. A user-defined
 * grouping of `Color` self_ids the document organises its
 * palette into.
 */
export interface ColorGroupSummary {
    selfId: string;
    name: string;
    /**
     * Member color/swatch self_ids the group wraps.
     */
    members: string[];
}

/**
 * SDK Phase 5 (v1 sweep) — one `<Condition>` definition. Backs
 * `documentCollection:conditions` per `panel-catalog-and-sdk-
 * extension.md` §5.1. The Conditions panel renders this for
 * inspection; per-condition visibility toggling requires a new
 * `Operation::SetConditionVisible` that v1 doesn\'t ship yet.
 */
export interface ConditionSummary {
    selfId: string;
    name: string;
    /**
     * Default `true` when the IDML doesn\'t specify (`Visible`
     * attribute is optional).
     */
    visible: boolean;
    /**
     * `\"Underline\"` / `\"Highlight\"` / `\"None\"` (or empty).
     */
    indicatorMethod: string;
}

/**
 * SDK Phase 5 (v1 sweep) — one `<ConditionSet>` definition. Backs
 * `documentCollection:conditionSets` per §5.1. Each entry is a
 * named grouping of Condition self_ids; the editor\'s Conditions
 * panel can use this to toggle a set as a unit (v2 affordance).
 */
export interface ConditionSetSummary {
    selfId: string;
    name: string;
    /**
     * Member Condition self_ids the set wraps.
     */
    conditions: string[];
}

/**
 * SDK Phase 5 (v1 sweep) — one `<CrossReferenceSource>` summary.
 * Backs `documentCollection:crossReferences`.
 */
export interface CrossReferenceSummary {
    selfId: string;
    name: string;
    format: string;
    destination: string;
}

/**
 * SDK Phase 5 (v1 sweep) — one `<Hyperlink>` summary. Backs
 * `documentCollection:hyperlinks`.
 */
export interface HyperlinkSummary {
    selfId: string;
    name: string;
    source: string;
    destination: string;
}

/**
 * SDK Phase 5 (v1 sweep) — one `<Topic>` summary. Backs
 * `documentCollection:indexTopics`.
 */
export interface IndexTopicSummary {
    selfId: string;
    name: string;
    sortOrder: string;
}

/**
 * SDK Phase 5 (v1 sweep) — one cell-style summary. Backs
 * `documentCollection:cellStyles`. Apply-an-entity via
 * `AppliedCellStyle` is wire-shape-only (UnsupportedProperty
 * until the Table NodeId surface lands); the panel can still
 * list defined styles today.
 */
export interface CellStyleSummary {
    selfId: string;
    name: string;
    basedOn: string | null;
}

/**
 * SDK Phase 5 (v1 sweep) — one font family/style entry derived
 * from the document\'s content. The parse layer doesn\'t carry a
 * font registry — fonts are referenced from runs + paragraph
 * styles. The accessor walks them and dedups; the result is the
 * set of typefaces *used* by the document.
 */
export interface FontSummary {
    /**
     * Family name (`\"Open Sans\"`, `\"Helvetica Neue\"`, …). Used as
     * the row react-key.
     */
    family: string;
    /**
     * Number of runs/styles that reference this family. Surfaces
     * \"this font is used N times\" without a full audit pass.
     */
    referenceCount: number;
    /**
     * panels.md gap 4 — `true` when the family can\'t be resolved to
     * face bytes by the worker\'s font registry (`BytesResolver`),
     * so the renderer substituted a fallback. The Fonts/Preflight
     * panel flags these in red. `false` means at least one style of
     * the family resolved.
     *
     * `embedded` is intentionally omitted: IDML packages reference
     * fonts by name (the `Fonts/Font_*.xml` resource carries no face
     * bytes), so the engine can\'t honestly say whether a font is
     * \"embedded\" — only whether it\'s installed/registered. Surfacing
     * a fabricated `embedded` flag would mislead the panel.
     */
    isMissing?: boolean;
}

/**
 * SDK Phase 5 (v1 sweep) — one master-spread summary. Backs
 * `documentCollection:masterPages`. Documents typically ship 1–3
 * master spreads (A-Master, B-Master, …) that pages reference
 * via `AppliedMaster`.
 */
export interface MasterPageSummary {
    selfId: string;
    label: string;
    pageCount: number;
}

/**
 * SDK Phase 5 (v1 sweep) — one object style\'s summary. Backs
 * `documentCollection:objectStyles` per `panel-catalog-and-sdk-
 * extension.md` §5.1; consumed by the Object Styles panel via
 * the `collection-select` primitive to drive an
 * `appliedObjectStyle` write on the selected frame.
 */
export interface ObjectStyleSummary {
    selfId: string;
    name: string;
    basedOn: string | null;
}

/**
 * SDK Phase 5 (v1 sweep) — one page summary. Backs
 * `documentCollection:pages`. Mirrors `DocumentHandle.page_ids`
 * + `page_sizes_pt` so a Pages-as-collection panel can render a
 * thumbnail/label list. The Navigator (existing legacy panel)
 * uses the same data through a different surface.
 */
export interface PageSummary {
    /**
     * Stable id (matches `PageId` everywhere else).
     */
    selfId: string;
    /**
     * 1-based index — what the user types in \"Go to page #\".
     */
    index: number;
    /**
     * `[width, height]` in points.
     */
    sizePt: [number, number];
    /**
     * panels.md gap 10 — page margins in pt (from the page\'s
     * `<MarginPreference>`). All four default to 0 when the page
     * declared no margins. The editor\'s margin-box overlay insets
     * the page rect by these.
     */
    marginTopPt?: number;
    marginLeftPt?: number;
    marginBottomPt?: number;
    marginRightPt?: number;
    /**
     * panels.md gap 10 — column grid inside the margin box.
     * `column_count` defaults to 1, `column_gutter_pt` to 0.
     */
    columnCount?: number;
    columnGutterPt?: number;
    /**
     * panels.md gap 10 — document bleed in pt (top, left, bottom,
     * right), from `<DocumentPreference>`. Document-level (the same
     * values on every page); carried per-page so the overlay can
     * draw the bleed box without a second round-trip. All 0 when the
     * document declares no bleed.
     */
    bleedTopPt?: number;
    bleedLeftPt?: number;
    bleedBottomPt?: number;
    bleedRightPt?: number;
}

/**
 * SDK Phase 5 (v1 sweep) — one placed-image link summary. Backs
 * `documentCollection:links` per `panel-catalog-and-sdk-extension.md`
 * §5.1. Each entry is a `(frame, image_link)` pair derived from
 * the parse layer\'s `Rectangle::image_link` / `Oval::image_link` /
 * `Polygon::image_link` fields. The Links panel renders this list
 * for inspection; the per-link \"relocate\" / \"update\" actions land
 * when those Operations ship.
 *
 * `host_kind` lets a future panel disambiguate \"this link sits on
 * a Rectangle vs. an Oval\". `host_self_id` is the host frame\'s
 * IDML `Self` id; the panel uses it as the row react-key.
 */
export interface LinkSummary {
    hostSelfId: string;
    hostKind: string;
    uri: string;
    /**
     * panels.md gap 2 — `\"ok\"` when the build resolved + decoded the
     * link, `\"missing\"` when the renderer fell back to the grey
     * missing-image placeholder (`ImageLinkMissing` /
     * `ImageDecodeFailed` diagnostic for this frame). Derived from
     * the build\'s render diagnostics, so it reflects the SAME
     * resolution outcome the rendered page shows.
     */
    status?: string;
    /**
     * panels.md gap 3 — placed-image colour space (`\"CMYK\"` /
     * `\"RGB\"` / `\"Gray\"` / `\"LAB\"`), from the `<Image Space>`
     * attribute InDesign baked at export. `None` when the IDML
     * omits it (synthetic fixtures, vector placements).
     */
    colorspace?: string | null;
    /**
     * panels.md gap 3 — effective ppi at print size (native ppi ÷
     * placement scale), from the `<Image EffectivePpi>` attribute.
     * The number a preflight resolution check compares against a
     * 300-ppi floor. `None` when the IDML omits it.
     */
    effectivePpi?: number | null;
}

/**
 * SDK Phase 5 (v1 sweep) — one spread summary. Backs
 * `documentCollection:spreads`. `pageCount` is the number of
 * `<Page>` children in the spread; `label` is the spread\'s
 * `Self` id (or filename when missing).
 */
export interface SpreadSummary {
    selfId: string;
    label: string;
    pageCount: number;
    /**
     * W3.A0 — the spread\'s live `<Guide>` set, refreshed on every
     * `collection(\"spreads\")` request. `DocumentHandle.ruler_guides`
     * is load-time-only (it doesn\'t pick up `InsertGuide` /
     * `MoveGuide` / `DeleteGuide` mutations), so the editor re-queries
     * this collection after an undo/redo to re-sync its overlay
     * mirror. Empty for spreads with no guides.
     */
    guides?: GuideSummary[];
}

/**
 * SDK Phase 5 (v1 sweep) — one table-style summary. Backs
 * `documentCollection:tableStyles`. Same shape + apply-an-entity
 * pattern as `CellStyleSummary`.
 */
export interface TableStyleSummary {
    selfId: string;
    name: string;
    basedOn: string | null;
}

/**
 * SDK Phase 5 (v1 sweep) — resolved colour readout for a single
 * swatch. The Color panel uses this to surface \"what does this
 * swatch actually look like\" — CMYK percentages for spot / CMYK
 * process inks, and an RGB hex string for the display fallback
 * the renderer paints with. Editor sliders are v2.
 */
export interface ColorPreview {
    selfId: string;
    name: string;
    /**
     * IDML colour model — `\"process\"` / `\"spot\"` / `\"mixedInk\"`
     * / `\"none\"` / `\"paper\"` / `\"black\"` / `\"registration\"`.
     */
    model: string;
    /**
     * CMYK percent values (0..=100). `None` for non-CMYK swatches
     * (e.g. RGB / Lab process colours; spots whose alternate
     * isn\'t CMYK).
     */
    cmyk: [number, number, number, number] | null;
    /**
     * Display RGB as `#rrggbb`. Always present (the renderer
     * computes a fallback RGB for every swatch).
     */
    rgbHex: string;
    /**
     * Concept 2 — out-of-gamut against the document\'s active CMYK
     * working space (false when no working profile is configured).
     */
    outOfGamut?: boolean;
    /**
     * Concept 2 — the RAW authored space + channels (IDML units),
     * so the swatch editor seeds losslessly (a Lab swatch edits in
     * Lab, not via its display RGB).
     */
    space?: string | null;
    value?: number[] | null;
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
 * Step 5 — `RequestPathAnchors` reply payload. `anchors.len()` may
 * be zero (e.g. a Rectangle with no `<PathGeometry>`); the overlay
 * treats that as \"nothing to draw\" without surfacing an error.
 */
export interface PathAnchorsResult {
    id: ElementId;
    pageId: PageId;
    anchors: PathAnchorTriple[];
    /**
     * Per-contour boundaries. Empty for the common single-contour
     * case so callers can iterate a single subpath without special-
     * casing the empty `subpath_starts` vector.
     */
    subpathStarts: number[];
    /**
     * Parallel to `subpath_starts` (or, when `subpath_starts` is
     * empty, a single entry for the single contour). `true` ⇒ the
     * contour is open. Lets the overlay emit closing-edge insert
     * hit-zones for closed subpaths only.
     */
    subpathOpen?: boolean[];
    /**
     * `[a, b, c, d, tx, ty]`. None ⇒ identity.
     */
    itemTransform?: [number, number, number, number, number, number] | null;
}

/**
 * Step 5 — one anchor\'s three control points, in the polygon\'s
 * inner coords (before `item_transform` + page-origin shift). The
 * overlay applies the same affine chain it already uses for selection
 * chrome.
 */
export interface PathAnchorTriple {
    anchor: [number, number];
    left: [number, number];
    right: [number, number];
}

/**
 * Structural counts. The main thread surfaces these in the debug
 * HUD. Mirrors `paged-renderer::PipelineStats` but lives in serde-
 * friendly form so it can cross the message channel.
 */
export interface DocumentStats {
    spreads: number;
    pages: number;
    frames: number;
    stories: number;
    paragraphs: number;
    runs: number;
    glyphs: number;
    lines: number;
    /**
     * panels.md gap 1 — number of distinct stories whose text
     * overflows the last frame in its chain (overset). Derived from
     * the build\'s `OversetTextDropped` diagnostics, not from
     * `PipelineStats`, so `DocumentStats::from(&PipelineStats)`
     * leaves this 0 and the `handle()` builder backfills it from the
     * document\'s render diagnostics. Drives the Preflight panel\'s
     * \"N overset stories\" badge.
     */
    overset_stories?: number;
}

/**
 * The canonical mutation primitive. A closed set, extended only with
 * deliberation. Collection mutations (swatches, styles) operate on the
 * document\'s `BTreeMap` palettes/stylesheets rather than the scene
 * tree, so they\'re top-level variants rather than `InsertNode`.
 */
export type Operation = { kind: "SetProperty"; node: NodeId; path: PropertyPath; value: Value } | { kind: "InsertNode"; parent: NodeId; position: number; node: NodeSpec; z_slot?: number | null } | { kind: "RemoveNode"; node: NodeId } | { kind: "MoveNode"; node: NodeId; new_parent: NodeId; position: number } | { kind: "Batch"; ops: Operation[] } | { kind: "InsertPage"; after_page_id?: string | null; master_id?: string | null; spread_self_id?: string | null; page_self_id?: string | null; restore_spread_json?: string | null } | { kind: "RemovePage"; page_id: string } | { kind: "MoveLayer"; layer_id: string; new_index: number } | { kind: "InsertLayer"; position: number; name: string; self_id?: string | null } | { kind: "RemoveLayer"; layer_id: string } | { kind: "CreateSwatch"; spec: SwatchSpec } | { kind: "EditSwatch"; swatch_id: string; spec: SwatchSpec } | { kind: "DeleteSwatch"; swatch_id: string } | { kind: "CreateParagraphStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameParagraphStyle"; style_id: string; name: string } | { kind: "DeleteParagraphStyle"; style_id: string } | { kind: "CreateCharacterStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameCharacterStyle"; style_id: string; name: string } | { kind: "DeleteCharacterStyle"; style_id: string } | { kind: "CreateObjectStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameObjectStyle"; style_id: string; name: string } | { kind: "DeleteObjectStyle"; style_id: string } | { kind: "CreateCellStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameCellStyle"; style_id: string; name: string } | { kind: "DeleteCellStyle"; style_id: string } | { kind: "CreateTableStyle"; self_id?: string | null; name?: string | null; based_on?: string | null; restore_json?: string | null } | { kind: "RenameTableStyle"; style_id: string; name: string } | { kind: "DeleteTableStyle"; style_id: string } | { kind: "CreateGroup"; spec: GroupSpec } | { kind: "DissolveGroup"; group_id: string; restore_slots?: number[] | null } | { kind: "CreateGradient"; spec: GradientSpec } | { kind: "EditGradient"; gradient_id: string; spec: GradientSpec } | { kind: "DeleteGradient"; gradient_id: string } | { kind: "CreateColorGroup"; spec: ColorGroupSpec } | { kind: "EditColorGroup"; group_id: string; spec: ColorGroupSpec } | { kind: "DeleteColorGroup"; group_id: string } | { kind: "SetStyleProperty"; collection: StyleCollection; style_id: string; path: PropertyPath; value: Value } | { kind: "PathfinderBoolean"; kept: NodeId; others: NodeId[]; opKind: PathfinderKind } | { kind: "LinkFrames"; from: string; to: string } | { kind: "UnlinkFrames"; frame: string; prev_next?: string | null } | { kind: "ApplyStyle"; story_id: string; start: number; end: number; style: string; scope: StyleScope } | { kind: "InsertField"; story_id: string; offset: number; field: FieldKind } | { kind: "DeleteField"; story_id: string; offset: number; field: FieldKind } | { kind: "InsertGuide"; spread_id: string; orientation: GuideOrientationSpec; position: number; page_index?: number; guide_id?: string | null } | { kind: "MoveGuide"; guide_id: string; position: number } | { kind: "DeleteGuide"; guide_id: string } | { kind: "SetConditionVisible"; condition: string; visible: boolean } | { kind: "ActivateConditionSet"; set: string } | { kind: "RestoreConditionVisibility"; states: [string, boolean][] } | { kind: "ApplyMasterToPage"; page: string; master?: string | null } | { kind: "DuplicatePage"; page: string; clone_spread_json?: string | null } | { kind: "InsertSection"; at_page: string; prefix?: string | null; numbering_style?: string | null; start_at?: number | null; self_id?: string | null } | { kind: "EditSection"; section_id: string; prefix?: string | null | null; numbering_style?: string | null; start_at?: number | null | null } | { kind: "DeleteSection"; section_id: string } | { kind: "SetRowHeight"; story_id: string; table_id: string; row: number; height?: number | null } | { kind: "SetColumnWidth"; story_id: string; table_id: string; col: number; width?: number | null } | { kind: "InsertTableRow"; story_id: string; table_id: string; at: number; restore?: TableLineRestoreJson | null } | { kind: "DeleteTableRow"; story_id: string; table_id: string; at: number } | { kind: "InsertTableColumn"; story_id: string; table_id: string; at: number; restore?: TableLineRestoreJson | null } | { kind: "DeleteTableColumn"; story_id: string; table_id: string; at: number };

/**
 * The discriminated payload of a `MainToWorker` message. Tagged so
 * TS can do `switch (msg.kind) { case \"loadDocument\": ... }` against
 * camelCase field names. `rename_all_fields` cascades to struct
 * variants so e.g. `cmyk_icc_profile` becomes `cmykIccProfile` on
 * the wire — the TS protocol mirror locks the camelCase contract.
 */
export type MainToWorkerKind = { kind: "hello" } | { kind: "loadDocument"; payload: { bytes: number[]; font?: number[] | null; cmykIccProfile?: number[] | null } } | { kind: "registerFont"; payload: { family: string; style?: string | null; bytes: number[] } } | { kind: "clearFontRegistry" } | { kind: "registerColorProfile"; payload: { name: string; bytes: number[] } } | { kind: "mutate"; payload: Mutation } | { kind: "requestPage"; payload: { pageId: PageId; lod: LodTier } } | { kind: "hitTest"; payload: { pageId: PageId; docPoint: [number, number]; filter: HitFilter } } | { kind: "requestSnapshot"; payload: { pageId: PageId; targetWidthPx: number; dpi?: number | null } } | { kind: "setSelection"; payload: { selection: ContentSelection | null } } | { kind: "requestSelectionGeometry"; payload: { selection: ContentSelection } } | { kind: "requestCaretGeometry"; payload: { selection: ContentSelection } } | { kind: "requestCaretNav"; payload: { storyId: string; offset: number; direction: CaretDirection } } | { kind: "requestLineBounds"; payload: { storyId: string; offset: number } } | { kind: "requestWordBounds"; payload: { storyId: string; offset: number } } | { kind: "undo" } | { kind: "redo" } | { kind: "setElementSelection"; payload: { ids: ElementId[]; mode: SelectionMode } } | { kind: "requestMarqueeHits"; payload: { pageId: PageId; rect: [number, number, number, number] } } | { kind: "requestElementGeometry"; payload: { ids: ElementId[] } } | { kind: "requestGroupLeaves"; payload: { groupId: string } } | { kind: "requestPathAnchors"; payload: { id: ElementId } } | { kind: "requestNearestPathPoint"; payload: { id: ElementId; point: [number, number] } } | { kind: "requestLayers" } | { kind: "requestCollection"; payload: { name: CollectionName } } | { kind: "requestDocumentMeta" } | { kind: "requestColorPreview"; payload: { swatchId: string } } | { kind: "requestColorCompute"; payload: { space: string; value: number[]; tint?: number | null; model?: string | null; alternateSpace?: string | null; alternateValue?: number[] | null } } | { kind: "requestGradientDetail"; payload: { gradientId: string } } | { kind: "exportSwatchLibrary"; payload: { groupId?: string | null } } | { kind: "executeScript"; payload: { source: string } } | { kind: "exportPdfBegin"; payload: { options: ExportPdfWireOptions } } | { kind: "exportPdfPage"; payload: { session: number } } | { kind: "exportPdfFinish"; payload: { session: number } } | { kind: "exportPdfCancel"; payload: { session: number } } | { kind: "exportIdml"; payload: {} } | { kind: "requestElementProperties"; payload: { id: ElementId } } | { kind: "requestSceneTree" } | { kind: "beginGesture"; payload: { nodes: ElementId[]; gesture: GestureType; anchor?: GestureAnchor | null; cameraScale?: number | null } } | { kind: "updateGesture"; payload: { handle: GestureHandle; delta: [number, number]; modifiers: GestureModifiers } } | { kind: "commitGesture"; payload: { handle: GestureHandle } } | { kind: "cancelGesture"; payload: { handle: GestureHandle } };

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
 * Track M — wire-shape mirror of `paged_parse::Layer`. Surfaces
 * everything the Layers panel needs without leaking parse-side
 * fields the wasm boundary doesn\'t understand. `z` is the layer\'s
 * zero-based index in `designmap.layers` (top-first, matching the
 * renderer\'s paint order via `layer_z_index`).
 */
export interface LayerSummary {
    selfId: string;
    name: string | null;
    visible: boolean;
    locked: boolean;
    printable: boolean;
    z: number;
}

/**
 * Tsify-exposed snapshot of the SAB layout. The TS-side worker glue
 * reads this once at startup and asserts its own hardcoded mirror
 * matches; any drift triggers a `protocolMismatch` warning identical
 * to the `PROTOCOL_VERSION` reconciliation. Keeping the layout in
 * Rust lets a single edit drive both sides — TS sees the new value
 * the next time wasm rebuilds.
 */
export interface GestureSabLayout {
    bytes: number;
    offsetHandleLo: number;
    offsetHandleHi: number;
    offsetDx: number;
    offsetDy: number;
    offsetModifiers: number;
    offsetSeq: number;
    offsetGenLo: number;
    offsetGenHi: number;
    modifierShift: number;
    modifierAlt: number;
    modifierDisableSnap: number;
}

/**
 * Tsify-exposed snapshot of the camera SAB layout. The TS-side
 * `CameraBuffer` reads this once at startup via `cameraSabLayout()`
 * and asserts its own hardcoded `OFFSET_*` constants match — any
 * drift triggers a `protocolMismatch` warning on the canvas.
 */
export interface CameraSabLayout {
    bytes: number;
    offsetScale: number;
    offsetTx: number;
    offsetTy: number;
    offsetGenLo: number;
    offsetGenHi: number;
}

/**
 * Typed `LoadDocument` failure. Each variant maps to a specific UI
 * recovery in the main thread (corrupted file → \"try another file\";
 * missing font → \"install or substitute\"; etc.).
 */
export type LoadError = { kind: "parse"; message: string } | { kind: "scene"; message: string } | { kind: "build"; message: string };

/**
 * Typed payload for a `SetProperty` Op. Each variant carries a value
 * of a specific kind; the apply layer\'s `TypeMismatch` error fires if
 * the variant doesn\'t match what the path expects.
 */
export type Value = { type: "bounds"; value: [number, number, number, number] } | { type: "colorRef"; value: string | null } | { type: "length"; value: number | null } | { type: "transform"; value: [number, number, number, number, number, number] | null } | { type: "pathPoint"; value: { address: PathPointAddress; position: [number, number] } } | { type: "pathPointInsert"; value: { index: number; anchor: PathAnchorSpec; prevSubpathStarts?: number[] | null } } | { type: "pathPointRemove"; value: { index: number; prevSubpathStarts?: number[] | null } } | { type: "pathPointCurveType"; value: { index: number; smooth: boolean; prev?: PathAnchorSpec | null } } | { type: "pluginMetadata"; value: { key: string; value: string | null; prev?: string | null | null } } | { type: "bool"; value: boolean } | { type: "text"; value: string } | { type: "framePath"; value: { anchors: PathAnchorSpec[]; subpathStarts: number[] } } | { type: "pathOpenAt"; value: { index: number; prevAnchors?: PathAnchorSpec[] | null; prevSubpathStarts?: number[] | null; prevSubpathOpen?: boolean[] | null } } | { type: "outlineStroke"; value: { width: number; cap: string; join: string; miterLimit: number; prevAnchors?: PathAnchorSpec[] | null; prevSubpathStarts?: number[] | null; prevSubpathOpen?: boolean[] | null } } | { type: "offsetPath"; value: { delta: number; join: string; miterLimit: number; prevAnchors?: PathAnchorSpec[] | null; prevSubpathStarts?: number[] | null; prevSubpathOpen?: boolean[] | null } } | { type: "simplifyPath"; value: { tolerance: number; prevAnchors?: PathAnchorSpec[] | null; prevSubpathStarts?: number[] | null; prevSubpathOpen?: boolean[] | null } } | { type: "gradientFeather"; value: GradientFeatherSpec | null } | { type: "paragraphRule"; value: ParagraphRuleSpec | null } | { type: "tabStops"; value: TabStopSpec[] };

/**
 * Typed property path for `SetProperty` Ops. A closed enum (rather
 * than free-form `Vec<String>`) preserves Rust\'s exhaustiveness
 * guarantee inside `apply`/`invert`, and the `serde` rename lets the
 * wire format read like the dotted path the briefing illustrates
 * (`\"fill.color\"`) — so JS callers don\'t need to learn the Rust
 * enum shape.
 */
export type PropertyPath = "frameBounds" | "frameFillColor" | "frameStrokeColor" | "frameStrokeWeight" | "frameOpacity" | "frameTransform" | "imageContentTransform" | "framePathPoint" | "pathPointInsert" | "pathPointRemove" | "pathPointCurveType" | "layerVisible" | "layerLocked" | "layerPrintable" | "layerName" | "characterFontSize" | "characterLeading" | "characterTracking" | "characterFillColor" | "paragraphSpaceBefore" | "paragraphSpaceAfter" | "paragraphFirstLineIndent" | "appliedParagraphStyle" | "appliedCharacterStyle" | "appliedObjectStyle" | "appliedCellStyle" | "appliedTableStyle" | "framePath" | "frameNonprinting" | "frameFillTint" | "frameGradientFillAngle" | "frameGradientFillLength" | "frameGradientStrokeAngle" | "frameGradientStrokeLength" | "pathOpenAt" | "outlineStroke" | "offsetPath" | "simplifyPath" | "frameGradientFeather" | "pageBounds" | "frameDropShadowMode" | "frameDropShadowXOffset" | "frameDropShadowYOffset" | "frameDropShadowSize" | "frameDropShadowOpacity" | "frameDropShadowColor" | "frameDropShadow" | "frameFittingCrops" | "frameFittingType" | "frameTextWrapMode" | "frameTextWrapOffsets" | "paragraphJustification" | "frameStrokeEndCap" | "frameInsetSpacing" | "appliedConditions" | "characterFontFamily" | "characterFontStyle" | "characterKerningMethod" | "characterCase" | "characterPosition" | "characterLanguage" | "characterBaselineShift" | "characterHorizontalScale" | "characterVerticalScale" | "characterSkew" | "characterUnderline" | "characterStrikethru" | "characterLigatures" | "characterOtfFeatures" | "paragraphLeftIndent" | "paragraphRightIndent" | "paragraphDropCapCharacters" | "paragraphDropCapLines" | "paragraphHyphenation" | "paragraphKeepLinesTogether" | "paragraphKeepWithNext" | "paragraphRuleAbove" | "paragraphRuleBelow" | "paragraphTabStops" | "paragraphListType" | "paragraphBulletCharacter" | "paragraphNumberingFormat" | "textFrameColumnCount" | "textFrameColumnGutter" | "textFrameColumnBalance" | "textFrameVerticalJustification" | "textFrameAutoSizing" | "textFrameFirstBaseline" | "textWrapInvert" | "frameFittingReferencePoint" | "frameAutoFit" | "frameStrokeType" | "frameStrokeJoin" | "frameStrokeMiterLimit" | "frameStrokeAlignment" | "frameStrokeGapColor" | "frameStrokeGapTint" | "frameCornerOptionTopLeft" | "frameCornerOptionTopRight" | "frameCornerOptionBottomLeft" | "frameCornerOptionBottomRight" | "frameCornerRadiusTopLeft" | "frameCornerRadiusTopRight" | "frameCornerRadiusBottomLeft" | "frameCornerRadiusBottomRight" | "frameRotationAngle" | "frameScaleX" | "frameScaleY" | "frameFlipH" | "frameFlipV" | "frameOverprintFill" | "frameOverprintStroke" | "frameInnerShadowEnabled" | "frameInnerShadowBlendMode" | "frameInnerShadowColor" | "frameInnerShadowOpacity" | "frameInnerShadowAngle" | "frameInnerShadowDistance" | "frameInnerShadowSize" | "frameInnerShadowChoke" | "frameInnerShadowNoise" | "frameOuterGlowEnabled" | "frameOuterGlowBlendMode" | "frameOuterGlowColor" | "frameOuterGlowOpacity" | "frameOuterGlowSpread" | "frameOuterGlowSize" | "frameOuterGlowNoise" | "frameInnerGlowEnabled" | "frameInnerGlowBlendMode" | "frameInnerGlowColor" | "frameInnerGlowOpacity" | "frameInnerGlowChoke" | "frameInnerGlowSize" | "frameInnerGlowSource" | "frameInnerGlowNoise" | "frameBevelEnabled" | "frameBevelStyle" | "frameBevelTechnique" | "frameBevelDepth" | "frameBevelDirection" | "frameBevelSize" | "frameBevelSoften" | "frameBevelAngle" | "frameBevelAltitude" | "frameBevelHighlightColor" | "frameBevelShadowColor" | "frameBevelHighlightOpacity" | "frameBevelShadowOpacity" | "frameSatinEnabled" | "frameSatinBlendMode" | "frameSatinColor" | "frameSatinOpacity" | "frameSatinAngle" | "frameSatinDistance" | "frameSatinSize" | "frameSatinInvert" | "frameFeatherEnabled" | "frameFeatherWidth" | "frameFeatherCornerType" | "frameFeatherNoise" | "frameFeatherChoke" | "frameDirectionalFeatherEnabled" | "frameDirectionalFeatherLeftWidth" | "frameDirectionalFeatherRightWidth" | "frameDirectionalFeatherTopWidth" | "frameDirectionalFeatherBottomWidth" | "frameDirectionalFeatherAngle" | "frameDirectionalFeatherNoise" | "frameDirectionalFeatherChoke" | "frameBlendMode" | "nextTextFrame" | "previousTextFrame" | "cellFillColor" | "cellFillTint" | "cellInsetTop" | "cellInsetLeft" | "cellInsetBottom" | "cellInsetRight" | "cellVerticalJustification" | "tableRowCount" | "tableColumnCount" | "pluginMetadata";

/**
 * Typed worker-side error for non-load operations. Mutations,
 * hit-tests, page requests all report through this. Variants are
 * kept stable across protocol versions.
 */
export type WorkerError = { kind: "notImplemented"; details: { what: string } } | { kind: "unknownPage"; details: { pageId: PageId } } | { kind: "noDocument" };

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
 * W3.A0 — one live ruler guide on a spread, carried inline on
 * [`SpreadSummary`]. `id` is the positional id the guide-CRUD
 * mutations mint (`\"Guide/<spreadSelf>/<index>\"`), so the editor can
 * address a `MoveGuide` / `DeleteGuide` at it without a second
 * round-trip. `position` is the page-local coordinate on the
 * perpendicular axis (x for `Vertical`, y for `Horizontal`).
 */
export interface GuideSummary {
    /**
     * Positional id — `\"Guide/<spreadSelf>/<index>\"`. Matches the id
     * `Operation::InsertGuide` mints (see `apply::guide_id_for`).
     */
    id: string;
    /**
     * `\"vertical\"` (snaps on x) or `\"horizontal\"` (snaps on y).
     */
    orientation: GuideOrientationWire;
    /**
     * Page-local coordinate on the perpendicular axis (pt).
     */
    position: number;
    /**
     * Zero-based index into the spread\'s pages (IDML\'s `PageIndex`).
     */
    pageIndex: number;
}

/**
 * W3.A1 — wire shape of [`crate::hit::TableHitContext`]: the table
 * cell a `HitTest` landed in.
 */
export interface TableHitContext {
    tableId: string;
    row: number;
    col: number;
}

/**
 * What the resolver produced this pass. The canvas worker reads
 * `numbering_map` to drive the running-header / page-number
 * rendering, walks `field_diff` to feed the Tier 2 re-layout
 * queue, and walks `dirty_pages` to bump per-page
 * `numbering_generation` counters.
 */
export interface ResolutionResult {
    numbering: NumberingMap;
    fieldDiff: FieldChange[];
    dirtyPages: PageId[];
    /**
     * Number of iterations the resolver ran. Spec caps at 4;
     * reaching the cap is a warning the caller surfaces in the
     * debug HUD.
     */
    iterations: number;
    /**
     * Per-page running header — for each page, the most recent
     * heading paragraph at-or-before that page. Drives the
     * `RunningHeader(style)` field substitution in master content.
     * One entry per page in document order.
     */
    runningHeaders?: RunningHeader[];
    /**
     * Materialised TOC entries from `Document::resolve_toc()`.
     * Empty when the document has no `<TOCStyle>` definitions or
     * none of its paragraphs match TOC entry styles.
     */
    toc?: TocEntry[];
    /**
     * Count of footnote-body anchors in the document. Reserved
     * for the parser-side footnote work; renders as a HUD badge.
     */
    footnoteCount?: number;
}

/**
 * What to consider when hit-testing. The inspector + editor route
 * pointer events through this. Phase 1 only implements `Frame`.
 */
export type HitFilter = "frame" | "text" | "any";

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

/**
 * Wire-format errors for the gesture envelope. Mirrors the variants
 * of `crate::gesture::GestureError` so the channel doesn\'t expose the
 * internal `thiserror` representation.
 */
export type GestureFailure = { kind: "noDocument" } | { kind: "unsupportedGesture"; details: { reason: string } } | { kind: "alreadyActive"; details: { handle: GestureHandle } } | { kind: "handleMismatch" } | { kind: "elementNotFound"; details: { id: ElementId } } | { kind: "rotatedFrameUnsupported" } | { kind: "emptySelection" } | { kind: "missingAnchor" } | { kind: "unknownAnchorPage"; details: { page_id: PageId } } | { kind: "other"; details: { message: string } };

/**
 * `RequestLineBounds` reply payload.
 */
export interface LineBounds {
    /**
     * Story offset of the line\'s first character.
     */
    lineStart: number;
    /**
     * Story offset just past the line\'s last character.
     */
    lineEnd: number;
}

/**
 * panels.md gap 20 — one structured PDF-export preflight finding for
 * the export dialog\'s findings list. The wire mirror of
 * `paged_export_pdf::PreflightFinding`. `severity` is `\"warning\"` /
 * `\"error\"`; `code` is a stable machine tag (`\"font_not_embeddable\"`
 * / `\"image_missing_bytes\"`); `page_index` is the 0-based body-page
 * the finding was raised on (`None` for document-level findings).
 */
export interface PreflightFinding {
    code: string;
    severity: string;
    message: string;
    pageIndex?: number | null;
}

/**
 * panels.md gaps 9/10/19 — one `<Section>` definition. Backs
 * `documentCollection:sections`. The Pages panel groups page
 * thumbnails by section and labels each group with its prefix +
 * numbering style; `start_page_index` + `page_count` let it draw
 * the section bands. `page_count` is computed by walking the body
 * pages between this section\'s start and the next section\'s start
 * (or the document end).
 */
export interface SectionSummary {
    /**
     * IDML `Self` id of the `<Section>`.
     */
    selfId: string;
    /**
     * `SectionPrefix` (e.g. `\"A-\"`); empty when the section has no
     * prefix or doesn\'t include it in labels.
     */
    prefix: string;
    /**
     * Page-number style — `\"arabic\"` / `\"upperRoman\"` /
     * `\"lowerRoman\"` / `\"upperAlpha\"` / `\"lowerAlpha\"`. The label a
     * panel renders next to the section band.
     */
    labelStyle: string;
    /**
     * 0-based flat body-page index where this section begins (the
     * page whose `Self` matches `PageStart`). `None` when the
     * section\'s start page can\'t be located in the built document.
     */
    startPageIndex?: number | null;
    /**
     * Number of body pages this section spans (up to the next
     * section\'s start, or the document end).
     */
    pageCount: number;
}

export interface CaretGeometry {
    pageId: PageId;
    frameId: string | null;
    /**
     * Page-local x of the caret leading edge.
     */
    xPt: number;
    /**
     * Page-local y of the caret top (baseline - ascent).
     */
    topPt: number;
    /**
     * Total caret height (ascent + descent).
     */
    heightPt: number;
}

export interface FrameBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface RunningHeader {
    pageId: PageId;
    pageNumber: number;
    /**
     * Most recent heading at-or-before this page. Empty before the
     * first heading.
     */
    text: string;
    level: number;
}

export interface TocEntry {
    level: number;
    text: string;
    /**
     * 1-based body page number, or 0 if the entry\'s host story
     * has no body-page placement (orphan).
     */
    pageNumber: number;
    /**
     * Original IDML paragraph style name the entry was matched
     * against — useful for debugging / styling.
     */
    includeStyle: string;
}

export type AnchorId = string;

export type GuideOrientationWire = "vertical" | "horizontal";

export type ProtocolVersion = number;

export type SnapshotError = { kind: "unknownPage"; details: { page_id: PageId } } | { kind: "pngEncode"; details: string } | { kind: "invalidWidth"; details: number };


/**
 * Worker-side state holder. The JS worker creates one of these
 * per worker lifetime and forwards `MessageEvent.data` to
 * `handle_message` after JSON parsing.
 */
export class CanvasWorker {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Phase 3 — caret geometry for a JSON-encoded
     * `ContentSelection`. Returns a JSON-encoded `CaretGeometry`
     * or `null` when the selection's story has no captured
     * layout. The Overlay calls this on selection change to
     * position the caret.
     */
    caretGeometryJson(selection_json: string): string | undefined;
    /**
     * Whether GPU is initialised. The worker checks this each
     * frame to decide which render path to take. Cheap; just a
     * pointer-null check.
     */
    gpuReady(): boolean;
    /**
     * simple — no nested serde-wasm-bindgen conversions, just
     * `Vec<u8>` bytes in and bytes out.
     */
    handleMessage(input: string): string;
    /**
     * Initialise the WebGPU + Vello surface presenter against
     * `canvas`. Async because the browser's adapter and device
     * requests are Promise-based. On success the worker can call
     * `presentFrame` per render tick; on failure the worker
     * stays on the CPU snapshot-blit fallback path.
     *
     * `width` / `height` are device-pixel dimensions; the JS
     * caller passes `canvas.width` and `canvas.height` which it
     * has already sized to `cssWidth * dpr`.
     */
    initGpu(canvas: OffscreenCanvas, width: number, height: number): Promise<boolean>;
    /**
     * Direct binary entry point for `loadDocument`. Bypasses the
     * JSON channel so multi-MB IDMLs don't have to ride as a
     * 8×-inflated `number[]` array (which on wasm32 trips the
     * 2 GB `Vec::with_capacity` cap during serde parse — the
     * megapacks ≥100 MB panic with "capacity overflow" through
     * the JSON path). Returns a JSON string that the JS side
     * parses with the same `WorkerToMain` shape `handleMessage`
     * would produce — `documentLoaded` on success, `loadFailed`
     * otherwise.
     */
    loadDocumentDirect(seq: number, bytes: Uint8Array, font?: Uint8Array | null, cmyk_icc_profile?: Uint8Array | null): string;
    constructor();
    /**
     * Number of pages in the loaded document, or 0 if no
     * document is loaded.
     */
    pageCount(): number;
    /**
     * Per-page dimensions for the worker's render loop. Returns
     * a flat `[page_id_len, ...page_id_utf8, w_pt, h_pt]`-style
     * blob? No — wasm-bindgen handles `Vec<JsValue>` poorly.
     * Easier: each call returns one page; iterate by index.
     * Returns `None` past the end. Tuple is `[page_id, w_pt, h_pt]`
     * serialised as a JS array.
     */
    pageInfo(index: number): Array<any> | undefined;
    /**
     * Render the visible pages at the current camera into the
     * bound surface. Camera operates in CSS pixels; the
     * presenter applies `dpr` internally as we bake it into the
     * per-page transforms below.
     *
     * Returns `false` if the surface presenter isn't initialised
     * or no document is loaded — the worker falls back to its
     * CPU path in that case.
     */
    presentFrame(scale: number, tx: number, ty: number, dpr: number): boolean;
    /**
     * Sub-phase D — render `page_id` to a PNG via the Vello GPU
     * path (off-surface). Returns `None` if GPU is not
     * initialised, the page id is unknown, or the underlying
     * readback fails. The fidelity suite calls this with
     * `BACKEND=gpu` to test the production hot path; the CPU
     * path (`renderTilePng`) stays as the deterministic
     * fallback used in CI.
     */
    renderPageVelloPng(page_id: string, dpi: number): Promise<Uint8Array | undefined>;
    /**
     * Worker-internal tile rendering. Bypasses the JSON
     * `RequestSnapshot` round-trip — for the render loop that
     * fires every frame, the JSON serialize/parse cost of a
     * 1024px PNG (~megabyte of `[n, n, n, ...]` text) dominates
     * the actual rasterization. Returns raw PNG bytes the JS
     * side feeds straight to `createImageBitmap(blob)`.
     *
     * Returns `None` (→ `undefined` on the JS side) if no
     * document is loaded or the page id is unknown.
     */
    renderTilePng(page_id: string, target_width_px: number): Uint8Array | undefined;
    /**
     * Resize the GPU surface. Worker calls this from a
     * ResizeObserver on the host canvas element.
     */
    resizeGpu(width: number, height: number): void;
    /**
     * Run the Tier 3 resolver against the current model.
     * Returns the result as a JSON string the JS side can
     * parse via `JSON.parse`. `null` when no document is loaded.
     * The worker invokes this after `LoadDocument` succeeds and
     * posts the parsed result as an unsolicited `resolutionDone`
     * message to the main thread. Phase 2 — heading anchors and
     * their assigned page numbers become visible in the UI.
     */
    runResolveJson(): string | undefined;
    /**
     * Number of cached page scenes currently resident. Surfaced
     * for the HUD / DevTools — a developer-facing memory probe.
     */
    sceneCacheSize(): number;
    /**
     * Phase 3 — selection geometry (rect-per-line) for a
     * JSON-encoded `ContentSelection`. Returns a JSON array of
     * `SelectionRect`. Empty array for caret selections.
     */
    selectionGeometryJson(selection_json: string): string | undefined;
    /**
     * Override the LRU budget. Useful from a developer console
     * when measuring memory behaviour.
     */
    setSceneCacheBudget(max_entries: number): void;
    /**
     * Handle one main-thread message. Input is the JSON string
     * the JS side produced via `JSON.stringify(msg)`. Output is
     * the JSON string the JS side should `JSON.parse` and post
     * back to the main thread. Returning a string (rather than
     * a wasm-bindgen-serialised object) keeps the boundary
     * Step 5d/5e — raw-arg update-gesture entry. The worker drains
     * the gesture SAB every tick and calls this without going
     * through `handleMessage`'s JSON envelope. Returns an empty
     * string on failure (no document loaded or gesture has gone
     * stale — the worker drops the tick). On success returns a
     * JSON string with the dirty page set + active snap guides so
     * the worker can post a `GestureSnapLines` notification and
     * run its `markDirty` invalidation without re-querying.
     *
     * The 64-bit handle arrives split into low/high words because
     * JS Numbers can't represent the full u64 range cleanly.
     * `modifier_bits`: bit 0 = shift, bit 1 = alt, bit 2 =
     * disable_snap (Ctrl, plan-2 §8.4). Matches the SAB layout
     * in `packages/shell/src/gestures/gesture-sab.ts`.
     */
    updateGestureRaw(handle_lo: number, handle_hi: number, dx: number, dy: number, modifier_bits: number): string;
    /**
     * Protocol version constant; the JS side compares against
     * its bundled value before sending `LoadDocument`.
     */
    readonly protocolVersion: number;
}

export function cameraSabBytes(): number;

export function cameraSabLayout(): CameraSabLayout;

export function gestureSabBytes(): number;

export function gestureSabLayout(): GestureSabLayout;

export function on_start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_canvasworker_free: (a: number, b: number) => void;
    readonly cameraSabBytes: () => number;
    readonly cameraSabLayout: () => any;
    readonly canvasworker_caretGeometryJson: (a: number, b: number, c: number) => [number, number];
    readonly canvasworker_gpuReady: (a: number) => number;
    readonly canvasworker_handleMessage: (a: number, b: number, c: number) => [number, number];
    readonly canvasworker_initGpu: (a: number, b: any, c: number, d: number) => any;
    readonly canvasworker_loadDocumentDirect: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly canvasworker_new: () => number;
    readonly canvasworker_pageCount: (a: number) => number;
    readonly canvasworker_pageInfo: (a: number, b: number) => any;
    readonly canvasworker_presentFrame: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly canvasworker_protocolVersion: (a: number) => number;
    readonly canvasworker_renderPageVelloPng: (a: number, b: number, c: number, d: number) => any;
    readonly canvasworker_renderTilePng: (a: number, b: number, c: number, d: number) => [number, number];
    readonly canvasworker_resizeGpu: (a: number, b: number, c: number) => void;
    readonly canvasworker_runResolveJson: (a: number) => [number, number];
    readonly canvasworker_sceneCacheSize: (a: number) => number;
    readonly canvasworker_selectionGeometryJson: (a: number, b: number, c: number) => [number, number];
    readonly canvasworker_setSceneCacheBudget: (a: number, b: number) => void;
    readonly canvasworker_updateGestureRaw: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly gestureSabLayout: () => any;
    readonly on_start: () => void;
    readonly gestureSabBytes: () => number;
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
    readonly wasm_bindgen__convert__closures_____invoke__he4c1c257c045c41d: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h98d8e723eec618c7: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h10d8665c2d310494: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
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
