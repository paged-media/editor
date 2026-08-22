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

// The shell root. Composes every provider, registers the supplied
// panels + the built-in file-open command, hosts the chrome
// (header, warnings, command palette), and mounts the fixed cockpit
// layout as the main work area.
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
  type ComponentType,
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
import { useDocumentMeta } from "./catalog/use-collection";
import {
  setOpenFileHandle,
  type WritableFileHandle,
} from "./state/open-file-handle";
import { DocumentProvider, useDocument } from "./state/document-context";
import { setPendingImportSource } from "./state/import-source";
import {
  InstrumentationProvider,
  useInstrumentation,
} from "./state/instrumentation-context";
import { OverlaySignalsProvider } from "./state/overlay-signals-context";
import { GuideDragProvider } from "./state/guide-drag-context";
import { ThreadingProvider } from "./state/threading-context";
import { TableSelectionProvider } from "./state/table-selection-context";
import { SelectionProvider, useSelection } from "./state/selection-context";
import { ToolProvider, useOptionalTool } from "./state/tool-context";
import { ScreenModeProvider } from "./state/screen-mode-context";
import { ThemeProvider, useTheme } from "./state/theme-context";
import { useOptionalPaged } from "./state/paged-editor";
import { Header } from "./chrome/Header";
import { ContextToolbar } from "./chrome/ContextToolbar";
import { EditContextBreadcrumb } from "./chrome/EditContextBreadcrumb";
import { ModeSwitcher } from "./chrome/ModeSwitcher";
import { PanelRail, type PanelRailItem } from "./chrome/PanelRail";
import {
  WorkflowModeProvider,
  useWorkflowMode,
} from "./state/workflow-mode-context";
import type { ModeContribution } from "./registries/mode";
import { ToolSettingsProvider } from "./state/tool-settings-context";
import { FormattingAffectsProvider } from "./state/formatting-affects-context";
import {
  EditContextStackProvider,
  useOptionalEditContextStack,
} from "./state/edit-context-stack";
import { EditContextController } from "./state/edit-context-controller";
import {
  BindingProviderProvider,
  type ShellBindingProviderHost,
} from "./catalog/binding-providers";
import { PagedEditorProvider } from "./state/paged-editor";
import { useRegistries } from "./state/registries-context";
import { ActionsProvider } from "./actions/actions-context";
import { CommandPalette } from "./chrome/CommandPalette";
import { DemoOverlay, DemoSpotlight } from "./demo/overlay";
import { runDemoScriptWithHandle } from "./demo/runner";
import { ExportPdfDialog } from "./chrome/ExportPdfDialog";
import { ToolRail } from "./chrome/ToolRail";
import { ScreenModeSelector } from "./chrome/ScreenModeSelector";
import { FillStrokeCluster } from "./chrome/FillStrokeCluster";
import { SoftProofToggle } from "./chrome/SoftProofToggle";
import { CockpitLayout } from "./cockpit/CockpitLayout";
import {
  CockpitStateProvider,
  cockpitActions,
  useOptionalCockpitState,
} from "./cockpit/cockpit-state-context";
import { loadDocumentFile } from "./state/document-loader";
import {
  PAGED_FILE_OPEN_IDML,
  buildNewDocumentCommand,
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
  PAGED_PALETTE_TOGGLE,
} from "./state/commands/built-in-commands";
import {
  buildToolbarContributions,
  contentSelectionInactive,
} from "./state/commands/tool-commands";
import { installRegistryDerivedContributions } from "./state/commands/registry-derived";
import { useSpringLoadedTools } from "./tools/use-spring-loaded-tools";
import type { PagedEditor } from "./state/paged-editor";
import type { OverlayContribution } from "./registries/overlay";
import type { PanelContribution, PanelProps } from "./registries/panel";
import { panelBelongsHere } from "./registries/types";
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
  /** Cockpit — the document viewport component (apps/canvas's
   * CanvasPanel). Required for the fixed cockpit layout: the canvas
   * is a SLOT, not a dockview panel. */
  canvasComponent?: ComponentType<PanelProps>;
  /** ADR 023 phase C — the app's ONE shared binding-provider registry
   *  (built with plugin-sdk's `createBindingProviderRegistry` and
   *  injected into every bundle host). Published to the panel tree so a
   *  HOST-owned panel can resolve its values through the ACTIVE plugin
   *  edit context, falling through to core. Omitted/null = every panel
   *  reads core, which is exactly right for a shell that loads no
   *  bundles. */
  bindingProviders?: ShellBindingProviderHost | null;
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
  canvasComponent,
  bindingProviders,
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
                              {/* W2.8 — guide creation/drag state, shared
                                  by the ruler hit zones, the controller,
                                  and the guide overlay. */}
                              <GuideDragProvider>
                                {/* W2.9 — text-frame threading state
                                    (ports + loaded cursor + controller). */}
                                <ThreadingProvider>
                                  {/* W3.A2 — table cell selection,
                                      shared by the canvas hit handler,
                                      the Table panel, and the cell
                                      overlay. */}
                                  <TableSelectionProvider>
                                    <InstrumentationProvider>
                                    {/* W3.2 — the edit-context stack
                                        (B-02/W-03): the active scoped-
                                        editing-mode stack + breadcrumb +
                                        write-scope. Above PagedEditor so
                                        chrome + canvas integration can
                                        read it. */}
                                    <EditContextStackProvider>
                                    {/* ADR 023 phase C — the binding-
                                        provider seam. Deliberately
                                        INSIDE the edit-context stack:
                                        a provider's lifetime is that
                                        stack's, and reading them in
                                        that order is the point. */}
                                    <BindingProviderProvider
                                      host={bindingProviders ?? null}
                                    >
                                    <PagedEditorProvider>
                                    {/* Actions — the command recorder.
                                        INSIDE PagedEditorProvider (it
                                        needs the registries) and OUTSIDE
                                        ShellChrome, because the right
                                        dock unmounts inactive tabs: a
                                        recorder living in its own panel
                                        would stop recording the moment
                                        the user switched tabs to do the
                                        thing they were recording. */}
                                    <ActionsProvider>
                                      <ShellChrome
                                        panels={panels}
                                        overlays={overlays}
                                        tools={tools}
                                        headerExtras={headerExtras}
                                        modes={modes}
                                        panelRail={panelRail}
                                        canvasComponent={canvasComponent}
                                      >
                                        {children}
                                      </ShellChrome>
                                    </ActionsProvider>
                                    </PagedEditorProvider>
                                    </BindingProviderProvider>
                                    </EditContextStackProvider>
                                    </InstrumentationProvider>
                                  </TableSelectionProvider>
                                </ThreadingProvider>
                              </GuideDragProvider>
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

// U11 — Window-menu grouping. Panels cluster under a category label
// derived from the contribution's `defaultGroup` (the dock-group
// vocabulary the apps already register with), or — when a plugin
// bundle stamps its display name on the contribution (`source`, being
// added platform-side; read defensively) — under that bundle's name.
// MenuBar sorts a menu's items by `order` and renders a separator
// whenever the adjacent `group` label changes, so encoding the
// category's rank in `order` yields visually grouped sections in the
// table's order; unknown categories (plugin sources / the "Plugins"
// fallback) land after the named ones in approximate alphabetical
// order (first three characters — ties keep registration order).
const WINDOW_MENU_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ["cockpit", "Workspace"],
  ["chrome", "Workspace"],
  ["structure", "Structure"],
  ["styles", "Styles"],
  ["text", "Text"],
  ["properties", "Properties"],
  ["inspector", "Properties"],
  ["object", "Object"],
  ["output", "Output"],
  ["console", "Developer"],
];

const WINDOW_MENU_LABEL_ORDER: ReadonlyArray<string> = Array.from(
  new Set(WINDOW_MENU_CATEGORIES.map(([, label]) => label)),
);

function windowMenuGroup(p: PanelContribution): {
  label: string;
  order: number;
} {
  const source = (p as { source?: string }).source;
  const fromTable = p.defaultGroup
    ? WINDOW_MENU_CATEGORIES.find(([g]) => g === p.defaultGroup)?.[1]
    : undefined;
  const label =
    (typeof source === "string" && source.trim()) || fromTable || "Plugins";
  if (!source) {
    const idx = WINDOW_MENU_LABEL_ORDER.indexOf(label);
    if (idx >= 0) return { label, order: idx * 10 };
  }
  const c = (i: number) => (label.toUpperCase().charCodeAt(i) || 0) & 0x7f;
  return { label, order: 1000 + c(0) * 0x4000 + c(1) * 0x80 + c(2) };
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
  canvasComponent,
  children,
}: PropsWithChildren<{
  panels: PanelContribution[];
  overlays?: OverlayContribution[];
  tools?: ToolContribution[];
  headerExtras?: ReactNode;
  modes?: ModeContribution[];
  panelRail?: PanelRailItem[];
  canvasComponent?: ComponentType<PanelProps>;
}>) {
  const client = useCanvasClient();
  const {
    handle,
    snapshotsReady,
    setHandle,
    setSourceName,
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
    setElementGeometry,
    activeTool,
    setActiveTool,
    activeGroup,
    setActiveGroup,
  } = useSelection();
  const { theme, setTheme } = useTheme();
  const { mode: workflowMode, setMode: setWorkflowMode } = useWorkflowMode();
  const paged = useOptionalPaged();
  // Journey-oracle introspection (dev only). The cockpit tab state +
  // edit-context stack live BELOW this component (CockpitStateProvider
  // wraps shellBody), so they're unobservable from the `__canvas` block
  // here. A child `<DebugContextProbe>` rendered inside that provider
  // writes them into this ref; `__canvas.debugContext()` reads it.
  const debugContextRef = useRef<DebugContextSnapshot>({
    panels: { open: [], active: null },
    editContext: null,
    inspectorContext: null,
    tools: { base: null, effective: null, registered: [] },
    commands: [],
    keybindings: [],
  });
  const {
    contentSelection,
    setContentSelection,
    setCaret,
    setSelectionRects,
    contentSelectionRef,
  } = useContentSelection();
  const { gpuActive, setFps, setGpuActive, setLayoutCacheStats } =
    useInstrumentation();
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

  // Register the supplied panels. Show/hide command pairs are NOT
  // built here anymore — the registry-derived installer (B-15 fix,
  // below with the tool shortcuts) generates them for EVERY panel
  // registration path, props and bundles alike.
  const panelsRegistered = useRef(false);
  useEffect(() => {
    if (panelsRegistered.current) return;
    panelsRegistered.current = true;
    const disposables = panels.map((p) => registries.panels.register(p));
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

  // The fixed cockpit layout is the only work area — apps supply the
  // viewport component (the canvas is a SLOT, not a panel).
  const cockpitActive = Boolean(canvasComponent);

  // Concept 1 — Tab / Shift+Tab chrome hide. Tab toggles panels + the
  // tool rail; Shift+Tab toggles panels only. Pure state — the fixed
  // slots simply unmount (canvas column stays).
  const [railHidden, setRailHidden] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);

  const toggleAll = (_paged: PagedEditor) => {
    const hidden = panelsHidden || railHidden;
    setPanelsHidden(!hidden);
    setRailHidden(!hidden);
  };
  const togglePanels = (_paged: PagedEditor) => {
    setPanelsHidden((v) => !v);
  };
  const toggleAllRef = useRef(toggleAll);
  toggleAllRef.current = toggleAll;
  const togglePanelsRef = useRef(togglePanels);
  togglePanelsRef.current = togglePanels;

  // Cockpit — the Window menu lists every REGISTERED panel and opens
  // it as a right-dock tab (`paged.panel.show.*`). Registry-driven so
  // late-registered plugin/bundle panels appear automatically; this
  // is the guaranteed reachable home for any custom panel.
  useEffect(() => {
    if (!cockpitActive) return;
    const items = new Map<string, Disposable>();
    const add = (p: PanelContribution) => {
      if (p.id === "paged.canvas" || items.has(p.id)) return;
      // U11 — group by category (defaultGroup table / plugin source)
      // instead of one flat "panels" bucket; see windowMenuGroup.
      const { label, order } = windowMenuGroup(p);
      try {
        items.set(
          p.id,
          registries.menus.register({
            path: `Window/${p.title}`,
            command: `paged.panel.show.${p.id}`,
            group: label,
            order,
            // ADR 024 — a panel that belongs to a DIFFERENT content type
            // is not offered here.
            //
            // The Window menu listed every registered panel in every
            // context, so editing a Word document offered "Vector
            // stroke" and the spreadsheet panel — surfaces for content
            // that is not on screen and cannot be reached from where the
            // user is standing.
            //
            // The rule is deliberately narrow: hide a panel only when
            // ANOTHER context claims it and that context is not active.
            // A panel no context claims stays listed, because host
            // panels and the selection-driven plugin panels (paged.image
            // adjustments on a selected frame) are legitimately usable
            // without entering anything.
            when: (state) => panelBelongsHere(state, p.id),
          }),
        );
      } catch {
        // Two panels sharing a title — the first one keeps the path.
      }
    };
    for (const p of registries.panels.list()) add(p);
    const sub = registries.panels.onChange((e) => {
      if (e.kind === "registered") add(e.contribution);
      else {
        items.get(e.id)?.dispose();
        items.delete(e.id);
      }
    });
    return () => {
      sub.dispose();
      for (const d of items.values()) d.dispose();
    };
  }, [cockpitActive, registries]);

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

  // B-15 host-side fix (2026-06-06): tool activation commands +
  // guarded single-key shortcuts and panel show/hide pairs derive
  // from the REGISTRIES (live, via onChange) — props-seeded and
  // bundle-registered contributions get identical treatment. The W
  // screen-preview toggle is the one prop-independent leftover of
  // the old props-once path.
  const derivedRegistered = useRef(false);
  useEffect(() => {
    if (derivedRegistered.current) return;
    derivedRegistered.current = true;
    const wToggle = buildToolbarContributions([]);
    const disposables = [
      installRegistryDerivedContributions(registries),
      ...wToggle.commands.map((c) => registries.commands.register(c)),
      ...wToggle.keybindings.map((k) => registries.keybindings.register(k)),
    ];
    return () => {
      for (const d of disposables) d.dispose();
      derivedRegistered.current = false;
    };
  }, [registries]);

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
            void (async () => {
            // A5 — prefer the File System Access picker, which hands
            // back a HANDLE, so Save can write to the file the user
            // opened instead of minting "document (1).paged" every
            // time. Falls back to `<input type=file>` when the platform
            // has no such picker, and when the user cancels — the API
            // throws on cancel rather than resolving empty.
            const fsPicker = (
              globalThis as {
                showOpenFilePicker?: (o: unknown) => Promise<WritableFileHandle[]>;
              }
            ).showOpenFilePicker;
            if (typeof fsPicker === "function") {
              try {
                const [picked] = await fsPicker({
                  multiple: false,
                  types: [
                    {
                      description: "Paged and IDML documents",
                      accept: {
                        "application/x-paged+zip": [".paged"],
                        "application/vnd.adobe.indesign-idml-package": [".idml"],
                      },
                    },
                  ],
                });
                if (picked) {
                  setOpenFileHandle(picked);
                  const file = await (
                    picked as unknown as { getFile(): Promise<File> }
                  ).getFile();
                  resolve(file);
                  return;
                }
              } catch {
                // Cancelled, or the picker is unavailable in this
                // context (a sandboxed frame). Fall through.
              }
              setOpenFileHandle(null);
              resolve(null);
              return;
            }

            const input = document.createElement("input");
            input.type = "file";
            // K-2 / S-06 — also offer the file types registered plugin
            // importers claim (e.g. paged.sheet's .xlsx), resolved at
            // click time so late-registered importers are included.
            //
            // `.paged` needs no importer and no separate load path: a
            // container IS a valid IDML package, so the same bytes go
            // through the same door, and the engine decides on the way
            // in — it sniffs `paged/core/model/document.pgm` and
            // reconstructs the native model, falling back to parsing
            // the IDML projection when that part is absent or was
            // written by an incompatible version. Listing it here is
            // the whole change; leaving it out only meant the picker
            // hid files it could already open.
            input.accept = [
              ".idml",
              ".paged",
              "application/vnd.adobe.indesign-idml-package",
              "application/x-paged+zip",
              ...registries.importers.acceptExtensions(),
            ].join(",");
            input.onchange = () => {
              // The input fallback yields no handle. CLEAR any previous
              // one: keeping it would make the next Save write this new
              // document over the file the LAST one came from, silently
              // and with no undo.
              setOpenFileHandle(null);
              resolve(input.files?.[0] ?? null);
            };
            input.click();
            })();
          }),
        setStatus,
        pushWarning: (w) => setWarnings((prev) => [...prev, w]),
      }),
    );
    // File ▸ New — mint a blank document through the engine. Shares
    // setStatus/pushWarning with Open so menu + palette + tests reach
    // one path.
    const newDoc = registries.commands.register(
      buildNewDocumentCommand({
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
      newDoc.dispose();
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

  // Default menu items. Static — they reference always-on commands;
  // per-panel entries are deferred to the command registry surface
  // (the palette already shows them).
  useEffect(() => {
    const items = registries.menus;
    const handles = [
      items.register({
        path: "File/Open…",
        command: PAGED_FILE_OPEN_IDML,
        order: 10,
        group: "open",
      }),
      items.register({
        path: "File/Export PDF…",
        command: PAGED_FILE_EXPORT_PDF,
        order: 41,
        group: "place",
      }),
      items.register({
        path: "View/Toggle command palette",
        command: PAGED_PALETTE_TOGGLE,
        order: 10,
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
  const viteEnv = (import.meta as unknown as { env?: { PROD?: boolean; MODE?: string } }).env;
  const isProd = viteEnv?.PROD === true;
  // The `demo` playground build (vite build --mode demo) is a production bundle
  // that DELIBERATELY retains the automation handle so a script can drive the
  // editor live. Everywhere else the handle stays dev-only.
  const isDemoBuild = viteEnv?.MODE === "demo";
  if (!isProd || isDemoBuild) {
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
      // Tests that drive selection programmatically (no viewport click)
      // must also populate the geometry mirror the canvas-panel click
      // path fetches — overlays keyed on it (threading ports, selection
      // chrome) read `useSelection().elementGeometry`, not the worker
      // directly. Exposed so the harness can mirror a real selection.
      setElementGeometry,
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
      // Renderer backend — tests assert the WebGPU path actually engaged
      // (true), fell back to CPU (false), or hasn't attached yet (null).
      // Set from the worker's `attachReady.gpuActive` (a real `initGpu`).
      gpuActive,
      // Cockpit — open any REGISTERED panel as a right-dock tab
      // (the panel-rail / Window-menu path, exposed for tests).
      openPanel: (id: string) => cockpitActions.openPanel?.(id),
      // Journey-oracle introspection — the dimensions DOM/`__canvas`
      // can't otherwise give: which panels are open/active and the
      // edit-context stack. Populated by `<DebugContextProbe>` (mounted
      // inside CockpitStateProvider); reads the ref so it stays valid
      // across this object's per-render republish.
      debugContext: () => debugContextRef.current,
    };
    // Demo/automation entry: run a demo script (paged.* + editor.* + demo.*)
    // against the live handle. Trusted first-party scripts only (see runner).
    // Exposed wherever the handle is — dev today; the `demo` playground build
    // (Phase 2) un-gates the same block in a production bundle.
    (globalThis as unknown as { __demo?: unknown }).__demo = {
      run: (source: string) =>
        runDemoScriptWithHandle(
          source,
          (globalThis as unknown as { __canvas: Parameters<typeof runDemoScriptWithHandle>[1] }).__canvas,
        ),
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
      // K-2 / S-06 — a registered plugin importer may claim this file
      // type (drag-drop / header input). Route the bytes to the plugin
      // instead of the default IDML load — the plugin owns what the file
      // becomes (it does not replace the document unless it chooses to).
      const importer = registries.importers.resolve(file.name, file.type);
      if (importer) {
        setStatus(`importing ${file.name} via ${importer.title}…`);
        void (async () => {
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            // U14 — park the file name for the open orchestration: an
            // importer that OPENS a document does so through
            // `nativeDocument.open(bytes)`, which carries no name.
            setPendingImportSource(file.name);
            await importer.import({
              name: file.name,
              bytes,
              mimeType: file.type,
            });
            setStatus(`imported ${file.name}`);
          } catch (err) {
            setWarnings((prev) => [
              ...prev,
              `import of ${file.name} via ${importer.title} failed: ` +
                (err instanceof Error ? err.message : String(err)),
            ]);
          } finally {
            setPendingImportSource(null);
          }
        })();
        return;
      }
      void loadDocumentFile(client, file, {
        setHandle,
        setSourceName,
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
      registries,
      resetForNewDocument,
      setHandle,
      setSourceName,
      setLoading,
      setSnapshots,
      setSnapshotsReady,
    ],
  );

  const shellBody = (
    <div style={shellStyle}>
      <Header onFile={onFile} headerExtras={headerExtras} status={status} />

      {/* Cockpit — the mode-aware context toolbar (only when the
       *  app contributed modes; chrome stays lean otherwise). */}
      {modes && modes.length > 0 && !railHidden && (
        <ContextToolbar paged={paged} />
      )}

      {!sabSupported && (
        <div style={warningStyle}>
          Some features are running in a reduced mode. Reload the page; if it persists, the page is not being served with the headers the editor needs (cross-origin isolation).</div>
      )}

      {warnings.length > 0 && (
        <ul style={{ ...warningStyle, listStyle: "disc", paddingLeft: 24 }}>
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {/* W3.2 — the edit-context breadcrumb (B-02/W-03). Renders only
       *   while a context is active; the default surface is unchanged.
       *   The controller (side-effect-only) wires Esc-pop, panel
       *   emphasis, tool focus, and selection-driven auto-exit. */}
      <EditContextController />
      <EditContextBreadcrumb />

      {/* Body row: the left tool rail (shell chrome, OUTSIDE the
       *   dockview substrate) + the work area — either the fixed
       *   cockpit layout or the legacy dockview substrate. */}
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
        {canvasComponent ? (
          <CockpitLayout
            canvasComponent={canvasComponent}
            panelsHidden={panelsHidden}
            onFile={onFile}
          />
        ) : (
          <div className="pg-ui-xs" style={{ flex: 1, padding: 24 }}>
            No viewport component supplied — pass `canvasComponent` to
            PagedShell.
          </div>
        )}
        {!railHidden && panelRail && panelRail.length > 0 && (
          <PanelRail items={panelRail} />
        )}
      </div>

      {/* Cockpit — the bottom mode switcher. */}
      {modes && modes.length > 0 && !railHidden && <ModeSwitcher />}

      <CommandPalette />
      <DemoSpotlight />
      <DemoOverlay />
      <ExportPdfDialog />

      {/* Canvas-app-specific integration: legacy hooks (keyboard
       *   shortcuts, camera tweens, text editing) that read from
       *   the editor contexts but live in apps/canvas because they
       *   key off canvas-specific helpers. Renders nothing. */}
      {children}
    </div>
  );

  // The cockpit's tab state mounts only on the cockpit path so the
  // legacy dockview layout keys survive while the flag is off.
  return cockpitActive ? (
    <CockpitStateProvider>
      <UnsavedChangesGuard />
      {!isProd && <DebugContextProbe targetRef={debugContextRef} />}
      {shellBody}
    </CockpitStateProvider>
  ) : (
    shellBody
  );
}

/** Snapshot of the context dimensions only observable from inside the
 *  cockpit + edit-context providers. See `__canvas.debugContext`. */
interface DebugContextSnapshot {
  panels: { open: string[]; active: string | null };
  editContext: { type: string; scopeRoot: unknown; label: string } | null;
  inspectorContext: string | null;
  /** The tool the rail is acting as, plus every registered tool id.
   *  `effective` folds spring-loaded overrides over the deliberate base
   *  tool, which is the value the canvas actually dispatches on — a spec
   *  asserting `base` would miss exactly the class of defect that put
   *  AC-K1-2/3 red (a bare Meta keydown flipping the effective tool). */
  tools: { base: string | null; effective: string | null; registered: string[] };
  /** Registered command ids. The palette is the only place most of these
   *  are visible to a user, so this is the only way a spec can assert a
   *  command EXISTS separately from asserting the palette renders it. */
  commands: string[];
  /** Every `key -> command` the KeybindingRegistry holds.
   *  `KeybindingRegistry.list()` was written "for diagnostics + the future
   *  'Show keybindings' panel" and had ZERO call sites; this is the first.
   *  It is also what a Help > Keyboard shortcuts panel needs, so exposing
   *  it here means the panel and the tests read the same source rather
   *  than two hand-kept lists that drift. */
  keybindings: { key: string; command: string }[];
}

/** Renderless: warn before the tab closes on an edited document.
 *
 *  The editor displayed its dirty state honestly in two places — the
 *  mode bar's "Edited — not saved" and the doc title bar's "Edited" —
 *  and then never acted on it. There was no `beforeunload` handler
 *  anywhere in the app, no autosave, and no `File > Open recent`, so a
 *  closed tab took the work with it in silence.
 *
 *  `preventDefault()` plus a non-empty `returnValue` is the whole
 *  contract; browsers show their own wording and ignore ours, which is
 *  why there is no message to translate here. Registered ONLY while
 *  dirty — a permanently-installed handler makes every navigation away
 *  from a clean document prompt, which trains people to click through
 *  the dialog that is supposed to stop them.
 *
 *  This does not make the document safe, and must not be read as
 *  autosave. It buys a confirmation, nothing more. */
function UnsavedChangesGuard() {
  const meta = useDocumentMeta();
  const dirty = meta?.dirty ?? false;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy Chrome still wants the assignment; the string is never shown.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  return null;
}

/** Dev-only renderless probe: reads the cockpit tab state + edit-context
 *  stack (both providers are in scope here, unlike at the `__canvas`
 *  publish site) and mirrors them into `targetRef` for the journey-test
 *  oracle. Writing a ref during render is safe — it's idempotent and
 *  triggers no state update. */
function DebugContextProbe({
  targetRef,
}: {
  targetRef: React.MutableRefObject<DebugContextSnapshot>;
}) {
  const cockpit = useOptionalCockpitState();
  const editStack = useOptionalEditContextStack();
  const registries = useRegistries();
  const tool = useOptionalTool();
  targetRef.current = {
    panels: {
      open: cockpit?.rightTabs ?? [],
      active: cockpit?.activeTab ?? null,
    },
    editContext: editStack?.active
      ? {
          type: editStack.active.type,
          scopeRoot: editStack.active.scopeRoot,
          label: editStack.active.label,
        }
      : null,
    inspectorContext: cockpit?.inspectorContext ?? null,
    tools: {
      base: tool?.toolState.base ?? null,
      effective: tool?.effectiveTool ?? null,
      registered: registries.tools.list().map((t) => t.id),
    },
    commands: registries.commands.list().map((c) => c.id),
    keybindings: registries.keybindings
      .list()
      .map((k) => ({ key: k.key, command: k.command })),
  };
  return null;
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
