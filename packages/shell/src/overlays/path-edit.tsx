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

import { useSyncExternalStore } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementId } from "@paged-media/client";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import type {
  PathEditAnchor,
  PathEditView,
} from "../state/path-edit-session";
import { useSelection } from "../state/selection-context";

/**
 * Path-edit chrome — the anchors, handles and segments of the path
 * being edited, drawn while `useSelection().pathEditMode` is on.
 *
 * THIS OVERLAY DRAWS; IT DOES NOT DECIDE. What it draws is the view of
 * the live `PathEditSession` (`useSelection().pathEditSession`): the
 * path as edited so far — so a drag previews on every pointer sample,
 * before anything is sent — the selected-anchor set, and the anchor
 * marquee. What a press does (drag an anchor, swing a handle, bend a
 * segment, start a marquee) is the session's machine; the press itself
 * arrives through ViewportCanvas's pointer router, the one place that
 * already owns pointer capture, cancel and blur for every other drag.
 *
 * The session's view is in PAGE-LOCAL pt — the element's item
 * transform is already applied — so a rotated or scaled path's dots sit
 * on its rendered outline with no matrix math here.
 *
 * Every dot keeps a hit shape (`pointer-events: all`) although nothing
 * listens on it: the shape gives the cursor, marks the dot for tests
 * (`data-path-anchor="<index>:<role>"`, `data-path-segment="<start>"`),
 * and the event bubbles to the canvas like any other. The sizes are the
 * session's grab sizes (`PATH_HIT_PX` in @paged-media/tools) — keep the
 * two in step, or the cursor promises a grab the press does not get.
 */
function PathEditRender(props: OverlayProps) {
  const { pathEditMode, pathEditSession } = useSelection();
  const session = pathEditMode ? pathEditSession : null;
  const view = useSyncExternalStore(
    session ? session.subscribe : subscribeToNothing,
    session ? session.getView : getNoView,
  );
  if (!view || view.anchors.length === 0) return null;
  const pr = props.pageRects.get(view.pageId);
  if (!pr) return null;

  const inv = 1 / props.camera.scale;
  const selected = new Set(view.selected);
  const segments = segmentPairs(view).map(([start, end]) => {
    const s = view.anchors[start];
    const e = view.anchors[end];
    return {
      start,
      d:
        `M ${pr.x + s.anchor[0]} ${pr.y + s.anchor[1]} ` +
        `C ${pr.x + s.right[0]} ${pr.y + s.right[1]}, ` +
        `${pr.x + e.left[0]} ${pr.y + e.left[1]}, ` +
        `${pr.x + e.anchor[0]} ${pr.y + e.anchor[1]}`,
    };
  });

  return (
    <g data-path-edit={`${view.target.kind}:${String(view.target.id)}`}>
      {/* The path itself, as edited so far. The engine repaints the
          element only when an edit is committed, so during a drag this
          hairline IS the preview of the shape being pulled. */}
      <path
        data-path-outline=""
        d={segments.map((seg) => seg.d).join(" ")}
        fill="none"
        stroke="var(--overlay-selection)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {segments.map((seg) => (
        // The segment's grab band: 8 px wide whatever the zoom. A click
        // inserts an anchor, a drag bends the segment.
        <path
          key={`seg:${seg.start}`}
          d={seg.d}
          fill="none"
          stroke="transparent"
          strokeWidth={8 * inv}
          data-path-segment={seg.start}
          style={{ cursor: "copy", pointerEvents: "stroke" }}
        />
      ))}
      {view.anchors.map((a, i) => {
        const ax = pr.x + a.anchor[0];
        const ay = pr.y + a.anchor[1];
        const lx = pr.x + a.left[0];
        const ly = pr.y + a.left[1];
        const rx = pr.x + a.right[0];
        const ry = pr.y + a.right[1];
        // A handle on its anchor is a corner's collapsed handle (IDML's
        // zero-length convention): no dot, nothing to grab.
        const hasLeft = isExtended(a, "left");
        const hasRight = isExtended(a, "right");
        return (
          <g key={i}>
            {hasLeft && renderHandleLine(ax, ay, lx, ly)}
            {hasRight && renderHandleLine(ax, ay, rx, ry)}
            {hasLeft && renderHandleDot(lx, ly, inv, `${i}:left`)}
            {hasRight && renderHandleDot(rx, ry, inv, `${i}:right`)}
            {renderAnchorDot(ax, ay, inv, `${i}:anchor`, selected.has(i))}
          </g>
        );
      })}
      {renderSubpathMarkers(view, pr, inv)}
      {view.marquee && (
        <rect
          data-path-marquee=""
          x={pr.x + view.marquee.x}
          y={pr.y + view.marquee.y}
          width={view.marquee.width}
          height={view.marquee.height}
          fill="var(--overlay-selection)"
          fillOpacity={0.08}
          stroke="var(--overlay-selection)"
          strokeWidth={1}
          strokeDasharray="4 2"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </g>
  );
}

const subscribeToNothing = () => () => {};
const getNoView = (): PathEditView | null => null;

function isExtended(a: PathEditAnchor, side: "left" | "right"): boolean {
  return (
    Math.hypot(a[side][0] - a.anchor[0], a[side][1] - a.anchor[1]) > 1e-3
  );
}

/** One `[start, end]` per segment: adjacent anchors within a contour,
 *  plus the closing (last → first) edge of a closed one. Contours with
 *  no explicit starts are a single contour; a missing `subpathOpen`
 *  entry is closed (the renderer's `unwrap_or(false)`). */
function segmentPairs(view: PathEditView): Array<readonly [number, number]> {
  const pairs: Array<readonly [number, number]> = [];
  const n = view.anchors.length;
  const starts = view.subpathStarts.length > 0 ? view.subpathStarts : [0];
  for (let si = 0; si < starts.length; si++) {
    const from = starts[si];
    const to = si + 1 < starts.length ? starts[si + 1] : n;
    for (let i = from; i + 1 < to; i++) pairs.push([i, i + 1]);
    const open = view.subpathOpen?.[si] ?? false;
    if (!open && to - from >= 2) pairs.push([to - 1, from]);
  }
  return pairs;
}

function renderHandleLine(x1: number, y1: number, x2: number, y2: number) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="var(--overlay-selection)"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

function renderAnchorDot(
  x: number,
  y: number,
  inv: number,
  address: string,
  selected: boolean,
) {
  const visiblePx = 7;
  const hitPx = 11;
  // A selected anchor fills, with a heavier stroke, so what a drag, a
  // nudge or Delete will act on is unambiguous.
  const fill = selected ? "var(--overlay-selection)" : "white";
  const strokeWidth = selected ? 2 : 1;
  return (
    <g transform={`translate(${x}, ${y}) scale(${inv})`}>
      <rect
        x={-hitPx / 2}
        y={-hitPx / 2}
        width={hitPx}
        height={hitPx}
        fill="transparent"
        data-path-anchor={address}
        data-selected={selected}
        style={{ cursor: "pointer", pointerEvents: "all" }}
      />
      <rect
        x={-visiblePx / 2}
        y={-visiblePx / 2}
        width={visiblePx}
        height={visiblePx}
        fill={fill}
        stroke="var(--overlay-selection)"
        strokeWidth={strokeWidth}
        pointerEvents="none"
      />
    </g>
  );
}

function renderHandleDot(x: number, y: number, inv: number, address: string) {
  const visiblePx = 5;
  const hitPx = 10;
  return (
    <g transform={`translate(${x}, ${y}) scale(${inv})`}>
      <circle
        cx={0}
        cy={0}
        r={hitPx / 2}
        fill="transparent"
        data-path-anchor={address}
        style={{ cursor: "pointer", pointerEvents: "all" }}
      />
      <circle
        cx={0}
        cy={0}
        r={visiblePx / 2}
        fill="var(--overlay-selection)"
        stroke="white"
        strokeWidth={1}
        pointerEvents="none"
      />
    </g>
  );
}

function renderSubpathMarkers(
  view: PathEditView,
  pr: { x: number; y: number },
  inv: number,
) {
  // Ring each subpath's first anchor so compound paths (a square
  // with a hole) make their contour boundaries visible.
  if (view.subpathStarts.length === 0) return null;
  return (
    <>
      {view.subpathStarts.map((startIdx, i) => {
        const a = view.anchors[startIdx];
        if (!a) return null;
        return (
          <circle
            key={`subpath:${i}`}
            cx={pr.x + a.anchor[0]}
            cy={pr.y + a.anchor[1]}
            r={10 * inv}
            fill="none"
            stroke="var(--overlay-selection)"
            strokeOpacity={0.4}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        );
      })}
    </>
  );
}

export const pathEditContribution: OverlayContribution = {
  id: "paged.path-edit",
  render: PathEditRender,
  // Above selection chrome / handles so the anchor dots aren't
  // hidden behind them, but below the marquee + snap-lines (which
  // belong on top during an active drag).
  z: 350,
};

/**
 * Step 5c — element-kind filter for the path-edit affordance.
 * Used by the Enter-key binding: only Polygons / Rectangles /
 * TextFrames / GraphicLines have a `<PathGeometry>` worth editing.
 * Ovals are declared by GeometricBounds only.
 */
export function elementSupportsPathEdit(id: ElementId | undefined): boolean {
  if (!id) return false;
  return (
    id.kind === "polygon" ||
    id.kind === "rectangle" ||
    id.kind === "textFrame" ||
    id.kind === "graphicLine"
  );
}
