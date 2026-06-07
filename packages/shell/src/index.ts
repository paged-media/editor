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
  type ToolPreviewPolyline,
  type ToolPreviewShape,
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
} from "./registries";

// ── W3.2 — edit-context + object-type registries (B-02 / W-03) ──
export {
  createEditContextRegistry,
  createObjectTypeRegistry,
  resolveDoubleClick,
  type EditContextContribution,
  type ObjectTypeContribution,
  type EditContextCandidate,
  type EnteredEditContext,
  type EditContextRegistry,
  type ObjectTypeRegistry,
  type EditContextRegistryEvent,
  type ObjectTypeRegistryEvent,
  type DoubleClickResolution,
} from "./registries/edit-context";
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

// ── Built-in commands ──────────────────────────────────────────
export {
  buildOpenIdmlCommand,
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
  type DocumentLoaderCallbacks,
} from "./state/document-loader";

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
} from "./catalog/schema-panel-types";
export { TogglePill, displayName } from "./catalog/leaves";
export { useBindings, type ResolvedBinding } from "./catalog/binding-hook";
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
  PAGED_LAYOUT_SECTION,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LABEL,
} from "./catalog/built-in";
