import { useEffect, useMemo, useRef } from "react";

import {
  GestureSpine,
  resolveCursorCss,
  usePaged,
  type CanvasPointerEvent,
} from "@paged-media/shell";

// Concept 1 (Phase 2) — mounts the gesture spine in the canvas app
// and bridges it to ViewportCanvas. Subscribes to the effective tool
// (from the ToolContext stack) and swaps the mounted handler; exposes
// `toolGesture` (the pointer dispatchers) ONLY while the effective
// tool carries a handler — otherwise null, so ViewportCanvas runs its
// proven select/text path untouched.

export interface ToolGestureDispatch {
  onDown: (e: CanvasPointerEvent) => void;
  onMove: (e: CanvasPointerEvent) => void;
  onUp: (e: CanvasPointerEvent) => void;
}

export function useGestureSpine(): {
  toolGesture: ToolGestureDispatch | null;
  /** CSS cursor for the effective tool, or undefined to keep the
   *  default canvas cursor. */
  cursor: string | undefined;
} {
  const paged = usePaged();
  const spineRef = useRef<GestureSpine | null>(null);
  if (!spineRef.current) spineRef.current = new GestureSpine();
  const spine = spineRef.current;

  const effectiveTool = paged.tool.effectiveTool;
  const lastReason = paged.tool.lastReason;

  // Activate/deactivate handlers as the effective tool changes. `paged`
  // is read fresh at effect time (it carries the registry + client the
  // handler needs); keying on effectiveTool/lastReason keeps the swap
  // aligned with the stack.
  useEffect(() => {
    spine.setEffectiveTool(effectiveTool, paged, lastReason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTool, lastReason]);

  // Tear the handler down on unmount.
  useEffect(() => () => spine.clear(), [spine]);

  // Resolve from the registry (synchronous + correct on the same render
  // the tool changed, before the effect runs).
  const contribution = paged.registries.tools.get(effectiveTool);
  const hasHandler = contribution?.gesture != null;
  const cursor = contribution?.cursor
    ? resolveCursorCss(contribution.cursor)
    : undefined;

  return useMemo(
    () => ({
      toolGesture: hasHandler
        ? {
            onDown: (e: CanvasPointerEvent) => spine.pointerDown(e),
            onMove: (e: CanvasPointerEvent) => spine.pointerMove(e),
            onUp: (e: CanvasPointerEvent) => spine.pointerUp(e),
          }
        : null,
      cursor,
    }),
    [hasHandler, cursor, spine],
  );
}
