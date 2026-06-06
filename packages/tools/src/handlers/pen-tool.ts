// Editor-ops — the Pen tool's gesture handler.
//
// A thin shim over `@paged-media/draw-tools`' PenMachine (plugin-draw
// milestone D2): the modifier matrix (click=corner, drag=smooth, Alt
// breaks the pair, Shift constrains, click-first-anchor closes,
// Enter commits, Escape cancels) and all anchor state live in the
// host-agnostic machine; this file owns only the host glue — page
// anchoring, px→pt tolerances at the current zoom, tool-preview
// publishing (cubics flattened: the preview signal is polyline-only,
// plugin-draw BREAKAGE_LOG B-07), and the final `insertPath`
// Mutation. The whole path is anchored to the page under the FIRST
// click (the Rectangle handler's rule).

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import { flattenAnchorRun } from "@paged-media/draw-geometry";
import {
  PenMachine,
  type PenModifiers,
  type PenSnapshot,
} from "@paged-media/draw-tools";

import {
  beginPageDrag,
  endLocalFor,
  mutateAndSelect,
  pxToPt,
  type PageDrag,
} from "./shared";

/** Screen-space radius for the click-first-anchor close. */
const CLOSE_TOLERANCE_PX = 6;
/** Pointer travel below which a down→up places a corner, not a
 *  smooth-handle drag. */
const DRAG_THRESHOLD_PX = 3;

export function createPenHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let machine: PenMachine | null = null;
  let page: PageDrag | null = null;

  const reset = () => {
    machine = null;
    page = null;
    paged?.overlaySignals.setToolPreview(null);
  };

  /** Render/commit one machine snapshot. */
  const apply = (snap: PenSnapshot) => {
    if (!paged || !page) return;
    if (snap.commit) {
      const { pageId } = page;
      const { anchors, open } = snap.commit;
      reset();
      mutateAndSelect(
        paged,
        { op: "insertPath", args: { pageId, anchors, open } },
        "insertPath",
      );
      return;
    }
    if (!snap.active) {
      reset();
      return;
    }
    const points = flattenAnchorRun(snap.anchors, { close: snap.closePreview });
    if (snap.rubberTo) points.push([snap.rubberTo[0], snap.rubberTo[1]]);
    paged.overlaySignals.setToolPreview(
      points.length >= 2
        ? { pageId: page.pageId, points, close: snap.closePreview }
        : null,
    );
  };

  const mods = (e: CanvasPointerEvent): PenModifiers => ({
    shift: e.modifiers.shift,
    alt: e.modifiers.alt,
  });

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate(reason) {
      if (reason === "suspend") return;
      // A real tool switch COMMITS the in-progress path (Illustrator's
      // behaviour); a degenerate run cancels inside the machine.
      if (machine) apply(machine.handle({ type: "key", key: "Enter" }));
      reset();
    },
    onPointerDown(e: CanvasPointerEvent) {
      if (!paged || e.button !== 0) return;
      if (!machine) {
        const start = beginPageDrag(e);
        if (!start) return; // pasteboard click — no page to draw on
        page = start;
        machine = new PenMachine({
          closeTolerance: pxToPt(paged, CLOSE_TOLERANCE_PX),
          dragThreshold: pxToPt(paged, DRAG_THRESHOLD_PX),
        });
      }
      if (!page) return;
      apply(
        machine.handle({
          type: "down",
          point: endLocalFor(page, e),
          modifiers: mods(e),
        }),
      );
    },
    onPointerMove(e: CanvasPointerEvent) {
      // Hover moves arrive too (the rubber band tracks them); the
      // machine distinguishes drag from hover internally.
      if (!machine || !page) return;
      apply(
        machine.handle({
          type: "move",
          point: endLocalFor(page, e),
          modifiers: mods(e),
        }),
      );
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!machine || !page) return;
      apply(
        machine.handle({
          type: "up",
          point: endLocalFor(page, e),
          modifiers: mods(e),
        }),
      );
    },
    onKey(e: KeyboardEvent) {
      if (!machine) return;
      if (e.key === "Escape") {
        apply(machine.handle({ type: "key", key: "Escape" }));
      } else if (e.key === "Enter") {
        apply(machine.handle({ type: "key", key: "Enter" }));
      }
    },
  };
}
