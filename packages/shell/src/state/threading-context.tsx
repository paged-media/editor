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
//   2. An OPTIMISTIC mirror of the thread links MADE THIS SESSION
//      (`from → to` pairs). The engine supports linkFrames /
//      unlinkFrames (protocol v28) but — exactly like W2.8's guides —
//      there is NO in-session, id-keyed READ of a frame's thread chain:
//      `nextTextFrame` / `previousTextFrame` are not in the
//      `PropertyPath` enum and `elementProperties` does not surface the
//      chain. So the ports derive their "continues a chain" / "has a
//      next frame" glyph from this client-side mirror, which the
//      controller rewrites as it dispatches each link/unlink. See the
//      WIRE GAP note at the bottom.
//
//   3. The set of frame ids the UI should badge as OVERSET. Overset IS
//      live-readable (`StorySummary.overset` via the `stories`
//      collection / `DocumentStats.overset_stories`); the controller
//      maps that per-frame and publishes the set here so the out-port
//      can paint the red "+" badge.
//
// Writers: the ports (loadCursor on out-port click), the controller
// (linkMade / linkRemoved + setOverset). Readers: the ports overlay +
// the controller.

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
 * One optimistic thread link made this session: `from`'s out-port was
 * threaded into the empty `to` frame. The ports read this mirror to
 * decide a frame's glyph: a frame that is some link's `to` "continues
 * a chain" (in-port filled); a frame that is some link's `from` "has a
 * next frame" (out-port filled, not the loadable arrow).
 */
export interface ThreadLink {
  from: string;
  to: string;
}

interface ThreadingContextValue {
  /** The loaded text cursor, or null when idle. */
  loaded: LoadedCursor | null;
  /** Load the cursor from a source frame's out-port (TH start). */
  loadCursor(cursor: LoadedCursor): void;
  /** Drop the loaded cursor (Esc, or after a link commits). */
  clearCursor(): void;

  /** Optimistic links made this session (see file header / WIRE GAP). */
  links: ReadonlyArray<ThreadLink>;
  /** Record an applied link (controller, after linkFrames lands). */
  linkMade(link: ThreadLink): void;
  /** Drop links touching `frame` (controller, after unlinkFrames). */
  linkRemoved(frame: string): void;

  /** Frame ids whose owning story is overset (controller, resolved
   *  from the live `stories` collection). Engine-truth — not the
   *  optimistic mirror. */
  oversetFrames: ReadonlySet<string>;
  setOversetFrames: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** True when this frame's story overflows (out-port red "+" badge). */
  isOverset(frameId: string): boolean;

  /** True when a frame is the `to` of a session link (continues a
   *  chain → its in-port shows the ▸ glyph). */
  continuesChain(frameId: string): boolean;
  /** True when a frame is the `from` of a session link (already has a
   *  next frame → out-port shows ▸ rather than the empty loadable
   *  arrow). */
  hasNext(frameId: string): boolean;
}

const Context = createContext<ThreadingContextValue | null>(null);

export function ThreadingProvider({ children }: PropsWithChildren) {
  const [loaded, setLoaded] = useState<LoadedCursor | null>(null);
  const [links, setLinks] = useState<ThreadLink[]>([]);
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

  const linkMade = useCallback((link: ThreadLink) => {
    setLinks((prev) => [...prev, link]);
  }, []);

  const linkRemoved = useCallback((frame: string) => {
    setLinks((prev) => prev.filter((l) => l.from !== frame && l.to !== frame));
  }, []);

  const continuesChain = useCallback(
    (frameId: string) => links.some((l) => l.to === frameId),
    [links],
  );
  const hasNext = useCallback(
    (frameId: string) => links.some((l) => l.from === frameId),
    [links],
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
      links,
      linkMade,
      linkRemoved,
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
      links,
      linkMade,
      linkRemoved,
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

// ── WIRE GAP (capability matrix) ──────────────────────────────────
// The engine ops linkFrames / unlinkFrames are capability-verified
// supported (protocol v28; capability-matrix.spec.ts proves each
// applies + undoes at the channel level). What is NOT surfaced is an
// in-session READ of a frame's thread chain: `nextTextFrame` /
// `previousTextFrame` are absent from the `PropertyPath` enum and
// `elementProperties` carries no chain entry, so there is no way to
// ask "what is this frame's next/previous frame" after a mutation
// (and load-time chains aren't readable either). The optimistic
// `links` mirror here bridges that gap for the IN/OUT-port glyphs —
// it reflects only links MADE THIS SESSION; load-time threaded chains
// render with idle ports until core surfaces a chain read. OVERSET is
// the exception: it IS live-readable (StorySummary.overset), so the
// badge is engine-truth, not a mirror. The cross-boundary truth that
// linkFrames/unlinkFrames actually mutated the chain is observable by
// the channel (mutationApplied + undo) — which is how the TH specs
// assert the engine, exactly as the GD specs do for guides. When core
// surfaces a live, id-keyed chain read, the controller can replace the
// `links` mirror with a `mutationApplied`-driven refresh.
