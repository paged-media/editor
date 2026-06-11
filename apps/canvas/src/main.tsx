import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PagedShell,
  caretContribution,
  contentGrabberContribution,
  hitMarkerContribution,
  marqueeContribution,
  toolPreviewContribution,
  guideOverlayContribution,
  pageDecorationsContribution,
  pathEditContribution,
  resizeHandlesContribution,
  rotateHandleContribution,
  selectionChromeContribution,
  setCockpitPageNavigator,
  snapLinesContribution,
  tableCellOverlayContribution,
  threadingPortsContribution,
  useCamera,
  useCanvasClient,
  useContentSelection,
  useDocument,
  usePaged,
  useRegistries,
  SchemaPanelRenderer,
  CatalogRegistryProvider,
  type OverlayContribution,
  type PanelContribution,
  type ShellSchemaPanelRendererProps,
} from "@paged-media/shell";
import "@paged-media/shell/styles/globals.css";

import { CanvasClient } from "@paged-media/client";
// Vite `?worker` import — constructs the render worker in THIS (app) module
// graph so Vite emits the worker chunk AND follows its transitive `?url` wasm
// import into a real `.wasm` asset. Passing only a worker URL across the
// @paged-media/client package boundary defeated Vite's static worker analysis:
// prod dist shipped a raw un-transpiled `worker.ts` and no wasm (audit D6/E8).
// See CanvasClientOptions for the full rationale.
import CanvasRenderWorker from "./worker/worker.ts?worker";
import { BUILT_IN_TOOLS } from "@paged-media/tools";
import { loadBundle, createDataProviderRegistry } from "@paged-media/plugin-sdk";
import type { SchemaPanelRenderer as SchemaPanelRendererType } from "@paged-media/plugin-api";
import { drawBundle } from "@paged-media/draw-bundle";
import { webBundle } from "@paged-media/web-bundle";
import { dataBundle } from "@paged-media/data-bundle";
import { sheetBundle } from "@paged-media/sheet-bundle";
import { createEditorAssetSource } from "./plugin-asset-source";
import { createEditorBlobStore } from "./plugin-blob-store";
import { pickFiles } from "./shell-file-picker";

// W3.1 — the schema-panel renderer the host injects. The shell renderer
// walks a `PanelSchema` through the catalog's `CompositionRenderer`,
// which needs the app's `CatalogRegistryProvider` in scope (the same
// provider the editor's own composition panels mount). Wrap it here at
// the app boundary (apps/canvas owns `appCatalogRegistry`).
function HostSchemaPanelRenderer(props: ShellSchemaPanelRendererProps) {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <SchemaPanelRenderer {...props} />
    </CatalogRegistryProvider>
  );
}

// Compat assertion (same discipline as plugin-api-compat.ts): the
// injected renderer must satisfy the plugin-api contract type. A drift
// on either side fails THIS typecheck at the injection seam, never a
// plugin author's build.
type _AssertSchemaRenderer =
  typeof HostSchemaPanelRenderer extends SchemaPanelRendererType
    ? true
    : never;
const _schemaRendererCompat: _AssertSchemaRenderer = true;
void _schemaRendererCompat;
import { CodeEditor } from "@paged-media/ui";
import { cockpitActions } from "@paged-media/shell";
import { assertCrossOriginIsolated } from "./boot/cross-origin-isolation-check";
import {
  APP_KEYBINDINGS,
  APP_MENU_ITEMS,
  buildAppCommands,
} from "./app-commands";
import { COCKPIT_MODES, PANEL_RAIL } from "./cockpit-modes";
import { COCKPIT_MENU_SEAMS } from "./cockpit-menus";
import { appCatalogRegistry } from "./panels/catalog-registry";
import { CanvasPanel } from "./panels/canvas-panel";
import { CharacterPanel } from "./panels/character-panel";
import { ArticlesPanel } from "./panels/articles-panel";
import { BookmarksPanel } from "./panels/bookmarks-panel";
import { CharacterStylesPanel } from "./panels/character-styles-panel";
import { ColorGroupsPanel } from "./panels/color-groups-panel";
import { ColorSettingsPanel } from "./panels/color-settings-panel";
import { InkManagerPanel } from "./panels/ink-manager-panel";
import { ConditionSetsPanel } from "./panels/condition-sets-panel";
import { ConditionsPanel } from "./panels/conditions-panel";
import { CrossReferencesPanel } from "./panels/cross-references-panel";
import { HyperlinksPanel } from "./panels/hyperlinks-panel";
import { IndexPanel } from "./panels/index-panel";
import { InfoPanel } from "./panels/info-panel";
import { LinksPanel } from "./panels/links-panel";
import { EffectsPanel } from "./panels/effects-panel";
import { FrameFittingPanel } from "./panels/frame-fitting-panel";
import { GradientsPanel } from "./panels/gradients-panel";
import { ObjectStylesPanel } from "./panels/object-styles-panel";
import { ObjectTransformPanel } from "./panels/object-transform-panel";
import { AlignPanel } from "./panels/align-panel";
import { AttributesPanel } from "./panels/attributes-panel";
import { ControlPanel } from "./panels/control-panel";
import { PropertiesPanel } from "./panels/properties-panel";
import { PathfinderPanel } from "./panels/pathfinder-panel";
import { CellStylesPanel } from "./panels/cell-styles-panel";
import { ColorPanel } from "./panels/color-panel";
import { ColorWheelPanel } from "./panels/color-wheel-panel";
import { FontsPanel } from "./panels/fonts-panel";
import { TablePanel } from "./panels/table-panel";
import { TabsPanel } from "./panels/concept/tabs-panel";
import { GlyphsPanel } from "./panels/concept/glyphs-panel";
import { BulletsPanel } from "./panels/concept/bullets-panel";
import { AnchoredPanel } from "./panels/concept/anchored-panel";
import { ObjectExportPanel } from "./panels/concept/object-export-panel";
import { ExportTaggingPanel } from "./panels/concept/export-tagging-panel";
import { MasterPagesPanel } from "./panels/master-pages-panel";
import { PagesListPanel } from "./panels/pages-list-panel";
import { SpreadsPanel } from "./panels/spreads-panel";
import { TableStylesPanel } from "./panels/table-styles-panel";
import { SwatchesPanel } from "./panels/swatches-panel";
import { TextFrameOptionsPanel } from "./panels/text-frame-options-panel";
import { TextWrapPanel } from "./panels/text-wrap-panel";
import { ParagraphPanel } from "./panels/paragraph-panel";
import { ParagraphStylesPanel } from "./panels/paragraph-styles-panel";
import { StrokePanel } from "./panels/stroke-panel";
import { InspectorPanel } from "./panels/inspector-panel";
import { LayersPanel } from "./panels/layers-panel";
import { NavigatorPanel } from "./panels/navigator-panel";
import { OutlinePanel } from "./panels/outline-panel";
import { ReplPanel } from "./panels/repl-panel";
import { ScriptEditorPanel } from "./panels/script-editor";
import { ProblemsPanel } from "./panels/problems-panel";
import { problemsSink } from "./panels/problems-store";
import { TreePanel } from "./panels/tree-panel";
import { ExportCenterPanel } from "./panels/cockpit/export-center-panel";
import { PreflightPanel } from "./panels/cockpit/preflight-panel";
import { PublicationHealthPanel } from "./panels/cockpit/publication-health-panel";
import {
  CommentsPanel,
  ComponentLibraryPanel,
  DataMappingPanel,
} from "./panels/cockpit/stub-panels";
import { StoriesPanel } from "./panels/cockpit/stories-panel";
import { DocumentMapPanel } from "./panels/cockpit/document-map-panel";
import {
  ExportInspectorPanel,
  OutputsPanel,
} from "./panels/cockpit/export-views";
import { DataGridPanel, DataSourcePanel } from "./panels/cockpit/data-views";
import {
  OutputReadinessPanel,
  ReviewInspectorPanel,
  StoryInspectorPanel,
} from "./panels/cockpit/mode-inspectors";
import { useAnimatedCamera } from "./ui/useAnimatedCamera";
import { useKeyboardShortcuts } from "./ui/useKeyboardShortcuts";
import { documentBounds, fitCamera, layoutPages } from "./ui/layout";
import { usePathEditMode } from "./ui/usePathEditMode";
import { useTextEditing } from "./ui/useTextEditing";
import { CorpusPicker } from "./ui/CorpusPicker";

// Default overlay contributions for the canvas app. Order is
// descriptive — actual paint order is determined by the
// contributions' `z` values inside OverlayHost.
const BUILT_IN_OVERLAYS: OverlayContribution[] = [
  pageDecorationsContribution,
  // W2.8 — the INTERACTIVE guide overlay supersedes the read-only
  // `rulerGuidesContribution` in the editor: it seeds its mirror from
  // the same `DocumentHandle.rulerGuides` AND drives create/move/
  // delete. The static one stays in the shell barrel for the viewer.
  guideOverlayContribution,
  hitMarkerContribution,
  selectionChromeContribution,
  resizeHandlesContribution,
  rotateHandleContribution,
  // W2.9 — text-frame threading ports on the selection chrome.
  threadingPortsContribution,
  // W3.A2 — selected table cell outline.
  tableCellOverlayContribution,
  contentGrabberContribution,
  pathEditContribution,
  marqueeContribution,
  toolPreviewContribution,
  snapLinesContribution,
  caretContribution,
];

// The built-in panels for the canvas app. Bundle authors register
// additional panels through the registry once Step 4's loader
// lands; the cockpit's Window menu surfaces every entry. The
// CANVAS itself is not a panel — it is the cockpit's viewport slot
// (`canvasComponent`).
const BUILT_IN_PANELS: PanelContribution[] = [
  {
    id: "paged.pages",
    title: "Pages",
    component: NavigatorPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  // ── Cockpit panels (styleguide E) — mode-first surfaces. ──
  {
    id: "paged.export-center",
    title: "Export Center",
    component: ExportCenterPanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "ui-export",
  },
  {
    id: "paged.preflight",
    title: "Preflight",
    component: PreflightPanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "ui-target",
  },
  {
    id: "paged.publication-health",
    title: "Health",
    component: PublicationHealthPanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "ui-warn",
  },
  {
    id: "paged.stories",
    title: "Stories",
    component: StoriesPanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "panel-character",
  },
  {
    id: "paged.comments",
    title: "Comments",
    component: CommentsPanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "ui-comment",
  },
  {
    id: "paged.data-mapping",
    title: "Data",
    component: DataMappingPanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "ui-database",
  },
  {
    id: "paged.component-library",
    title: "Library",
    component: ComponentLibraryPanel,
    defaultDock: "right",
    defaultGroup: "cockpit",
    icon: "ui-component",
  },
  // ── Cockpit fixed-slot panels (kit left panels + per-mode right
  //    inspectors + canvas-area mains). Registered like any panel;
  //    the mode `slots` select where they render. ──
  {
    id: "paged.document-map",
    title: "Document Map",
    component: DocumentMapPanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "panel-pages",
  },
  {
    id: "paged.outputs",
    title: "Outputs",
    component: OutputsPanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "ui-export",
  },
  {
    id: "paged.data-source",
    title: "Data Source",
    component: DataSourcePanel,
    defaultDock: "left",
    defaultGroup: "cockpit",
    icon: "ui-database",
  },
  {
    id: "paged.data-grid",
    title: "Generated pages",
    component: DataGridPanel,
    defaultDock: "center",
    defaultGroup: "cockpit",
    icon: "ui-bolt",
  },
  {
    id: "paged.story-inspector",
    title: "Story",
    component: StoryInspectorPanel,
    defaultDock: "right",
    defaultGroup: "cockpit",
    icon: "panel-paragraph",
  },
  {
    id: "paged.output-readiness",
    title: "Output readiness",
    component: OutputReadinessPanel,
    defaultDock: "right",
    defaultGroup: "cockpit",
    icon: "ui-target",
  },
  {
    id: "paged.review-inspector",
    title: "Review",
    component: ReviewInspectorPanel,
    defaultDock: "right",
    defaultGroup: "cockpit",
    icon: "ui-pin",
  },
  {
    id: "paged.export-inspector",
    title: "Export settings",
    component: ExportInspectorPanel,
    defaultDock: "right",
    defaultGroup: "cockpit",
    icon: "ui-export",
  },
  // NOTE: the old `paged.tools` dock panel is retired — the left
  // ToolRail (shell chrome, Concept 1 AC-9) is the only tool surface.
  {
    // SDK Phase 5 (named sweep) — Links list. Read-only expert
    // leaf consuming useCollection<LinkSummary>("links"). Per-row
    // relocate / update / break actions land with their
    // Operations.
    id: "paged.links",
    title: "Links",
    component: LinksPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    // SDK Phase 5 (v1 sweep) — Conditions list. Read-only expert
    // leaf consuming useCollection<ConditionSummary>("conditions").
    // Per-condition visibility toggle lands with
    // `Operation::SetConditionVisible`.
    id: "paged.conditions",
    title: "Conditions",
    component: ConditionsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.condition-sets",
    title: "Condition Sets",
    component: ConditionSetsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.color-groups",
    title: "Color Groups",
    component: ColorGroupsPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    id: "paged.ink-manager",
    title: "Ink Manager",
    component: InkManagerPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    id: "paged.color-settings",
    title: "Colour Settings",
    component: ColorSettingsPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    id: "paged.articles",
    title: "Articles",
    component: ArticlesPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.hyperlinks",
    title: "Hyperlinks",
    component: HyperlinksPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.bookmarks",
    title: "Bookmarks",
    component: BookmarksPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.cross-references",
    title: "Cross References",
    component: CrossReferencesPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.index",
    title: "Index",
    component: IndexPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  // ── SDK Phase 5 (v1 sweep) — Wave 1 structural-collection
  // panels. Each is a read-only list backed by the matching
  // documentCollection accessor.
  {
    id: "paged.pages-list",
    title: "Pages (list)",
    component: PagesListPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.spreads",
    title: "Spreads",
    component: SpreadsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.master-pages",
    title: "Master Pages",
    component: MasterPagesPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.cell-styles",
    title: "Cell Styles",
    component: CellStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    id: "paged.table-styles",
    title: "Table Styles",
    component: TableStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    id: "paged.fonts",
    title: "Fonts",
    component: FontsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    // SDK Phase 5 (v1 sweep) — Align palette. Reads element
    // selection + each frame's bounds, dispatches N SetProperty
    // mutations to align. v1 limitation: each frame is its own
    // undo entry (wire-level Batch lands as a follow-up).
    id: "paged.align",
    title: "Align",
    component: AlignPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Pathfinder. v1 ships Union via
    // BBox math; Subtract / Intersect / Exclude buttons exist
    // but are disabled (need Bezier CSG, v2).
    id: "paged.pathfinder",
    title: "Pathfinder",
    component: PathfinderPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    id: "paged.outline",
    title: "Outline",
    component: OutlinePanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.tree",
    title: "Tree",
    component: TreePanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "paged.inspector",
    title: "Inspector",
    component: InspectorPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 3 — Character panel rendered as a declarative
    // composition over `@paged-media/catalog`. Bindings target content-
    // scope (the current text selection mapped to an
    // ElementId.storyRange); the apply arm at
    // (NodeId::StoryRange, Character*) commits each edit.
    id: "paged.character",
    title: "Character",
    component: CharacterPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 3 — Paragraph panel. Content-scope bindings;
    // apply layer rounds the range to whole paragraphs.
    id: "paged.paragraph",
    title: "Paragraph",
    component: ParagraphPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 — Paragraph Styles list (expert leaf, hybrid
    // candidate). Reads documentCollection:paragraphStyles;
    // applies via appliedParagraphStyle write. Per the
    // panel-catalog doc §5.3 + §5.5.
    id: "paged.paragraph-styles",
    title: "Paragraph Styles",
    component: ParagraphStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 — Character Styles. Direct twin of
    // Paragraph Styles using the same PAGED_INPUT_COLLECTION_SELECT
    // primitive with collectionName: "characterStyles" + a
    // content-scope binding to appliedCharacterStyle. Validates
    // the §9 ≥2-panels rule for the new primitive.
    id: "paged.character-styles",
    title: "Character Styles",
    component: CharacterStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 (v1 sweep) — Object Styles. Element-scope
    // binding to appliedObjectStyle (uses the apply arm shipped
    // with Track A's Task G). collectionName: "objectStyles"
    // routes through the new model accessor.
    id: "paged.object-styles",
    title: "Object Styles",
    component: ObjectStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 (named sweep) — Swatches. Validates the
    // `valueType: "colorRef"` extension to
    // PAGED_INPUT_COLLECTION_SELECT — same primitive that drives
    // Paragraph / Character / Object Styles, now writing a
    // Value::ColorRef payload. Element-scope binding to
    // frameFillColor.
    id: "paged.swatches",
    title: "Swatches",
    component: SwatchesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 (v1 sweep) — Color editor. Fill swatch picker
    // + fill tint scrub. Complements Swatches (the palette
    // browser) per `panel-catalog-and-sdk-extension.md` §6
    // Tier 2b. CMYK/RGB sliders are v2.
    id: "paged.color",
    title: "Color",
    component: ColorPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // Panel-gallery pass — the colour wheel (brand kit
    // color-wheel.jsx, fully live). HSV wheel + value track,
    // HEX/RGB/CMYK/HSL synced fields, colour-theory harmonies;
    // "Add to Swatches" lands the palette as real swatches via
    // one batched createSwatch (single undo). Also reachable
    // from the Color panel.
    id: "paged.color-wheel",
    title: "Color Wheel",
    component: ColorWheelPanel,
    defaultDock: "right",
    defaultGroup: "styles",
    icon: "panel-color",
  },
  {
    // SDK Phase 5 (v1 sweep) — Gradients. Direct twin of Swatches
    // but reading documentCollection:gradients. Both gradients
    // and swatches commit through the same FrameFillColor apply
    // arm (Value::ColorRef payload carrying either a Swatch or
    // Gradient self_id).
    id: "paged.gradients",
    title: "Gradients",
    component: GradientsPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 3 — Stroke panel as a declarative composition.
    // Element-scope bindings over existing FrameStrokeWeight +
    // FrameStrokeColor apply arms.
    id: "paged.stroke",
    title: "Stroke",
    component: StrokePanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 3 — Object/Transform panel. Element-scope bindings
    // over FrameBounds + FrameOpacity.
    id: "paged.object-transform",
    title: "Object",
    component: ObjectTransformPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Text Frame Options. Element-scope
    // binding to frameInsetSpacing (the [top, left, bottom, right]
    // in pt). Vertical-justify + columns + auto-sizing rows join
    // as their apply arms ship.
    id: "paged.text-frame-options",
    title: "Text Frame",
    component: TextFrameOptionsPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Text Wrap. Element-scope bindings
    // to frameTextWrapMode (toggle-group) + frameTextWrapOffsets
    // (bounds). Both share the same Option<TextWrap> backing
    // field — the apply layer preserves the unset half.
    id: "paged.text-wrap",
    title: "Text Wrap",
    component: TextWrapPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Frame Fitting. Rectangle-only.
    // Two rows on the shared Option<FrameFittingOption> field
    // (type toggle-group + crops bounds). Apply arms preserve
    // the unset half.
    id: "paged.frame-fitting",
    title: "Frame Fitting",
    component: FrameFittingPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (named sweep) — Effects (v1 stub). Drop-shadow
    // enabled toggle only; the apply layer materialises a default
    // DropShadowSetting on true. Per-field editors (color,
    // offset, blur) land when their PropertyPaths ship.
    id: "paged.effects",
    title: "Effects",
    component: EffectsPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    id: "paged.layers",
    title: "Layers",
    component: LayersPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 5 (v1 sweep) — read-only document info. Expert
    // leaf wrapping `useDocumentMeta()`. Per the
    // `panel-catalog-and-sdk-extension.md` §6 Tier 5 + §5.6.
    id: "paged.info",
    title: "Info",
    component: InfoPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 5 (v1 sweep) — Attributes editor. v1 surface
    // is the Nonprinting toggle. Per `panel-catalog-and-sdk-
    // extension.md` §6 Tier 5.
    id: "paged.attributes",
    title: "Attributes",
    component: AttributesPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 5 (v1 sweep) — Properties context router. Per
    // `panel-catalog-and-sdk-extension.md` §6 Tier 6 — the
    // "Properties" idiom. Composes Object Transform + Stroke
    // (element scope) and Character + Paragraph (content scope)
    // conditionally on selection state.
    id: "paged.properties",
    title: "Properties",
    component: PropertiesPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Control bar. Horizontal-strip
    // variant of Properties (same compositions, scrollable row
    // layout). Per `panel-catalog-and-sdk-extension.md` §6
    // Tier 6.
    id: "paged.control",
    title: "Control",
    component: ControlPanel,
    defaultDock: "bottom",
    defaultGroup: "chrome",
  },
  {
    id: "paged.repl",
    title: "REPL",
    component: ReplPanel,
    defaultDock: "bottom",
    defaultGroup: "console",
  },
  {
    id: "paged.script-editor",
    title: "Script",
    component: ScriptEditorPanel,
    defaultDock: "bottom",
    defaultGroup: "console",
  },
  {
    // paged.web W-05 — the host problems panel: consumes
    // `host.diagnostics` from EVERY loaded bundle via the injected
    // sink (problems-store), not just inline in a plugin's own panel.
    id: "paged.problems",
    title: "Problems",
    component: ProblemsPanel,
    defaultDock: "bottom",
    defaultGroup: "console",
  },
  // ── Panel-gallery pass — CONCEPT panels (INDESIGN_PARITY.md).
  //    The four ●●● parity surfaces + the two in-scope output/a11y
  //    surfaces, shipped as kit-shaped honest seams with Concept
  //    badges + Target footnotes so the roadmap reads honestly.
  //    Window-menu reachable like every registered panel. ────────
  {
    // W3.A2 — LIVE Table panel: cell fill/insets/vert-justify/applied
    // styles + table style + row-height/col-width + insert/delete
    // row/column, driven by the table cell selection. Cell text edit
    // and row/col counts remain engine-v1 gaps (noted in-panel).
    id: "paged.table",
    title: "Table",
    component: TablePanel,
    defaultDock: "right",
    defaultGroup: "text",
    icon: "panel-table-styles",
  },
  {
    // W2.4 — LIVE: the stop editor rides the whole-list
    // `paragraphTabStops` path (protocol v28).
    id: "paged.tabs",
    title: "Tabs",
    component: TabsPanel,
    defaultDock: "right",
    defaultGroup: "text",
    icon: "ui-flow",
  },
  {
    // PARTIALLY LIVE — the glyph grid inserts via insertText at
    // the caret; font scope awaits the font registry.
    id: "paged.glyphs",
    title: "Glyphs",
    component: GlyphsPanel,
    defaultDock: "right",
    defaultGroup: "text",
    icon: "panel-character",
  },
  {
    // W2.4 — PARTIALLY LIVE: list type + bullet glyph + numbering
    // format ride the v28 list-authoring text paths; list
    // definitions / level / position remain seams.
    id: "paged.bullets-numbering",
    title: "Bullets & Numbering",
    component: BulletsPanel,
    defaultDock: "right",
    defaultGroup: "text",
    icon: "ui-rows",
  },
  {
    // W2.12 — LIVE: anchored-object position controls for a frame
    // anchored into a text story (the W1.16 AnchoredObjectSetting
    // surface). Non-anchored selection states it honestly.
    id: "paged.anchored",
    title: "Anchored Object",
    component: AnchoredPanel,
    defaultDock: "right",
    defaultGroup: "object",
    icon: "ui-pin",
  },
  {
    // Per-object alt text / tagged-PDF role / EPUB conversion —
    // the accessible-output surface (in scope per the parity doc).
    id: "paged.object-export",
    title: "Object Export Options",
    component: ObjectExportPanel,
    defaultDock: "right",
    defaultGroup: "output",
    icon: "ui-accessibility",
  },
  {
    // Style → HTML tag/CSS class/PDF tag mapping for EPUB + tagged
    // PDF.
    id: "paged.export-tagging",
    title: "Export Tagging",
    component: ExportTaggingPanel,
    defaultDock: "right",
    defaultGroup: "output",
    icon: "ui-export",
  },
];

/**
 * plugin-draw D3 — load first-party plugin bundles through the public
 * SDK surface (`@paged-media/plugin-sdk`). One `loadBundle` call per
 * bundle; the returned handle's dispose unregisters every
 * contribution (tools, activation commands, guarded shortcuts), so
 * removing this component removes the plugins cleanly — the
 * platform-honesty smoke test. Side-effect-only child of PagedShell
 * (the CanvasAppIntegration pattern). The thunk resolves the LIVE
 * editor handle per call (the command-registry idiom), so bundle
 * handlers never close over a stale snapshot.
 */
function PluginBundles() {
  const paged = usePaged();
  const pagedRef = useRef(paged);
  pagedRef.current = paged;
  useEffect(() => {
    // Shell actions the host APP owns (the cockpit's panel
    // placement) — injected so the SDK's adapter stays a pure
    // function over the editor handle.
    const shell = {
      openPanel: (id: string) => cockpitActions.openPanel?.(id),
      closePanel: (id: string) => cockpitActions.closeTab?.(id),
      // K-5 / S-11: the host file picker — a bundle gets the chosen files'
      // bytes (read at this boundary; no DOM File crosses the contract).
      pickFile: (options?: { accept?: readonly string[]; multiple?: boolean }) =>
        pickFiles(options),
    };
    // W-04: the host owns the code-editor widget (one editor across
    // every scripting-adjacent plugin). W-05: diagnostics fan out to
    // the Problems panel's store. W3.1: the host owns the SCHEMA-PANEL
    // renderer (a bundle's declarative `PanelSchema` renders from the
    // catalog with visibility/enablement driven by the bundle's
    // published bindings — closes plugin-draw B-01; the renderer
    // satisfies plugin-api's `SchemaPanelRenderer` — asserted below).
    const widgets = { CodeEditor };
    // W-06: the host injects the ASSET SOURCE that backs
    // `host.assets.getFontFace`. v1 is the honest null-path door
    // (document face bytes are not reachable on the main thread — see
    // plugin-asset-source.ts for the verdict + the core/client read that
    // would expose them). Wiring it makes the door + gate + budget LIVE
    // and `supports("assets.fonts@1")` true; paged.web degrades honestly
    // (the substitution badge) until real bytes are served.
    const assetSource = createEditorAssetSource();
    // K-4 / S-08: the OPFS-backed blob store behind host.blob — lets a
    // bundle persist large binary payloads (a workbook) across reloads.
    const blobStore = createEditorBlobStore();
    // D-09 (paged.data §7.1): ONE shared cross-plugin data-provider registry,
    // injected into every bundle host so a provider plugin (paged.data publishing
    // a governed query) and a consumer plugin (paged.sheet sourcing a sheet from
    // it) rendezvous through it — never by direct contact. Flips
    // supports("dataProviders@1") true; absent it the door is the no-registry
    // default (discover empty / register no-op).
    const dataProviders = createDataProviderRegistry();
    const hostOptions = {
      shell,
      widgets,
      assetSource,
      blobStore,
      dataProviders,
      diagnosticsSink: problemsSink,
      schemaPanelRenderer: HostSchemaPanelRenderer as SchemaPanelRendererType,
    };
    const loaded = [
      loadBundle(() => pagedRef.current, drawBundle, hostOptions),
      loadBundle(() => pagedRef.current, webBundle, hostOptions),
      // paged.data (the §7.1 PROVIDER — publishes a governed query) + paged.sheet
      // (the future consumer, S-15). Both rendezvous through `dataProviders`
      // above. Engines boot lazily, so loading them is cheap; a missing engine /
      // DuckDB degrades honestly in-panel (never crashes the app).
      loadBundle(() => pagedRef.current, dataBundle, hostOptions),
      loadBundle(() => pagedRef.current, sheetBundle, hostOptions),
    ];
    return () => {
      for (const l of loaded) l.dispose();
    };
    // Mount-once by design; the ref keeps the handle live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * Canvas-app integration: legacy keyboard + camera + text-editing
 * hooks that read from the shell contexts but key off canvas
 * specifics (page rect math, IDML mutation API). Renders nothing —
 * mounted inside PagedShell as a side-effect-only child.
 */
function CanvasAppIntegration() {
  const client = useCanvasClient();
  const { camera, setCamera, viewportSize } = useCamera();
  const { handle } = useDocument();
  const { contentSelection, setContentSelection } = useContentSelection();
  const registries = useRegistries();

  const animateCamera = useAnimatedCamera(camera, setCamera);
  useKeyboardShortcuts({
    pageIds: handle?.pageIds ?? [],
    pageSizesPt: handle?.pageSizesPt ?? [],
    camera,
    viewportSize,
    animateCamera,
  });
  useTextEditing({
    client,
    selection: contentSelection,
    setSelection: setContentSelection,
  });
  usePathEditMode();

  // Cockpit — the thumbnail filmstrip / document map navigate by
  // page indices; the camera-fit math (page layout convention) is
  // app-side, registered with the shell's navigation hand-off.
  useEffect(() => {
    setCockpitPageNavigator((pageIndices) => {
      const pageSizes = handle?.pageSizesPt ?? [];
      if (pageSizes.length === 0 || pageIndices.length === 0) return;
      const rects = layoutPages(pageSizes);
      const targets = pageIndices.map((i) => rects[i]).filter((r) => r != null);
      if (targets.length === 0) return;
      const [vw, vh] = viewportSize;
      animateCamera(fitCamera(vw, vh, documentBounds(targets)));
    });
    return () => setCockpitPageNavigator(null);
  }, [animateCamera, handle, viewportSize]);

  // SDK Phase 4 — register canvas-app commands + menu items +
  // keybindings. Closures capture the *current* camera / handle /
  // viewportSize so the zoom commands see live values; dependency
  // array re-runs on each change. The registries' dedupe-by-id
  // contract means re-registration is safe (the dispose from the
  // previous run drops the stale handler before we add the new one).
  useEffect(() => {
    const [vw, vh] = viewportSize;
    const pageSizes = handle?.pageSizesPt ?? [];
    const rects = layoutPages(pageSizes);
    const commands = buildAppCommands({
      undo: () => {
        void client.undo();
      },
      redo: () => {
        void client.redo();
      },
      // W3.B2 — Save As IDML: serialise the loaded document to an
      // `.idml` package and trigger a browser download (mirrors the
      // PDF export's Blob → object-URL → anchor-click pattern). The
      // filename comes from the document meta; bail quietly when no
      // document is open.
      saveAsIdml: async () => {
        if (!handle || handle.pageCount === 0) return;
        try {
          const bytes = await client.exportIdml();
          let baseName = "document";
          try {
            const meta = await client.documentMeta();
            if (meta.documentName) baseName = meta.documentName;
          } catch {
            /* meta unavailable — keep the default name */
          }
          const blob = new Blob([bytes.slice()], {
            type: "application/vnd.adobe.indesign-idml-package",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${baseName.replace(/\.idml$/i, "")}.idml`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Save As IDML failed:", err);
        }
      },
      zoomIn: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        const newScale = camera.scale * 1.5;
        animateCamera({
          scale: newScale,
          tx: cx - docX * newScale,
          ty: cy - docY * newScale,
        });
      },
      zoomOut: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        const newScale = camera.scale / 1.5;
        animateCamera({
          scale: newScale,
          tx: cx - docX * newScale,
          ty: cy - docY * newScale,
        });
      },
      zoom100: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        animateCamera({ scale: 1, tx: cx - docX, ty: cy - docY });
      },
      zoomFit: () => {
        if (rects.length === 0) return;
        animateCamera(fitCamera(vw, vh, documentBounds(rects)));
      },
    });
    const cmdDisposables = commands.map((c) => registries.commands.register(c));
    const menuDisposables = [...APP_MENU_ITEMS, ...COCKPIT_MENU_SEAMS].map(
      (m) => registries.menus.register(m),
    );
    const keyDisposables = APP_KEYBINDINGS.map((k) =>
      registries.keybindings.register(k),
    );
    return () => {
      for (const d of cmdDisposables) d.dispose();
      for (const d of menuDisposables) d.dispose();
      for (const d of keyDisposables) d.dispose();
    };
  }, [registries, client, camera, viewportSize, handle, animateCamera]);

  return null;
}

/**
 * Root: owns the CanvasClient lifecycle and hands it to PagedShell.
 */
function CanvasAppRoot() {
  const [client, setClient] = useState<CanvasClient | null>(null);

  useEffect(() => {
    // SDK Phase 1 — `@paged-media/client` is framework-agnostic, so the
    // Worker is constructed HERE in the app's module graph. We hand the
    // client a `workerFactory` backed by Vite's `?worker` import (see the
    // top-of-file import): Vite then fully bundles the worker chunk and its
    // `?url` wasm asset, instead of opaquely copying a raw `.ts` URL across
    // the package boundary (the D6/E8 prod-dist bug).
    const c = new CanvasClient({
      workerFactory: () => new CanvasRenderWorker(),
    });
    setClient(c);
    return () => {
      c.dispose();
      setClient(null);
    };
  }, []);

  if (!client) {
    return (
      <div
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
          padding: 16,
        }}
      >
        initialising worker…
      </div>
    );
  }

  return (
    <PagedShell
      client={client}
      panels={BUILT_IN_PANELS}
      overlays={BUILT_IN_OVERLAYS}
      tools={BUILT_IN_TOOLS}
      modes={COCKPIT_MODES}
      panelRail={PANEL_RAIL}
      canvasComponent={CanvasPanel}
      headerExtras={<CorpusPicker />}
    >
      <CanvasAppIntegration />
      <PluginBundles />
    </PagedShell>
  );
}

// Fail fast + loud if the static host didn't ship the COOP/COEP headers the
// worker's SharedArrayBuffer needs — otherwise the app dies deep in the worker
// with an opaque SecurityError far from the real cause (W0.17).
assertCrossOriginIsolated();

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}
createRoot(root).render(
  <StrictMode>
    <CanvasAppRoot />
  </StrictMode>,
);
