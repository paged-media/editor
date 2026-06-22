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

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";

import { useCanvasClient } from "./canvas-client-context";
import { useCamera, type ViewportSize } from "./camera-context";
import { useDocument } from "./document-context";
import { useSelection } from "./selection-context";
import { useTool } from "./tool-context";
import { useScreenMode } from "./screen-mode-context";
import { useOverlaySignals } from "./overlay-signals-context";
import { useContentSelection } from "./content-selection-context";
import { useToolSettings } from "./tool-settings-context";
import {
  RegistriesProvider,
  useRegistries,
  type ShellRegistries,
} from "./registries-context";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  CanvasClient,
  ProviderTileWire,
  ResourceTilesNeededWire,
  SceneLayer,
} from "@paged-media/client";

/**
 * Aggregate handle: the single argument every panel + command
 * handler receives. Each field is a slice the consumer can pull
 * by name without subscribing to the rest. Stable identity across
 * renders is NOT guaranteed — consumers should destructure and
 * pin sub-slices via context hooks for re-render isolation.
 */
export interface PagedEditor {
  /** The worker client. Stable for the shell's lifetime. */
  client: CanvasClient;

  /** Document state — handle, snapshots, resolution, loading. */
  document: ReturnType<typeof useDocument>;

  /** Viewport camera + size. */
  camera: ReturnType<typeof useCamera>;

  /** Visual element selection. */
  selection: ReturnType<typeof useSelection>;

  /** Active-tool stack (base + spring-load overrides). */
  tool: ReturnType<typeof useTool>;

  /** Screen mode (Normal / Preview / Bleed / Slug / Presentation). */
  screenMode: ReturnType<typeof useScreenMode>;

  /** Transient overlay signals (marquee, snap lines, tool preview).
   *  Gesture handlers publish their in-progress preview here. */
  overlaySignals: ReturnType<typeof useOverlaySignals>;

  /** Tool-scoped settings store (T8 — Polygon sides/star inset, …).
   *  App-state keyed by tool id, NOT document mutations. Gesture
   *  handlers read it to parameterise the op they commit. */
  toolSettings: ReturnType<typeof useToolSettings>;

  /** Text caret + range. */
  contentSelection: ReturnType<typeof useContentSelection>;

  /**
   * S-13 (K-7) font measurement. Delegates to the worker's real shaper
   * via `client.measureText`, satisfying the optional
   * `Api.PagedEditor.text` member the plugin-sdk host calls from
   * `host.text.measureString` (replacing its estimate fallback). All
   * values in POINTS; `descender` negative per OpenType.
   */
  text: {
    measure(
      family: string,
      style: string | null,
      text: string,
      sizePt: number,
    ): Promise<{ advance: number; ascender: number; descender: number }>;
  };

  /**
   * C-1 — in-frame plugin scene layers. Routes to the worker's
   * `submitSceneLayer` / `clearSceneLayer` channel (protocol v39),
   * satisfying the optional `Api.PagedEditor.sceneLayers` member the
   * plugin-sdk host calls from `host.contribute.sceneLayer()`.
   */
  sceneLayers: {
    submit(elementId: string, layer: SceneLayer): Promise<void>;
    clear(elementId: string): Promise<void>;
  };

  /**
   * C-6 (I-06) — the renderer RESOURCE-PROVIDER channel. Routes to the
   * worker's `claimImageResource` / `submitResourceTiles` /
   * `releaseImageResource` messages (the v44 wire) and surfaces the
   * worker's `resourceTilesNeeded` events, satisfying the optional
   * `Api.PagedEditor.images` member the plugin-sdk host calls from
   * `host.images.claimImageResource()`. The SDK adapter owns the
   * needed→source→submit plumbing; this is the thin channel over
   * CanvasClient.
   */
  images: {
    claim(claim: {
      imageId: string;
      levels: number;
      tileSize: number;
      baseWidth: number;
      baseHeight: number;
      revision: number;
    }): Promise<void>;
    release(imageId: string): Promise<void>;
    submitTiles(
      imageId: string,
      level: number,
      tiles: ProviderTileWire[],
      generation: number,
    ): Promise<void>;
    onResourceTilesNeeded(
      listener: (need: ResourceTilesNeededWire) => void,
    ): () => void;
  };

  /** The four shell registries. */
  registries: ShellRegistries;
}

/**
 * Wraps the registries provider with a stable `getEditor` thunk so
 * the command registry can resolve the current editor at `invoke`
 * time without React re-renders causing handler bindings to drift.
 *
 * Must be mounted *inside* the five state-context providers (it
 * reads from them).
 */
export function PagedEditorProvider({ children }: PropsWithChildren) {
  // Thunk hands the registry a way to materialize `PagedEditor` on
  // demand — defined before the inner consumer so the registry can
  // be constructed in a `useRef` (which fires once per mount).
  const editorRef = useRef<PagedEditor | null>(null);
  const getEditor = () => {
    const editor = editorRef.current;
    if (!editor) {
      throw new Error("PagedEditor accessed before mount");
    }
    return editor;
  };

  return (
    <RegistriesProvider getEditor={getEditor}>
      <PagedEditorBinder editorRef={editorRef}>{children}</PagedEditorBinder>
    </RegistriesProvider>
  );
}

/**
 * Inner component that has access to every context (registries +
 * the five state contexts) and assembles the `PagedEditor`. It
 * writes the assembled handle into `editorRef` so the registry's
 * `getEditor` thunk can read the current value.
 */
function PagedEditorBinder({
  editorRef,
  children,
}: PropsWithChildren<{
  editorRef: React.MutableRefObject<PagedEditor | null>;
}>) {
  const client = useCanvasClient();
  const document = useDocument();
  const camera = useCamera();
  const selection = useSelection();
  const tool = useTool();
  const screenMode = useScreenMode();
  const overlaySignals = useOverlaySignals();
  const contentSelection = useContentSelection();
  const toolSettings = useToolSettings();
  const registries = useRegistries();

  const editor = useMemo<PagedEditor>(
    () => ({
      client,
      document,
      camera,
      selection,
      tool,
      screenMode,
      overlaySignals,
      contentSelection,
      toolSettings,
      text: {
        measure: (family, style, str, sizePt) =>
          client.measureText(family, style, str, sizePt),
      },
      sceneLayers: {
        submit: (elementId, layer) => client.submitSceneLayer(elementId, layer),
        clear: (elementId) => client.clearSceneLayer(elementId),
      },
      images: {
        claim: (claim) => client.claimImageResource(claim),
        release: (imageId) => client.releaseImageResource(imageId),
        submitTiles: (imageId, level, tiles, generation) =>
          client.submitResourceTiles(imageId, level, tiles, generation),
        onResourceTilesNeeded: (listener) =>
          client.onResourceTilesNeeded(listener),
      },
      registries,
    }),
    [
      client,
      document,
      camera,
      selection,
      tool,
      screenMode,
      overlaySignals,
      contentSelection,
      toolSettings,
      registries,
    ],
  );
  editorRef.current = editor;

  return (
    <EditorContextProvider editor={editor}>{children}</EditorContextProvider>
  );
}

// React-context surface for the editor handle. Distinct from the
// editorRef the command registry uses — components consume via the
// `usePaged` hook; the ref exists for non-React consumers
// (registry invoke handlers that fire outside React's lifecycle).
const EditorContext = createContext<PagedEditor | null>(null);

function EditorContextProvider({
  editor,
  children,
}: PropsWithChildren<{ editor: PagedEditor }>) {
  return (
    <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
  );
}

/**
 * Composite hook returning the aggregate editor handle. Panels
 * that only need a single slice should prefer the focused hook
 * (`useDocument`, `useCamera`, …) for finer re-render control.
 */
export function usePaged(): PagedEditor {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("usePaged called outside PagedEditorProvider");
  }
  return ctx;
}

/** Same as `usePaged` but returns `null` outside the provider. */
export function useOptionalPaged(): PagedEditor | null {
  return useContext(EditorContext);
}

export type { ViewportSize };
