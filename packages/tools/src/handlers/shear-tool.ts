// Editor-ops — the Shear tool's gesture handler.
//
// Unlike the drawing tools this one drives a WORKER gesture (the
// `{kind:"shear"}` GestureType, protocol v24): pointer-down on the
// canvas begins the gesture against the current selection with the
// pointer position as the shear pivot; moves stream doc-space deltas
// through the SAB hot path; pointer-up commits (one undo step).
// Shift snaps the shear angle to 15° tangents engine-side.
//
// Mirrors ViewportCanvas's begin/buffer/flush dance: pointermoves
// that arrive before `beginGesture` resolves are buffered into
// `pendingDelta` and flushed when the handle lands; a pointer-up
// before then cancels as soon as the handle arrives so worker state
// stays clean.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import { CLICK_DRAG_THRESHOLD_PX } from "./shared";

interface ShearDrag {
  handle: number | null;
  pendingDelta: [number, number];
  startDoc: [number, number];
  /** Pointer released / Escape fired before begin resolved. */
  abandoned: boolean;
  /** Commit requested before begin resolved. */
  commitOnResolve: boolean;
  lastModifiers: { shift: boolean; alt: boolean };
}

export function createShearHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: ShearDrag | null = null;

  const refreshSelectionChrome = () => {
    if (!paged) return;
    const ids = paged.selection.elementSelection;
    if (ids.length === 0) return;
    void paged.client
      .elementGeometry(ids)
      .then((items) => paged?.selection.setElementGeometry(items))
      .catch(() => {});
  };

  const finish = (handle: number | null, commit: boolean) => {
    if (!paged || handle === null) return;
    const done = commit
      ? paged.client.commitGesture(handle).then(() => undefined)
      : paged.client.cancelGesture(handle).then(() => undefined);
    void done.then(refreshSelectionChrome).catch(() => {});
  };

  const cancel = () => {
    if (drag) {
      if (drag.handle !== null) finish(drag.handle, false);
      else drag.abandoned = true;
    }
    drag = null;
  };

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate(reason) {
      // A spring-load suspend keeps the worker gesture alive — it
      // resumes when the override releases. A real switch cancels.
      if (reason === "suspend") return;
      cancel();
    },
    onPointerDown(e: CanvasPointerEvent) {
      if (!paged || e.button !== 0) return;
      const targets = paged.selection.elementSelection;
      if (targets.length === 0 || !e.pageId || !e.pagePoint) return;
      const state: ShearDrag = {
        handle: null,
        pendingDelta: [0, 0],
        startDoc: e.docPoint,
        abandoned: false,
        commitOnResolve: false,
        lastModifiers: { shift: e.modifiers.shift, alt: e.modifiers.alt },
      };
      drag = state;
      void paged.client
        .beginGesture(targets.slice(), { kind: "shear" }, {
          pageId: e.pageId,
          pointInPage: e.pagePoint,
        })
        .then((handle) => {
          if (state.abandoned) {
            // Released as a click (or Escape) before the worker
            // confirmed — cancel immediately.
            finish(handle, false);
            return;
          }
          if (state.commitOnResolve) {
            // Full drag finished before begin resolved: flush the
            // final delta, then commit.
            void paged!.client
              .updateGesture(handle, state.pendingDelta, state.lastModifiers, "sab")
              .catch(() => {})
              .then(() => finish(handle, true));
            return;
          }
          if (drag !== state) {
            // Tool switched away mid-begin.
            finish(handle, false);
            return;
          }
          state.handle = handle;
          const [dx, dy] = state.pendingDelta;
          if (dx !== 0 || dy !== 0) {
            void paged!.client
              .updateGesture(handle, state.pendingDelta, state.lastModifiers, "sab")
              .catch(() => {});
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("shear beginGesture failed:", err);
          if (drag === state) drag = null;
        });
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !drag) return;
      if (e.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
      const delta: [number, number] = [
        e.docPoint[0] - drag.startDoc[0],
        e.docPoint[1] - drag.startDoc[1],
      ];
      drag.lastModifiers = { shift: e.modifiers.shift, alt: e.modifiers.alt };
      if (drag.handle === null) {
        drag.pendingDelta = delta;
        return;
      }
      void paged.client
        .updateGesture(drag.handle, delta, drag.lastModifiers, "sab")
        .catch(() => {});
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!drag) return;
      const wasDrag = e.maxDelta > CLICK_DRAG_THRESHOLD_PX;
      if (drag.handle === null) {
        // Begin hasn't resolved. A click (no real drag) abandons; a
        // drag records the final delta and commits once the handle
        // lands (the begin-resolver flushes + commits).
        if (wasDrag) {
          drag.pendingDelta = [
            e.docPoint[0] - drag.startDoc[0],
            e.docPoint[1] - drag.startDoc[1],
          ];
          drag.commitOnResolve = true;
        } else {
          drag.abandoned = true;
        }
        drag = null;
        return;
      }
      const handle = drag.handle;
      drag = null;
      finish(handle, wasDrag);
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
