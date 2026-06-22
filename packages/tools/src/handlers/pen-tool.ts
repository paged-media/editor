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

// Editor-ops — the Pen tool's gesture handler (W2.5).
//
// A multi-click authoring loop: clicks accumulate anchors across
// pointer-ups (the spine delivers each click as a down/up pair, each
// drag as down→move…→up, and Enter/Escape through `onKey`). The
// handler owns the in-flight anchor list; NOTHING is mutated until the
// path completes, when the whole run lands as ONE `insertPath`
// Mutation (single undo step — invariant 9 / INV-1). Everything before
// that is `setToolPreview` chrome only.
//
// Modifier matrix (Illustrator parity, gestures.md DR-08…DR-11):
//   click             → corner anchor (handles collapsed onto it)
//   click-drag        → smooth anchor (outgoing handle follows the
//                       pointer, incoming mirrors it — DR-08)
//   Alt during drag   → break the pair: incoming freezes, outgoing
//                       keeps following (DR-09)
//   Shift + click     → constrain the new anchor to 45° from the prev
//   Shift + drag      → constrain the handle pull to 45°
//   click 1st anchor  → close the path, commit { open: false } (DR-10)
//   Enter             → commit the open path, ≥ 2 anchors (degenerate
//                       run cancels)
//   Escape            → cancel, zero mutation (DR-11)
//
// The geometry primitives (corner/mirror/constrain/flatten) come from
// `@paged-media/draw-geometry` — the same host-free math the pencil
// handler and the paged.draw PenMachine share, so the corner/smooth
// shapes are identical across them. The small click→drag→close state
// machine lives here because it's the editor's authoring loop, not
// pure geometry.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import {
  constrainAngle,
  cornerAnchor,
  dist,
  flattenAnchorRun,
  mirrorHandle,
  type AnchorTriple,
  type Vec2,
} from "@paged-media/draw-geometry";

import { beginPageDrag, endLocalFor, mutateAndSelect, pxToPt, type PageDrag } from "./shared";

/** Screen-space radius for the click-on-first-anchor close (DR-10). */
const CLOSE_TOLERANCE_PX = 6;
/** Pointer travel below which a down→up is a click (corner), not a
 *  smooth-handle drag — converted to pt at the current zoom. */
const DRAG_THRESHOLD_PX = 3;
/** An open path needs at least two anchors to be worth committing. */
const MIN_ANCHORS = 2;

export function createPenHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  // The page the path is anchored to, fixed at the first click so the
  // run stays correct even if later clicks stray onto the pasteboard
  // or a neighbouring page (the Rectangle handler's rule).
  let page: PageDrag | null = null;
  let anchors: AnchorTriple[] = [];
  // Per-stroke drag bookkeeping, reset on every pointer-down.
  let downPoint: Vec2 | null = null;
  let dragging = false;
  let brokenLeft = false;
  let closing = false;
  let hover: Vec2 | null = null;

  const reset = () => {
    paged?.overlaySignals.setToolPreview(null);
    page = null;
    anchors = [];
    downPoint = null;
    dragging = false;
    brokenLeft = false;
    closing = false;
    hover = null;
  };

  const closeTolerancePt = () =>
    paged ? pxToPt(paged, CLOSE_TOLERANCE_PX) : CLOSE_TOLERANCE_PX;

  /** Is `point` within close-radius of the first anchor of a closeable
   *  (≥ 2-anchor) path? */
  const overFirstAnchor = (point: Vec2): boolean =>
    anchors.length >= MIN_ANCHORS &&
    dist(point, anchors[0].anchor) <= closeTolerancePt();

  /** Commit the accumulated run as one `insertPath`, then reset. A
   *  degenerate run (< 2 anchors) is dropped — never an empty op. */
  const commit = (open: boolean) => {
    if (!paged || !page || anchors.length < MIN_ANCHORS) {
      reset();
      return;
    }
    const { pageId } = page;
    const run = anchors;
    reset();
    mutateAndSelect(
      paged,
      { op: "insertPath", args: { pageId, anchors: run, open, smooth: false } },
      "insertPath",
    );
  };

  /** Repaint the preview: committed cubic run + optional closing edge +
   *  the rubber band to the hover point. */
  const repaint = () => {
    if (!paged || !page) return;
    if (anchors.length === 0) {
      paged.overlaySignals.setToolPreview(null);
      return;
    }
    const close = hover !== null && overFirstAnchor(hover);
    const points = flattenAnchorRun(anchors, { close });
    // Rubber-band the in-progress segment to the cursor (only while
    // not snapping to close — the close edge already returns to anchor 0).
    if (hover && !close) points.push([hover[0], hover[1]]);
    paged.overlaySignals.setToolPreview(
      points.length >= 2 ? { pageId: page.pageId, points, close } : null,
    );
  };

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate(reason) {
      // Spring-load suspend keeps the in-flight path (AC 5); a real
      // tool switch commits the open run (Illustrator behaviour) — a
      // degenerate run cancels inside `commit`.
      if (reason === "suspend") return;
      if (anchors.length >= MIN_ANCHORS) commit(true);
      else reset();
    },
    onPointerDown(e: CanvasPointerEvent) {
      if (!paged || e.button !== 0) return;
      // First click of a fresh path anchors it to the page under the
      // pointer; pasteboard clicks have no page and are ignored.
      if (!page) {
        const start = beginPageDrag(e);
        if (!start) return;
        page = start;
      }
      const point = endLocalFor(page, e);
      dragging = false;
      brokenLeft = false;
      hover = null;
      // Closing click lands on the first anchor — defer the commit to
      // pointer-up so a stray drag off it doesn't fire mid-press.
      if (overFirstAnchor(point)) {
        closing = true;
        downPoint = [point[0], point[1]];
        return;
      }
      closing = false;
      const placed: Vec2 =
        e.modifiers.shift && anchors.length > 0
          ? constrainAngle(anchors[anchors.length - 1].anchor, point)
          : point;
      anchors.push(cornerAnchor(placed));
      downPoint = [placed[0], placed[1]];
      repaint();
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !page) return;
      const point = endLocalFor(page, e);
      // Pointer up between clicks → hover: track for the rubber band /
      // close preview. (The spine delivers hover moves too.)
      if (!downPoint) {
        hover = point;
        repaint();
        return;
      }
      if (closing) return; // a press on anchor 0 doesn't pull handles
      const current = anchors[anchors.length - 1];
      if (!current) return;
      if (!dragging && dist(point, downPoint) <= pxToPt(paged, DRAG_THRESHOLD_PX)) {
        return; // still within the click slop — stays a corner
      }
      dragging = true;
      const pull: Vec2 = e.modifiers.shift
        ? constrainAngle(current.anchor, point)
        : point;
      current.right = [pull[0], pull[1]];
      if (e.modifiers.alt) {
        // Break the pair: the incoming handle freezes where it last
        // mirrored, the outgoing keeps following (DR-09).
        brokenLeft = true;
      } else if (!brokenLeft) {
        current.left = mirrorHandle(current.anchor, pull);
      }
      repaint();
    },
    onPointerUp() {
      if (!page) return;
      downPoint = null;
      dragging = false;
      if (closing) {
        closing = false;
        commit(false);
        return;
      }
      repaint();
    },
    onKey(e: KeyboardEvent) {
      if (!page) return;
      if (e.key === "Escape") {
        reset(); // DR-11: abort the whole path, zero mutation
      } else if (e.key === "Enter") {
        commit(true); // DR-11 other direction: commit the open run
      }
    },
    cursorAt(e: CanvasPointerEvent) {
      // Over the first anchor of a closeable path → the close cursor;
      // otherwise fall back to the tool's base crosshair (undefined).
      if (!page || !e.pagePoint) return undefined;
      return overFirstAnchor(endLocalFor(page, e))
        ? { kind: "css", token: "pointer" }
        : undefined;
    },
  };
}
