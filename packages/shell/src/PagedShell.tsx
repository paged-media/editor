// The shell root. Composes every provider, registers the supplied
// panels + the built-in file-open command, hosts the chrome
// (header, warnings, command palette), and mounts DockviewRoot
// as the main work area.
//
// Apps render `<PagedShell client={...} panels={...}>{integration}</PagedShell>`
// where `integration` is a (renderless) component that uses the
// editor hooks to install canvas-app-specific keyboard / camera /
// text-editing behavior. Keeping that outside PagedShell preserves
// the shell's app-agnostic surface — the canvas-specific hooks
// import from `apps/canvas/src/ui/` without dragging shell into
// canvas internals.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { CanvasClient } from "@paged-media/client";
// eslint-disable-next-line import/no-relative-parent-imports
import { supportsSharedArrayBuffer } from "@paged-media/client";
// eslint-disable-next-line import/no-relative-parent-imports
import type { WorkerToMain } from "@paged-media/client";

import {
  CanvasClientProvider,
  useCanvasClient,
} from "./state/canvas-client-context";
import { CameraProvider } from "./state/camera-context";
import {
  ContentSelectionProvider,
  useContentSelection,
} from "./state/content-selection-context";
import { DocumentProvider, useDocument } from "./state/document-context";
import {
  InstrumentationProvider,
  useInstrumentation,
} from "./state/instrumentation-context";
import { OverlaySignalsProvider } from "./state/overlay-signals-context";
import { SelectionProvider, useSelection } from "./state/selection-context";
import { ToolProvider } from "./state/tool-context";
import { ScreenModeProvider } from "./state/screen-mode-context";
import { ThemeProvider, useTheme } from "./state/theme-context";
import { useOptionalPaged } from "./state/paged-editor";
import { useModeLayout } from "./docking/use-mode-layout";
import { Header } from "./chrome/Header";
import { ContextToolbar } from "./chrome/ContextToolbar";
import { ModeSwitcher } from "./chrome/ModeSwitcher";
import { PanelRail, type PanelRailItem } from "./chrome/PanelRail";
import {
  WorkflowModeProvider,
  useWorkflowMode,
} from "./state/workflow-mode-context";
import type { ModeContribution } from "./registries/mode";
import { ToolSettingsProvider } from "./state/tool-settings-context";
import { FormattingAffectsProvider } from "./state/formatting-affects-context";
import { PagedEditorProvider } from "./state/paged-editor";
import { useRegistries } from "./state/registries-context";
import { CommandPalette } from "./chrome/CommandPalette";
import { ExportPdfDialog } from "./chrome/ExportPdfDialog";
import { ToolRail } from "./chrome/ToolRail";
import { ScreenModeSelector } from "./chrome/ScreenModeSelector";
import { FillStrokeCluster } from "./chrome/FillStrokeCluster";
import { SoftProofToggle } from "./chrome/SoftProofToggle";
import { DockviewRoot } from "./docking/DockviewRoot";
import { DockingSubstrateProvider } from "./docking/substrate-context";
import { loadDocumentFile } from "./state/document-loader";
import {
  PAGED_FILE_OPEN_IDML,
  buildOpenIdmlCommand,
} from "./state/commands/file-commands";
import {
  buildExportAseCommand,
  buildImportAseCommand,
} from "./state/commands/library-commands";
import {
  buildExportPdfCommand,
  PAGED_FILE_EXPORT_PDF,
} from "./state/commands/export-commands";
import {
  PALETTE_TOGGLE_COMMAND,
  PALETTE_TOGGLE_KEYBINDING,
  PALETTE_TOGGLE_KEYBINDING_CTRL,
  PERSPECTIVE_EXPORT_COMMAND,
  PERSPECTIVE_IMPORT_COMMAND,
  PERSPECTIVE_SAVE_AS_COMMAND,
  PAGED_PALETTE_TOGGLE,
  PAGED_PERSPECTIVE_EXPORT,
  PAGED_PERSPECTIVE_IMPORT,
  PAGED_PERSPECTIVE_SAVE_AS,
  buildPanelToggleCommands,
  buildPerspectiveLifecycleCommands,
} from "./state/commands/built-in-commands";
import {
  buildToolbarContributions,
  contentSelectionInactive,
} from "./state/commands/tool-commands";
import { useSpringLoadedTools } from "./tools/use-spring-loaded-tools";
import type { PagedEditor } from "./state/paged-editor";
import type { LayoutSnapshot } from "./docking/substrate";
import {
  PERSPECTIVES_CHANGED_EVENT,
  listPerspectives,
} from "./persistence/layout-persistence";
import type { OverlayContribution } from "./registries/overlay";
import type { PanelContribution } from "./registries/panel";
import type { ToolContribution } from "./registries/tool";
import type { Disposable } from "./registries/types";
import { useFps } from "./hooks/useFps";

export interface PagedShellProps {
  client: CanvasClient;
  /** Panel contributions to register at shell startup. */
  panels: PanelContribution[];
  /** Overlay contributions to register at shell startup. Same
   *  pattern as `panels` — apps decide which overlays to mount,
   *  bundles add more via the registry. */
  overlays?: OverlayContribution[];
  /** Tool contributions to register at shell startup. The left
   *  ToolRail renders the ToolRegistry; same data-driven pattern as
   *  `panels` / `overlays`. */
  tools?: ToolContribution[];
  /** Optional extra chrome inserted into the header between the
   * menu bar and the file picker. Apps use this for shell-host-
   * specific controls (zoom indicator, color profile selector,
   * fps badge, …) that don't fit the panel-or-menu pattern. */
  headerExtras?: ReactNode;
  /** Cockpit — workflow-mode contributions (Design / Content /
   * Prepress / Data layout / Review / Export). Same data-driven
   * pattern as `panels`; the ModeSwitcher renders the registry. */
  modes?: ModeContribution[];
  /** Cockpit — the right-edge panel launcher's entries. Each must
   * name a REGISTERED panel id. Empty/omitted hides the rail. */
  panelRail?: PanelRailItem[];
}

/**
 * Top-level shell. Wraps the chrome in every provider so consumers
 * (including the `integration` child) have access to the editor
 * hooks. `client` is created by the app and passed in — PagedShell
 * doesn't own the worker lifecycle.
 */
export function PagedShell({
  client,
  panels,
  overlays,
  tools,
  headerExtras,
  modes,
  panelRail,
  children,
}: PropsWithChildren<PagedShellProps>) {
  return (
    <DebugErrorBoundary label="paged-shell">
      <CanvasClientProvider client={client}>
        <ThemeProvider>
          <CameraProvider>
            <DocumentProvider>
              {/* ToolProvider above SelectionProvider: the selection
               *  context's `activeTool` facade reads the tool stack. */}
              <ToolProvider>
                <WorkflowModeProvider>
                  <ScreenModeProvider>
                    <ToolSettingsProvider>
                      <FormattingAffectsProvider>
                        <SelectionProvider>
                          <ContentSelectionProvider>
                            <OverlaySignalsProvider>
                              <InstrumentationProvider>
                                {/* DockingSubstrateProvider above PagedEditorProvider so
                                 *  the editor handle (`paged.substrate`) sees the live
                                 *  substrate once DockviewRoot's onReady publishes it. */}
                                <DockingSubstrateProvider>
                                  <PagedEditorProvider>
                                    <ShellChrome
                                      panels={panels}
                                      overlays={overlays}
                                      tools={tools}
                                      headerExtras={headerExtras}
                                      modes={modes}
                                      panelRail={panelRail}
                                    >
                                      {children}
                                    </ShellChrome>
                                  </PagedEditorProvider>
                                </DockingSubstrateProvider>
                              </InstrumentationProvider>
                            </OverlaySignalsProvider>
                          </ContentSelectionProvider>
                        </SelectionProvider>
                      </FormattingAffectsProvider>
                    </ToolSettingsProvider>
                  </ScreenModeProvider>
                </WorkflowModeProvider>
              </ToolProvider>
            </DocumentProvider>
          </CameraProvider>
        </ThemeProvider>
      </CanvasClientProvider>
    </DebugErrorBoundary>
  );
}

/**
 * Inner shell — reads from the contexts and renders the actual
 * chrome. Registers the supplied panels + the file-open command at
 * mount; runs the consolidated worker-message subscribe; publishes
 * fps into the instrumentation context.
 */
function ShellChrome({
  panels,
  overlays,
  tools,
  headerExtras,
  modes,
  panelRail,
  children,
}: PropsWithChildren<{
  panels: PanelContribution[];
  overlays?: OverlayContribution[];
  tools?: ToolContribution[];
  headerExtras?: ReactNode;
  modes?: ModeContribution[];
  panelRail?: PanelRailItem[];
}>) {
  const client = useCanvasClient();
  const {
    handle,
    snapshotsReady,
    setHandle,
    setLoading,
    setSnapshots,
    setSnapshotsReady,
    setResolution,
    resetForNewDocument,
  } = useDocument();
  const {
    elementSelection,
    setElementSelection,
    elementGeometry,
    activeTool,
    setActiveTool,
    activeGroup,
    setActiveGroup,
  } = useSelection();
  const { theme, setTheme } = useTheme();
  const { mode: workflowMode, setMode: setWorkflowMode } = useWorkflowMode();
  const paged = useOptionalPaged();
  const {
    contentSelection,
    setContentSelection,
    setCaret,
    setSelectionRects,
    contentSelectionRef,
  } = useContentSelection();
  const { setFps, setGpuActive, setLayoutCacheStats } = useInstrumentation();
  const registries = useRegistries();

  // Concept 1 (T2) — Space → Hand, Cmd → Direct Selection, Cmd+Space →
  // Zoom spring-loading onto the active-tool stack.
  useSpringLoadedTools();

  const [status, setStatus] = useState<string>("initialising worker…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const sabSupported = useMemo(() => supportsSharedArrayBuffer(), []);

  // Editor-ops — the worker-message subscriber below needs the live
  // document handle (to refresh the page grid on page-structure
  // mutations) without re-subscribing per handle change.
  const handleRef = useRef(handle);
  handleRef.current = handle;

  // Publish main-thread FPS for the canvas HUD.
  const fps = useFps();
  useEffect(() => {
    setFps(fps);
  }, [fps, setFps]);

  // Register the supplied panels + auto-generate show/hide
  // commands for each. The ref guards against the StrictMode
  // double-mount cycle.
  const panelsRegistered = useRef(false);
  useEffect(() => {
    if (panelsRegistered.current) return;
    panelsRegistered.current = true;
    const disposables = panels.flatMap((p) => {
      const [show, hide] = buildPanelToggleCommands(p);
      return [
        registries.panels.register(p),
        registries.commands.register(show),
        registries.commands.register(hide),
      ];
    });
    return () => {
      for (const d of disposables) d.dispose();
      panelsRegistered.current = false;
    };
  }, [registries, panels]);

  // Register the supplied overlay contributions. Same ref guard
  // for StrictMode double-mount; OverlayHost re-renders when the
  // registry fires its onChange events.
  const overlaysRegistered = useRef(false);
  useEffect(() => {
    if (overlaysRegistered.current) return;
    if (!overlays || overlays.length === 0) return;
    overlaysRegistered.current = true;
    const disposables = overlays.map((o) => registries.overlays.register(o));
    return () => {
      for (const d of disposables) d.dispose();
      overlaysRegistered.current = false;
    };
  }, [registries, overlays]);

  // Register the supplied tool contributions (the rail renders the
  // ToolRegistry). Same ref guard; the ToolRail subscribes to the
  // registry's onChange so it picks these up. Tool single-key
  // shortcuts + chrome keys are registered by `useToolKeybindings`,
  // installed by the canvas-app integration child.
  const toolsRegistered = useRef(false);
  useEffect(() => {
    if (toolsRegistered.current) return;
    if (!tools || tools.length === 0) return;
    toolsRegistered.current = true;
    const disposables = tools.map((t) => registries.tools.register(t));
    return () => {
      for (const d of disposables) d.dispose();
      toolsRegistered.current = false;
    };
  }, [registries, tools]);

  // Concept 1 — Tab / Shift+Tab chrome hide. Tab toggles panels + the
  // tool rail; Shift+Tab toggles panels only. Hiding serializes the
  // dock layout, closes everything but the canvas, and restores the
  // snapshot on show. (Reloading while hidden persists the hidden
  // layout — same trade-off InDesign makes.)
  const [railHidden, setRailHidden] = useState(false);
  const panelsSnapshotRef = useRef<LayoutSnapshot | null>(null);

  const hidePanels = (paged: PagedEditor) => {
    const substrate = paged.substrate;
    if (!substrate || panelsSnapshotRef.current) return;
    panelsSnapshotRef.current = substrate.serialize();
    substrate.closePanelsExcept(["paged.canvas"]);
  };
  const showPanels = (paged: PagedEditor) => {
    const snap = panelsSnapshotRef.current;
    panelsSnapshotRef.current = null;
    if (paged.substrate && snap) paged.substrate.restore(snap);
  };
  const toggleAll = (paged: PagedEditor) => {
    if (panelsSnapshotRef.current || railHidden) {
      showPanels(paged);
      setRailHidden(false);
    } else {
      hidePanels(paged);
      setRailHidden(true);
    }
  };
  const togglePanels = (paged: PagedEditor) => {
    if (panelsSnapshotRef.current) showPanels(paged);
    else hidePanels(paged);
  };
  const toggleAllRef = useRef(toggleAll);
  toggleAllRef.current = toggleAll;
  const togglePanelsRef = useRef(togglePanels);
  togglePanelsRef.current = togglePanels;

  // Cockpit (D3) — per-mode panel sets + layout memory. A Tab-hidden
  // chrome is restored before switching so the outgoing snapshot is
  // the real layout.
  const beforeModeSwitch = useCallback(() => {
    const snap = panelsSnapshotRef.current;
    if (snap && paged?.substrate) {
      panelsSnapshotRef.current = null;
      paged.substrate.restore(snap);
      setRailHidden(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged]);
  useModeLayout({
    substrate: paged?.substrate ?? null,
    registries,
    mode: workflowMode,
    enabled: Boolean(modes && modes.length > 0),
    beforeSwitch: beforeModeSwitch,
  });

  useEffect(() => {
    // Tab must keep its focus-move role inside DOM editables; the
    // canvas caret is covered by the contentSelection guard.
    const chromeKeyGuard = (state: unknown) => {
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return false;
      }
      return (contentSelectionInactive as (s: unknown) => boolean)(state);
    };
    const disposables = [
      registries.commands.register({
        id: "paged.chrome.toggleAll",
        title: "Toggle panels and tool rail",
        category: "View",
        handler: (paged) => toggleAllRef.current(paged as PagedEditor),
      }),
      registries.commands.register({
        id: "paged.chrome.togglePanels",
        title: "Toggle panels (keep tool rail)",
        category: "View",
        handler: (paged) => togglePanelsRef.current(paged as PagedEditor),
      }),
      registries.keybindings.register({
        key: "tab",
        command: "paged.chrome.toggleAll",
        when: chromeKeyGuard,
      }),
      registries.keybindings.register({
        key: "shift+tab",
        command: "paged.chrome.togglePanels",
        when: chromeKeyGuard,
      }),
    ];
    return () => {
      for (const d of disposables) d.dispose();
    };
  }, [registries]);

  // Register tool single-key shortcuts (as a class, with the
  // contentSelection==null guard) + the W screen-preview toggle.
  const toolKeysRegistered = useRef(false);
  useEffect(() => {
    if (toolKeysRegistered.current) return;
    if (!tools || tools.length === 0) return;
    toolKeysRegistered.current = true;
    const { commands, keybindings } = buildToolbarContributions(tools);
    const disposables = [
      ...commands.map((c) => registries.commands.register(c)),
      ...keybindings.map((k) => registries.keybindings.register(k)),
    ];
    return () => {
      for (const d of disposables) d.dispose();
      toolKeysRegistered.current = false;
    };
  }, [registries, tools]);

  // Cockpit — register the app's workflow modes (ref-guarded; the
  // registry throws on duplicate ids and HMR re-runs effects).
  const modesRegistered = useRef(false);
  useEffect(() => {
    if (!modes || modes.length === 0) return;
    if (modesRegistered.current) return;
    modesRegistered.current = true;
    const disposables = modes.map((m) => registries.modes.register(m));
    return () => {
      for (const d of disposables) d.dispose();
      modesRegistered.current = false;
    };
  }, [registries, modes]);

  // Register the built-in file-open command. Programmatic file
  // dialog so the palette can invoke it without depending on the
  // header's `<input type="file">`.
  useEffect(() => {
    const handle = registries.commands.register(
      buildOpenIdmlCommand({
        pickFile: async () =>
          new Promise<File | null>((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".idml,application/vnd.adobe.indesign-idml-package";
            input.onchange = () => resolve(input.files?.[0] ?? null);
            input.click();
          }),
        setStatus,
        pushWarning: (w) => setWarnings((prev) => [...prev, w]),
      }),
    );
    // Concept 2 — swatch-library import/export commands.
    const importAse = registries.commands.register(
      buildImportAseCommand({
        pickFile: async () =>
          new Promise<File | null>((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".ase";
            input.onchange = () => resolve(input.files?.[0] ?? null);
            input.click();
          }),
        setStatus,
      }),
    );
    const exportAse = registries.commands.register(
      buildExportAseCommand({ setStatus }),
    );
    // Concept 3 — PDF export (opens the dialog; the dialog owns the
    // export loop).
    const exportPdf = registries.commands.register(buildExportPdfCommand());
    return () => {
      handle.dispose();
      importAse.dispose();
      exportAse.dispose();
      exportPdf.dispose();
    };
  }, [registries]);

  // Register the palette-toggle command + Cmd+K keybinding. The
  // command body (notifyPalette) is shell-internal; binding via
  // the registry means it shows up in the palette itself (handy
  // for discovery) and lets bundles re-bind the key if needed.
  useEffect(() => {
    const cmd = registries.commands.register(PALETTE_TOGGLE_COMMAND);
    const k1 = registries.keybindings.register(PALETTE_TOGGLE_KEYBINDING);
    const k2 = registries.keybindings.register(PALETTE_TOGGLE_KEYBINDING_CTRL);
    return () => {
      cmd.dispose();
      k1.dispose();
      k2.dispose();
    };
  }, [registries]);

  // Perspective save/export/import commands — the always-on triplet.
  // Per-perspective load/delete commands are auto-generated below.
  useEffect(() => {
    const cmds = [
      registries.commands.register(PERSPECTIVE_SAVE_AS_COMMAND),
      registries.commands.register(PERSPECTIVE_EXPORT_COMMAND),
      registries.commands.register(PERSPECTIVE_IMPORT_COMMAND),
    ];
    return () => {
      for (const c of cmds) c.dispose();
    };
  }, [registries]);

  // Auto-generate paged.perspective.load.<name> + delete.<name>
  // commands from the persisted list. Re-runs on the custom
  // `paged:perspectives-changed` event the persistence layer emits
  // every time a perspective is saved/deleted/imported.
  useEffect(() => {
    let disposables: Disposable[] = [];
    const refresh = () => {
      for (const d of disposables) d.dispose();
      disposables = listPerspectives().flatMap((name) => {
        const [load, del] = buildPerspectiveLifecycleCommands(name);
        return [
          registries.commands.register(load),
          registries.commands.register(del),
        ];
      });
    };
    refresh();
    window.addEventListener(PERSPECTIVES_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(PERSPECTIVES_CHANGED_EVENT, refresh);
      for (const d of disposables) d.dispose();
    };
  }, [registries]);

  // Default menu items. Static — they reference always-on commands;
  // per-panel and per-perspective entries are deferred to the
  // command registry surface (the palette already shows them).
  useEffect(() => {
    const items = registries.menus;
    const handles = [
      items.register({
        path: "File/Open IDML…",
        command: PAGED_FILE_OPEN_IDML,
        order: 10,
      }),
      items.register({
        path: "File/Export PDF…",
        command: PAGED_FILE_EXPORT_PDF,
        order: 20,
        group: "export",
      }),
      items.register({
        path: "View/Toggle command palette",
        command: PAGED_PALETTE_TOGGLE,
        order: 10,
      }),
      items.register({
        path: "View/Save perspective…",
        command: PAGED_PERSPECTIVE_SAVE_AS,
        order: 90,
        group: "perspective",
      }),
      items.register({
        path: "View/Export perspective…",
        command: PAGED_PERSPECTIVE_EXPORT,
        order: 91,
        group: "perspective",
      }),
      items.register({
        path: "View/Import perspective…",
        command: PAGED_PERSPECTIVE_IMPORT,
        order: 92,
        group: "perspective",
      }),
    ];
    return () => {
      for (const h of handles) h.dispose();
    };
  }, [registries]);

  // Dev hook. Playwright + ad-hoc browser scripts read
  // `window.__canvas`. Re-published on every render so it always
  // reflects current state. Stripped from production builds via
  // Vite's `import.meta.env.PROD` constant — typed loosely here so
  // shell's tsconfig (which doesn't include Vite's ambient types)
  // still passes.
  const isProd =
    (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true;
  if (!isProd) {
    (globalThis as unknown as { __canvas?: unknown }).__canvas = {
      client,
      handle,
      ready: handle != null,
      snapshotsReady,
      elementSelection,
      // SDK Phase 3 — tests need to drive the SelectionContext
      // explicitly so binding-hook-backed panels (Character, Stroke,
      // Object/Transform, …) render resolved values. The worker-
      // side `client.setElementSelection` updates the worker; this
      // setter updates the main-thread React mirror panels read
      // from. Production code uses `useSelection().setElementSelection`
      // (or the click → selection chain); this is purely a test
      // affordance.
      setElementSelection,
      elementGeometry,
      // SDK Phase 3 — text-side selection mirror, also needed by
      // tests that drive content-scope binding hooks (Character
      // panel etc.).
      contentSelection,
      setContentSelection,
      activeTool,
      setActiveTool,
      // Track L — exposed for tests that drive the panel's double-
      // click descent / Escape exit state machine. The selection
      // context owns the source of truth; this just lets Playwright
      // observe and drive it.
      activeGroup,
      setActiveGroup,
      registries,
      // Design system — Playwright drives/asserts the theme.
      theme,
      setTheme,
      // Cockpit — Playwright drives/asserts the workflow mode.
      mode: workflowMode,
      setMode: setWorkflowMode,
    };
  }

  // Consolidated worker-message subscribe. Routes the discrete
  // events into the right contexts; bulk traffic (camera, gestures)
  // bypasses this path via SAB / direct method calls.
  useEffect(() => {
    const off = client.subscribe((msg: WorkerToMain) => {
      if (msg.kind === "warning") {
        setWarnings((prev) => [
          ...prev,
          `${msg.payload.kind}: ${msg.payload.details}`,
        ]);
      } else if (msg.kind === "attachReady") {
        setGpuActive(msg.payload.gpuActive);
      } else if (msg.kind === "resolutionDone") {
        setResolution(msg.payload);
      } else if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        const sel = contentSelectionRef.current;
        if (sel) {
          void client
            .caretGeometry(sel)
            .then(setCaret)
            .catch(() => setCaret(null));
          if (sel.start !== sel.end) {
            void client
              .selectionGeometry(sel)
              .then(setSelectionRects)
              .catch(() => setSelectionRects([]));
          }
        }
        setLayoutCacheStats(msg.payload.cacheStats);
        // Editor-ops — page-structure mutations (insert / delete /
        // resize page, and their undo/redo) carry the refreshed page
        // list + sizes; rebuild the document handle so the page grid
        // follows without a reload. `pageIds` on these replies is the
        // full post-mutation page list, ordered like `pageSizesPt`.
        if (msg.payload.pageStructureChanged && msg.payload.pageSizesPt) {
          const prev = handleRef.current;
          if (prev) {
            setHandle({
              ...prev,
              pageCount: msg.payload.pageIds.length,
              pageIds: msg.payload.pageIds,
              pageSizesPt: msg.payload.pageSizesPt,
            });
          }
        }
      }
    });
    client
      .send({ kind: "hello" })
      .then((reply) => {
        if (reply.kind === "ready") {
          setStatus(`worker ready (protocol v${reply.payload.protocol})`);
        } else {
          setStatus(`worker replied with unexpected: ${reply.kind}`);
        }
      })
      .catch((err) => setStatus(`hello failed: ${String(err)}`));
    return () => {
      off();
    };
  }, [
    client,
    contentSelectionRef,
    setCaret,
    setGpuActive,
    setHandle,
    setLayoutCacheStats,
    setResolution,
    setSelectionRects,
  ]);

  const onFile = useCallback(
    (file: File) => {
      void loadDocumentFile(client, file, {
        setHandle,
        setLoading,
        setStatus,
        setSnapshotsReady,
        addSnapshot: (pageId, url) =>
          setSnapshots((prev) => {
            const next = new Map(prev);
            next.set(pageId, url);
            return next;
          }),
        resetForNewDocument,
        pushWarning: (w) => setWarnings((prev) => [...prev, w]),
      });
    },
    [
      client,
      resetForNewDocument,
      setHandle,
      setLoading,
      setSnapshots,
      setSnapshotsReady,
    ],
  );

  return (
    <div style={shellStyle}>
      <Header onFile={onFile} headerExtras={headerExtras} status={status} />

      {/* Cockpit — the mode-aware context toolbar (only when the
       *  app contributed modes; chrome stays lean otherwise). */}
      {modes && modes.length > 0 && !railHidden && (
        <ContextToolbar paged={paged} />
      )}

      {!sabSupported && (
        <div style={warningStyle}>
          SharedArrayBuffer unavailable — cross-origin isolation headers (COOP +
          COEP) not set. Camera falls back to a regular ArrayBuffer; latency is
          unaffected but reads may tear under contention.
        </div>
      )}

      {warnings.length > 0 && (
        <ul style={{ ...warningStyle, listStyle: "disc", paddingLeft: 24 }}>
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {/* Body row: the left tool rail (shell chrome, OUTSIDE the
       *   dockview substrate) + the docking area. */}
      <div style={bodyRowStyle}>
        {!railHidden && (
          <ToolRail
            foot={
              <>
                <FillStrokeCluster />
                <SoftProofToggle />
                <ScreenModeSelector />
              </>
            }
          />
        )}
        <div style={dockviewContainerStyle}>
          <DockviewRoot />
        </div>
        {!railHidden && panelRail && panelRail.length > 0 && (
          <PanelRail items={panelRail} />
        )}
      </div>

      {/* Cockpit — the bottom mode switcher. */}
      {modes && modes.length > 0 && !railHidden && <ModeSwitcher />}

      <CommandPalette />
      <ExportPdfDialog />

      {/* Canvas-app-specific integration: legacy hooks (keyboard
       *   shortcuts, camera tweens, text editing) that read from
       *   the editor contexts but live in apps/canvas because they
       *   key off canvas-specific helpers. Renders nothing. */}
      {children}
    </div>
  );
}

/**
 * Minimal error boundary so a panel / dockview crash leaves a
 * visible diagnostic instead of unmounting the whole shell.
 */
class DebugErrorBoundary extends React.Component<
  React.PropsWithChildren<{ label: string }>,
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label}] caught:`, error);
    (globalThis as unknown as { __pagedCrash?: string }).__pagedCrash =
      `[${this.props.label}] ${error.message}\n${error.stack ?? ""}`;
  }
  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            padding: 16,
            color: "var(--status-error)",
            fontFamily: "var(--font-mono)",
          }}
        >
          [{this.props.label}] {this.state.error.message}
          {"\n"}
          {this.state.error.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}

const shellStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  background: "hsl(var(--paged-bg))",
  color: "hsl(var(--paged-fg))",
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  width: "100vw",
};

const dockviewContainerStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: "relative",
};

const bodyRowStyle: React.CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
};

const warningStyle: React.CSSProperties = {
  border: "1px solid var(--status-review)",
  background: "color-mix(in srgb, var(--status-review) 12%, transparent)",
  color: "var(--status-review)",
  borderRadius: "var(--radius-md)",
  padding: 8,
  fontSize: 12,
  margin: 8,
};
