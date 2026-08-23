/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// @paged-media/shell — application-shell scaffolding for the canvas
// editor. Owns the React state contexts, registries, docking
// substrate, and command palette per
// `docs/paged/editor-architecture.md` §17.

// ── State contexts ─────────────────────────────────────────────
export {
  CanvasClientProvider,
  useCanvasClient,
  useOptionalCanvasClient,
} from "./state/canvas-client-context";

export {
  CameraProvider,
  useCamera,
  type ViewportSize,
} from "./state/camera-context";

export {
  DocumentProvider,
  useDocument,
  type LoadingState,
} from "./state/document-context";

export {
  SelectionProvider,
  useSelection,
  type ActiveTool,
} from "./state/selection-context";

export {
  ContentSelectionProvider,
  useContentSelection,
} from "./state/content-selection-context";

// ── Tool stack (Concept 1) ─────────────────────────────────────
export {
  ToolProvider,
  useTool,
  useOptionalTool,
  SELECT_TOOL_ID,
  TEXT_TOOL_ID,
  HAND_TOOL_ID,
  DIRECT_SELECT_TOOL_ID,
  ZOOM_TOOL_ID,
  type ActiveToolState,
  type ToolChangeReason,
  type ToolContextValue,
} from "./state/tool-context";
export { useSpringLoadedTools } from "./tools/use-spring-loaded-tools";

export {
  ScreenModeProvider,
  useScreenMode,
  useOptionalScreenMode,
  SCREEN_MODES,
  type ScreenMode,
} from "./state/screen-mode-context";

export { resolveCursorCss } from "./tools/cursor";
export type { CursorSpec, CssCursorToken } from "./tools/cursor";
export type {
  GestureHandler,
  CanvasPointerEvent,
  OverlayContext,
  OverlayPrimitive,
  DeactivateReason,
} from "./tools/gesture-handler";
export { GestureSpine } from "./tools/gesture-spine";
export type {
  ToolOptionsSpec,
  ToolOptionField,
  ToolSettings,
} from "./tools/tool-options";
export {
  ToolSettingsProvider,
  useToolSettings,
} from "./state/tool-settings-context";

export {
  FormattingAffectsProvider,
  useFormattingAffects,
  useOptionalFormattingAffects,
  type FillStrokeWell,
  type FormattingAffects,
} from "./state/formatting-affects-context";

export {
  OverlaySignalsProvider,
  useOverlaySignals,
  useOptionalOverlaySignals,
  type MarqueeRectPageLocal,
  type SelectionState,
  type ToolPreviewGrid,
  type ToolPreviewPath,
  type ToolPreviewPolyline,
  type ToolPreviewShape,
  // K-9 — what the tool-preview slot holds: one shape or a list.
  type ToolPreviewSlot,
  type ToolPreviewText,
} from "./state/overlay-signals-context";

// W2.8 — guide creation/drag state (rulers + overlay + controller).
export {
  GuideDragProvider,
  useGuideDrag,
  useOptionalGuideDrag,
  type GuideOrientation,
  type GuideDragState,
  type OptimisticGuide,
} from "./state/guide-drag-context";

// W2.9 — text-frame threading state (ports + controller + loaded
// cursor).
export {
  ThreadingProvider,
  useThreading,
  useOptionalThreading,
  type LoadedCursor,
  type ChainState,
} from "./state/threading-context";

// W3.A2 — table cell selection state (hit handler + Table panel +
// cell overlay).
export {
  TableSelectionProvider,
  useTableSelection,
  useOptionalTableSelection,
  tableCellElementId,
  type TableCellSelection,
} from "./state/table-selection-context";

// Concept 2 — the gradient ramp (pure; reused by the editor panel
// and the FillStrokeCluster chips).
export {
  GradientRamp,
  rampCss,
  type GradientRampProps,
  type RampStop,
} from "./color/GradientRamp";

export {
  InstrumentationProvider,
  useInstrumentation,
} from "./state/instrumentation-context";

// ── Editor handle + registries provider ────────────────────────
export {
  PagedEditorProvider,
  usePaged,
  useOptionalPaged,
  type PagedEditor,
} from "./state/paged-editor";

export {
  RegistriesProvider,
  useRegistries,
  type ShellRegistries,
} from "./state/registries-context";

// ── Registry primitives ────────────────────────────────────────
export {
  type CommandContribution,
  type CommandInvocation,
  type CommandInvocationEvent,
  type CommandObserver,
  type CommandRegistry,
  type DockEdge,
  type Disposable,
  type KeybindingContribution,
  type KeybindingRegistry,
  type MenuItemContribution,
  type MenuRegistry,
  type MenuRegistryEvent,
  type OverlayContribution,
  type OverlayPageRect,
  type OverlayProps,
  type OverlayRegistry,
  type OverlayRegistryEvent,
  type PanelApi,
  type PanelContribution,
  type PanelProps,
  type PanelRegistry,
  type PanelRegistryEvent,
  type SemanticGroupRegistry,
  type Tool,
  type ToolContribution,
  type ToolId,
  type ToolGroupId,
  type ToolSectionId,
  type ToolStatus,
  type ToolRegistry,
  type ToolRegistryEvent,
  type VisibilityPredicate,
  DEFAULT_TOOLS,
  type ModeCockpitSlots,
  type ModeContribution,
  type ModeRegistry,
  type ModeRegistryEvent,
  type ModeToolbarProps,
  createModeRegistry,
  createPanelRegistry,
  createCommandRegistry,
  createSemanticGroupRegistry,
  createKeybindingRegistry,
  createMenuRegistry,
  createOverlayRegistry,
  createToolRegistry,
  isEnabled,
  panelBelongsHere,
} from "./registries";

// ── W3.2 — edit-context + object-type registries (B-02 / W-03) ──
export {
  createEditContextRegistry,
  createObjectTypeRegistry,
  resolveDoubleClick,
  type EditContextContribution,
  type ContentPointerEvent,
  type ObjectTypeContribution,
  type EditContextCandidate,
  type EnteredEditContext,
  type EditContextRegistry,
  type ObjectTypeRegistry,
  type EditContextRegistryEvent,
  type ObjectTypeRegistryEvent,
  type DoubleClickResolution,
} from "./registries/edit-context";
// ── K-2 / S-06 — document importer + exporter registries (Wave 3 IO) ──
export {
  createImporterRegistry,
  createExporterRegistry,
  fileExtension,
  type ImporterContribution,
  type ImportRequest,
  type ExporterContribution,
  type ExportResult,
  type ImporterRegistry,
  type ExporterRegistry,
  type ImporterRegistryEvent,
  type ExporterRegistryEvent,
} from "./registries/document-io";
export {
  EditContextStackProvider,
  useEditContextStack,
  useOptionalEditContextStack,
  type EditContextFrame,
  type EditContextStackValue,
} from "./state/edit-context-stack";
export { EditContextBreadcrumb } from "./chrome/EditContextBreadcrumb";
export {
  useEditContextEntry,
  type DoubleClickHit,
} from "./state/use-edit-context-entry";
export {
  useSelectionObjectType,
  type SelectionObjectType,
} from "./state/use-selection-object-type";

// ── Built-in commands ──────────────────────────────────────────
export {
  buildNewDocumentCommand,
  buildOpenIdmlCommand,
  PAGED_FILE_NEW,
  PAGED_FILE_OPEN_IDML,
} from "./state/commands/file-commands";
export {
  buildExportAseCommand,
  buildImportAseCommand,
  importAseBytes,
  PAGED_LIBRARY_EXPORT_ASE,
  PAGED_LIBRARY_IMPORT_ASE,
} from "./state/commands/library-commands";
export {
  WorkflowModeProvider,
  useWorkflowMode,
  useOptionalWorkflowMode,
  type WorkflowMode,
} from "./state/workflow-mode-context";
export { ContextToolbar } from "./chrome/ContextToolbar";
export { ModeSwitcher } from "./chrome/ModeSwitcher";
export { PanelRail, type PanelRailItem } from "./chrome/PanelRail";
export { ThemeToggle } from "./chrome/Header";
export {
  ThemeProvider,
  useTheme,
  useOptionalTheme,
  type EditorTheme,
} from "./state/theme-context";
export {
  buildExportPdfCommand,
  PAGED_FILE_EXPORT_PDF,
} from "./state/commands/export-commands";
export { notifyExportPdfDialog } from "./chrome/ExportPdfDialog";

// ── Loaders ────────────────────────────────────────────────────
export {
  loadDocumentFile,
  fetchDefaultFont,
  type DocumentLoaderCallbacks,
} from "./state/document-loader";
export {
  setPendingImportSource,
  takePendingImportSource,
} from "./state/import-source";

// ── Shell root ─────────────────────────────────────────────────
export { PagedShell, type PagedShellProps } from "./PagedShell";

// ── Cockpit (the fixed publishing-cockpit layout) ──────────────
export {
  CockpitLayout,
  CockpitStateProvider,
  PanelHost,
  RightDock,
  cockpitActions,
  groupSpreads,
  navigateToPages,
  setCockpitPageNavigator,
  useCockpitState,
  useOptionalCockpitState,
  type CockpitLayoutProps,
  type CockpitState,
  type InspectorContext,
  type PageNavigator,
  type SpreadEntry,
} from "./cockpit";

// ── Chrome ─────────────────────────────────────────────────────
export { CommandPalette } from "./chrome/CommandPalette";
export { MenuBar } from "./chrome/MenuBar";

// ── Icons (Concept 1 — shared tool + panel glyph resolver) ─────
export {
  Icon,
  hasIcon,
  type IconProps,
  TOOL_GLYPHS,
  PANEL_GLYPHS,
  UI_GLYPHS,
} from "./icons";

// ── Hooks ──────────────────────────────────────────────────────
export { useModifierState, type ModifierState } from "./hooks/useModifierState";

// ── Gestures ───────────────────────────────────────────────────
export {
  useScrubGesture,
  type ScrubGesture,
  type ScrubGestureOptions,
} from "./gestures/use-scrub-gesture";

// SDK Phase 1 — gesture SAB primitives moved to `@paged-media/client`
// alongside camera SAB and the framework-agnostic CanvasClient.
// Re-exported here so existing `@paged-media/shell` consumers keep
// working without an import-path change.
export {
  GestureBuffer,
  GESTURE_SAB_BYTES,
  GESTURE_MODIFIER_SHIFT,
  GESTURE_MODIFIER_ALT,
  supportsGestureSab,
  type GestureUpdateRecord,
} from "@paged-media/client";

// ── Overlay layer ──────────────────────────────────────────────
export {
  OverlayHost,
  caretContribution,
  contentGrabberContribution,
  elementSupportsPathEdit,
  hitMarkerContribution,
  marqueeContribution,
  toolPreviewContribution,
  pageDecorationsContribution,
  pathEditContribution,
  resizeHandlesContribution,
  rotateHandleContribution,
  rulerGuidesContribution,
  guideOverlayContribution,
  selectionChromeContribution,
  threadingPortsContribution,
  threadLinesContribution,
  tableCellOverlayContribution,
  snapLinesContribution,
  applyAffine,
  type IdmlAffine,
  type OverlayHostProps,
} from "./overlays";

// ── Bundles ────────────────────────────────────────────────────
export {
  loadBundle,
  sampleBundleManifest,
  type BundleHandle,
  type BundleManifest,
  type BundleToShell,
  type ShellToBundle,
} from "./bundles";

// ── SDK Phase 3 — declarative catalog renderer + primitive leaves
export { CompositionRenderer, CatalogRegistryProvider } from "./catalog/render";
// ── W3.1 — the plugin SCHEMA-PANEL renderer (closes plugin-draw B-01):
//    renders a bundle's declarative `PanelSchema` from the catalog and
//    gates rows/sections on the bundle's published bindings.
export { SchemaPanelRenderer } from "./catalog/schema-panel-renderer";
export { resolveGate as resolveSchemaGate } from "./catalog/schema-gate";
export type {
  PanelSchema as ShellPanelSchema,
  PanelSchemaSection as ShellPanelSchemaSection,
  PanelSchemaRow as ShellPanelSchemaRow,
  SchemaGate as ShellSchemaGate,
  BindingsSurface as ShellBindingsSurface,
  SchemaPanelRendererProps as ShellSchemaPanelRendererProps,
  // B-01/G3 (schema v1.1, additive) — the list widget + applyEntity
  // vocabulary.
  WidgetCollectionBinding as ShellWidgetCollectionBinding,
  SchemaRowAction as ShellSchemaRowAction,
  SchemaListAction as ShellSchemaListAction,
  SchemaListSpec as ShellSchemaListSpec,
  // Schema v1.2 (additive) — tree rows / drag-reorder / inline rename.
  SchemaTreeSpec as ShellSchemaTreeSpec,
  SchemaListReorder as ShellSchemaListReorder,
  SchemaReorderAction as ShellSchemaReorderAction,
  SchemaReorderPayload as ShellSchemaReorderPayload,
  SchemaListRename as ShellSchemaListRename,
  SchemaRenameAction as ShellSchemaRenameAction,
  SchemaRenamePayload as ShellSchemaRenamePayload,
} from "./catalog/schema-panel-types";
// ── ADR 023 phase C — the HOST side of the binding-provider seam: the
//    hooks a host-owned panel uses to read/write through the shared
//    registry, with fall-through to core. The app builds the ONE
//    registry (plugin-sdk `createBindingProviderRegistry`) and injects
//    it here; the shell keeps a structural MIRROR of its host-facing
//    slice for the same reason schema-panel-types.ts mirrors the schema
//    contract (the shell does not depend on plugin-api).
export {
  BindingProviderProvider,
  useBindingProviderHost,
  useActiveBindingProviders,
  useCollectionPathOffered,
  useCollectionOpOffered,
  useProvidedCollection,
  useProviderProperty,
  useProviderFirstMutate,
  useSelectionPathWritable,
  resolveSelectionProperty,
  writeSelectionProperty,
  type ShellBindingProviderHost,
  type ShellActiveBindingProvider,
  type ShellBindingProviderScope,
  type ShellBindingTarget,
  type ShellBindingResolved,
  type ShellBindingReadResult,
  type ShellBindingWriteResult,
  type ShellBindingCollectionResult,
  type ProvidedCollection,
  type ProvidedProperty,
  type ProvidedWrite,
  type SelectionResolution,
} from "./catalog/binding-providers";
// The tree arithmetic is pure and exported so a panel (or a future
// virtualized primitive) can flatten the same way the renderer does.
export {
  buildSchemaTreeRows,
  visibleSchemaTreeRows,
  flatSchemaTreeRows,
  type SchemaTreeRow,
} from "./catalog/schema-tree";
// Editor-side BindingsSurface for host-owned schema panels (demo /
// consumer-proof panels, specs).
export { createLocalBindingsSurface } from "./catalog/local-bindings";
export {
  TogglePill,
  displayName,
  type ListLeafAction,
  type ListLeafTree,
  type ListLeafReorder,
  type ListLeafRename,
} from "./catalog/leaves";
export {
  useBindings,
  type ResolvedBinding,
  type BindingState,
} from "./catalog/binding-hook";
export {
  useCollection,
  useDocumentMeta,
  useDocumentStats,
} from "./catalog/use-collection";
export {
  PanelHeader as CockpitPanelHeader,
  Section as CockpitSection,
  Label as CockpitLabel,
  Row as CockpitRow,
  Btn as CockpitBtn,
  StatusPill,
  StatusBadge,
  PanelTarget,
  Value as CockpitValue,
  MetricTile,
  ComingSoon,
  statusColor,
  type StatusTone,
  type PanelStatus,
} from "./components/cockpit/kit";
export { AIAssistantSeam } from "./components/cockpit/ai-assistant-seam";
export {
  ListRows,
  PanelToolbar,
  ToolbarBtn,
  type ListRowSpec,
  type ListRowBadge,
} from "./components/cockpit/list-rows";
export {
  ApplyList,
  type ApplyStyleItem,
  type ApplyStyleGroup,
} from "./components/cockpit/apply-list";
export { ReferencePointGrid } from "./components/cockpit/reference-point-grid";
export {
  registerBuiltInCatalogEntries,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_COLLECTION_SELECT,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_INPUT_SELECT,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_READOUT,
  PAGED_LIST,
  PAGED_LAYOUT_SECTION,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LABEL,
} from "./catalog/built-in";

// Live-demo / playground scripting surface (the demo build + the docs playground
// consume these). The automation handle + narration overlay are dev/demo-gated
// at the mount site (PagedShell).
export {
  DemoSession,
  splitTopLevelStatements,
  buildAutomation,
  runDemoScript,
  runDemoScriptWithHandle,
  DemoOverlay,
  DemoSpotlight,
  demoShowInfo,
  demoHighlight,
  demoResetOverlay,
} from "./demo";
export type {
  Statement,
  SessionState,
  SessionStatus,
  DemoSessionOptions,
  CanvasHandleLike,
  DemoGlobals,
  AutomationOptions,
  PagedScriptApi,
  EditorAutomationApi,
  DemoNarrationApi,
  DemoInfoRequest,
  RunResult,
} from "./demo";

// ── Actions — record / replay a command sequence ────────────────
export * from "./actions";

export {
  getOpenFileHandle,
  setOpenFileHandle,
  supportsFileHandles,
  writeToOpenFile,
  type WritableFileHandle,
} from "./state/open-file-handle";

export {
  getViewToggle,
  resetViewToggles,
  setViewToggle,
  subscribeViewToggles,
  toggleViewToggle,
  type ViewToggle,
} from "./state/view-toggles";

export {
  awaitPlacementPoint,
  cancelPendingPlacement,
  placementArmed,
  type PlacementPoint,
} from "./state/pending-placement";

export {
  ALWAYS_IN_PALETTE,
  applicabilityOf,
  applicabilityHint,
  applicabilityStyle,
  type Applicability,
  type ApplicabilityStyle,
  type SurfaceKind,
} from "./chrome/applicability";
