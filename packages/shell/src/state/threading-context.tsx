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

// W2.9 — text-frame threading (TH-01…04).
//
// State store shared between the selection-chrome PORTS (the in/out
// port glyphs drawn on a selected text frame), the headless
// ThreadingController, and the loaded-cursor affordance. Holds three
// things:
//
//   1. The LOADED-CURSOR state. After an out-port click the cursor is
//      "loaded" with a source frame id: the next click either links an
//      existing empty text frame (TH-01) or draws+links a new frame on
//      empty canvas (TH-02). Esc clears it (TH-03). This is the
//      threading analogue of InDesign's loaded text cursor.
//
//   2. ENGINE-TRUTH chain state for the SELECTED frame(s). W3.A2:
//      `nextTextFrame` / `previousTextFrame` are now in the
//      `PropertyPath` enum and `elementProperties(textFrame)` surfaces
//      them (a non-empty text value = the linked frame's id). So the
//      ports derive their "continues a chain" (has a previous frame) /
//      "has a next frame" glyph from a live, id-keyed READ — the
//      controller resolves the selected frame(s) on each Operation
//      push and publishes the two id sets here. This is engine truth,
//      not a session mirror, so LOAD-TIME chains render with the
//      correct ports (the old optimistic `links` mirror only reflected
//      links made this session). See the WIRE NOTE at the bottom.
//
//   3. The set of frame ids the UI should badge as OVERSET. Overset IS
//      live-readable (`StorySummary.overset` via the `paged.stories()`
//      script surface; `DocumentStats.overset_stories` is the matching
//      count). The controller maps that per-frame (frame → story via a
//      centre hit-test, story → overset via the script) and publishes
//      the resolved frame-id set here so the out-port can paint the
//      red "+" badge.
//
// Writers: the ports (loadCursor on out-port click), the controller
// (setChainState + setOverset). Readers: the ports overlay + the
// controller.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { PageId } from "@paged-media/client";

/**
 * The loaded text cursor. `sourceFrameId` is the bare frame id (the
 * `from` of a forthcoming linkFrames). `sourcePageId` is where the
 * source lives — used only as the default page for a draw-on-empty
 * insert when the pointer can't resolve a page. null = idle (no loaded
 * cursor).
 */
export interface LoadedCursor {
  sourceFrameId: string;
  sourcePageId: PageId | null;
}

/**
 * Engine-truth chain state for the frames the controller has resolved
 * (the current selection). `withNext` = frames whose `nextTextFrame`
 * is non-empty (they have a next frame → out-port shows ▸); `withPrev`
 * = frames whose `previousTextFrame` is non-empty (they continue a
 * chain → in-port shows ▸). Both are id sets read straight off
 * `elementProperties`.
 */
export interface ChainState {
  withNext: Set<string>;
  withPrev: Set<string>;
}

interface ThreadingContextValue {
  /** The loaded text cursor, or null when idle. */
  loaded: LoadedCursor | null;
  /** Load the cursor from a source frame's out-port (TH start). */
  loadCursor(cursor: LoadedCursor): void;
  /** Drop the loaded cursor (Esc, or after a link commits). */
  clearCursor(): void;

  /** Engine-truth chain id sets (controller, resolved from
   *  `elementProperties` per Operation push). */
  chain: ChainState;
  setChainState: React.Dispatch<React.SetStateAction<ChainState>>;

  /** Frame ids whose owning story is overset (controller, resolved
   *  from the live `stories` overset). Engine-truth. */
  oversetFrames: ReadonlySet<string>;
  setOversetFrames: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** True when this frame's story overflows (out-port red "+" badge). */
  isOverset(frameId: string): boolean;

  /** True when the frame has a PREVIOUS frame (engine `previousTextFrame`
   *  non-empty → continues a chain, in-port shows ▸). */
  continuesChain(frameId: string): boolean;
  /** True when the frame has a NEXT frame (engine `nextTextFrame`
   *  non-empty → out-port shows ▸ rather than the loadable arrow). */
  hasNext(frameId: string): boolean;
}

const Context = createContext<ThreadingContextValue | null>(null);

export function ThreadingProvider({ children }: PropsWithChildren) {
  const [loaded, setLoaded] = useState<LoadedCursor | null>(null);
  const [chain, setChainState] = useState<ChainState>({
    withNext: new Set(),
    withPrev: new Set(),
  });
  const [oversetFrames, setOversetFrames] = useState<Set<string>>(new Set());

  // Mirror the loaded cursor in a ref so the controller's window
  // listeners (bound once per loaded session) read the freshest value
  // without re-subscribing.
  const loadedRef = useRef<LoadedCursor | null>(null);
  loadedRef.current = loaded;

  const loadCursor = useCallback((cursor: LoadedCursor) => {
    loadedRef.current = cursor;
    setLoaded(cursor);
  }, []);

  const clearCursor = useCallback(() => {
    loadedRef.current = null;
    setLoaded(null);
  }, []);

  const continuesChain = useCallback(
    (frameId: string) => chain.withPrev.has(frameId),
    [chain],
  );
  const hasNext = useCallback(
    (frameId: string) => chain.withNext.has(frameId),
    [chain],
  );
  const isOverset = useCallback(
    (frameId: string) => oversetFrames.has(frameId),
    [oversetFrames],
  );

  const value = useMemo<ThreadingContextValue>(
    () => ({
      loaded,
      loadCursor,
      clearCursor,
      chain,
      setChainState,
      oversetFrames,
      setOversetFrames,
      isOverset,
      continuesChain,
      hasNext,
    }),
    [
      loaded,
      loadCursor,
      clearCursor,
      chain,
      oversetFrames,
      isOverset,
      continuesChain,
      hasNext,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useThreading(): ThreadingContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useThreading called outside ThreadingProvider");
  }
  return ctx;
}

/** Optional variant — null when no provider is mounted, so the ports
 *  overlay degrades gracefully in a host that hasn't wired threading
 *  (e.g. the slim viewer reusing selection chrome). */
export function useOptionalThreading(): ThreadingContextValue | null {
  return useContext(Context);
}

// ── WIRE NOTE (W3.A2 — gap closed) ────────────────────────────────
// The engine ops linkFrames / unlinkFrames are capability-verified
// supported (protocol v28; capability-matrix.spec.ts proves each
// applies + undoes at the channel level). As of W3.A2 there IS a live,
// id-keyed READ of a frame's thread chain: `nextTextFrame` /
// `previousTextFrame` are in the `PropertyPath` enum and
// `elementProperties(textFrame)` surfaces them (a non-empty text value
// = the linked frame's id). So the controller resolves the selected
// frame(s) on every Operation push and publishes the `chain` id sets
// here — engine truth, not a session mirror. This means LOAD-TIME
// threaded chains render with the correct ports (the old optimistic
// `links` mirror only knew about links made this session), and undo /
// redo re-sync the ports automatically (the post-undo
// `elementProperties` read reflects the reverted chain). OVERSET stays
// engine-truth too (StorySummary.overset). The controller scopes the
// chain read to the SELECTION (the only frames whose ports render) so
// it never walks the whole document.
