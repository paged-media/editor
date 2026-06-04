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
  type ToolPreviewPolyline,
  type ToolPreviewShape,
} from "./state/overlay-signals-context";

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
  createPanelRegistry,
  createCommandRegistry,
  createSemanticGroupRegistry,
  createKeybindingRegistry,
  createMenuRegistry,
  createOverlayRegistry,
  createToolRegistry,
} from "./registries";

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

// ── Chrome ─────────────────────────────────────────────────────
export { CommandPalette } from "./chrome/CommandPalette";
export { MenuBar } from "./chrome/MenuBar";

// ── Icons (Concept 1 — shared tool + panel glyph resolver) ─────
export { Icon, hasIcon, type IconProps } from "./icons";

// ── Persistence ────────────────────────────────────────────────
export {
  PERSPECTIVES_CHANGED_EVENT,
  clearStoredLayout,
  deletePerspective,
  exportPerspective,
  getPerspective,
  importPerspective,
  listPerspectives,
  restoreLayoutOrDefault,
  savePerspective,
  setupLayoutPersistence,
} from "./persistence/layout-persistence";

// ── Hooks ──────────────────────────────────────────────────────
export {
  useModifierState,
  type ModifierState,
} from "./hooks/useModifierState";

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
  selectionChromeContribution,
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

// ── Docking substrate ──────────────────────────────────────────
export {
  DockviewSubstrate,
  DockviewRoot,
  DockingSubstrateProvider,
  PanelBridge,
  useDockingSubstrate,
  type DockingSubstrate,
  type LayoutSnapshot,
  type PanelHandle,
  type ResolvedPanelSpec,
  type SemanticLocation,
} from "./docking";

// ── SDK Phase 3 — declarative catalog renderer + primitive leaves
export {
  CompositionRenderer,
  CatalogRegistryProvider,
} from "./catalog/render";
export { useBindings, type ResolvedBinding } from "./catalog/binding-hook";
export { useCollection, useDocumentMeta } from "./catalog/use-collection";
export {
  registerBuiltInCatalogEntries,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_COLLECTION_SELECT,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_LAYOUT_SECTION,
  PAGED_LABEL,
} from "./catalog/built-in";
