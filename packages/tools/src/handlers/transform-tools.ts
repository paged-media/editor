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

// Editor-ops — the three matrix-transform TOOLS (Rotate, Scale,
// Shear), which are the same handler with a different `GestureType`.
//
// Unlike the drawing tools these drive a WORKER gesture: pointer-down
// on the canvas begins the gesture against the current selection with
// the pointer position as the ANCHOR; moves stream doc-space deltas
// through the SAB hot path; pointer-up commits (one undo step). Shift
// snaps engine-side (15° tangents for Shear, 15° steps for Rotate).
//
// PIVOT — the engine derives it from the union centroid of the
// gesture's snapshots (`begin_gesture` → `pivot_spread`), and treats
// the anchor as "where the pointer was when the drag started". So a
// drag anywhere on the canvas rotates/scales the SELECTION about its
// own centre; the tools do not (yet) support InDesign's click-to-move
// pivot, which would need a pivot argument on the wire.
//
// Rotate / Scale were reachable before this only through the selection
// chrome (the rotate handle, Cmd+drag on a resize handle) and the
// Object/Transform panel's numeric fields — the rail entries were
// inert. Same engine arms, now also reachable as tools.
//
// Mirrors ViewportCanvas's begin/buffer/flush dance: pointermoves that
// arrive before `beginGesture` resolves are buffered into
// `pendingDelta` and flushed when the handle lands; a pointer-up
// before then cancels as soon as the handle arrives so worker state
// stays clean.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import { CLICK_DRAG_THRESHOLD_PX } from "./shared";

/** The matrix-transform gesture arms this factory can drive. All three
 *  take an anchor and commit a single `SetProperty{FrameTransform}`. */
export type TransformGestureKind = "rotate" | "scale" | "shear";

/** Prebuilt `GestureType` literals. Indexing this (rather than
 *  spreading `{ kind }`) keeps the value a DISCRIMINATED union member,
 *  which `{ kind: "rotate" | "scale" | "shear" }` is not. */
const GESTURE_SPEC = {
  rotate: { kind: "rotate" },
  scale: { kind: "scale" },
  shear: { kind: "shear" },
} as const;

interface TransformDrag {
  handle: number | null;
  pendingDelta: [number, number];
  startDoc: [number, number];
  /** Pointer released / Escape fired before begin resolved. */
  abandoned: boolean;
  /** Commit requested before begin resolved. */
  commitOnResolve: boolean;
  lastModifiers: { shift: boolean; alt: boolean };
}

export function createTransformGestureHandler(
  kind: TransformGestureKind,
): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: TransformDrag | null = null;

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
      const state: TransformDrag = {
        handle: null,
        pendingDelta: [0, 0],
        startDoc: e.docPoint,
        abandoned: false,
        commitOnResolve: false,
        lastModifiers: { shift: e.modifiers.shift, alt: e.modifiers.alt },
      };
      drag = state;
      void paged.client
        .beginGesture(targets.slice(), GESTURE_SPEC[kind], {
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
          console.warn(`${kind} beginGesture failed:`, err);
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

/** Rotate — drag rotates the selection about its centroid; Shift snaps
 *  to 15° steps engine-side. */
export function createRotateHandler(): GestureHandler {
  return createTransformGestureHandler("rotate");
}

/** Scale — drag scales the selection about its centroid; Shift keeps
 *  the aspect ratio engine-side. */
export function createScaleHandler(): GestureHandler {
  return createTransformGestureHandler("scale");
}
