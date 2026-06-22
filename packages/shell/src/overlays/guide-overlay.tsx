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

// W2.8 — interactive guide overlay (GD-01…03).
//
// Renders the OPTIMISTIC guide mirror (the client store the
// controller keeps in sync with its insertGuide / moveGuide /
// deleteGuide mutations — see guide-drag-context.tsx for why) plus
// the LIVE drag preview, both in the design-system guide colour
// (violet, `--overlay-guide`). Each placed guide carries an
// invisible, wider hit line so a pointer-down on it starts a move
// drag (GD-02/03); the controller takes over from there.
//
// This is the editable companion to `ruler-guides.tsx`, which draws
// the load-time `DocumentHandle.rulerGuides` (read-only, no ids). To
// avoid double-drawing, the app registers EITHER this overlay (the
// editor) — which seeds its mirror from those same handle guides —
// and drops the read-only one. The static overlay stays for hosts
// that only display guides (the viewer).

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useOptionalGuideDrag } from "../state/guide-drag-context";
import { useOptionalScreenMode } from "../state/screen-mode-context";

/** Screen-space hit tolerance for grabbing a placed guide, px. The
 *  controller converts to doc-space via the camera so the grab zone
 *  is constant on screen across zoom (INV-6). */
const GUIDE_GRAB_PX = 4;

function GuideOverlayRender(props: OverlayProps) {
  const gd = useOptionalGuideDrag();
  // Concept 1 (T7) — guides are non-printing chrome: Normal mode only.
  const screenMode = useOptionalScreenMode();
  if (screenMode && screenMode.screenMode !== "normal") return null;
  if (!gd) return null;

  const inv = 1 / (props.camera.scale || 1);
  const grab = GUIDE_GRAB_PX * inv;
  const { guides, drag, beginMove } = gd;
  // While THIS guide is being moved, hide its placed line — the
  // preview line below stands in for it.
  const movingId = drag?.kind === "move" ? drag.guide?.id : null;

  return (
    <g>
      {guides.map((guide) => {
        if (guide.id === movingId) return null;
        const pr = props.pageRects.get(guide.pageId);
        if (!pr) return null;
        if (guide.orientation === "vertical") {
          const x = pr.x + guide.position;
          return (
            <g key={guide.id}>
              <line
                data-guide-overlay="vertical"
                x1={x}
                y1={pr.y}
                x2={x}
                y2={pr.y + pr.h}
                stroke="var(--overlay-guide)"
                strokeWidth={1 * inv}
                strokeOpacity={0.8}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              {/* wider transparent grab line — starts a move drag.
                  `pointerEvents: stroke` re-enables hit-testing on
                  this line only (the host SVG is pointer-events:none),
                  same affordance pattern as the resize handles. */}
              <line
                data-guide-hit="vertical"
                x1={x}
                y1={pr.y}
                x2={x}
                y2={pr.y + pr.h}
                stroke="transparent"
                strokeWidth={grab * 2}
                style={{ pointerEvents: "stroke", cursor: "ew-resize" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  beginMove(guide);
                }}
              />
            </g>
          );
        }
        const y = pr.y + guide.position;
        return (
          <g key={guide.id}>
            <line
              data-guide-overlay="horizontal"
              x1={pr.x}
              y1={y}
              x2={pr.x + pr.w}
              y2={y}
              stroke="var(--overlay-guide)"
              strokeWidth={1 * inv}
              strokeOpacity={0.8}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <line
              data-guide-hit="horizontal"
              x1={pr.x}
              y1={y}
              x2={pr.x + pr.w}
              y2={y}
              stroke="transparent"
              strokeWidth={grab * 2}
              style={{ pointerEvents: "stroke", cursor: "ns-resize" }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                beginMove(guide);
              }}
            />
          </g>
        );
      })}

      {/* Live preview — the line following the cursor during a drag.
          Drawn dashed when it would CANCEL on release (over the ruler,
          or off every page) so the cancel affordance reads. */}
      {drag && drag.previewPageId != null && drag.previewPosition != null
        ? renderPreview(props, drag)
        : null}
    </g>
  );
}

function renderPreview(
  props: OverlayProps,
  drag: NonNullable<ReturnType<typeof useOptionalGuideDrag>>["drag"],
) {
  if (!drag || drag.previewPageId == null || drag.previewPosition == null) {
    return null;
  }
  const pr = props.pageRects.get(drag.previewPageId);
  if (!pr) return null;
  const inv = 1 / (props.camera.scale || 1);
  const willCancel = drag.overRuler;
  const dash = willCancel ? `${4 * inv} ${3 * inv}` : undefined;
  if (drag.orientation === "vertical") {
    const x = pr.x + drag.previewPosition;
    return (
      <line
        data-guide-preview="vertical"
        x1={x}
        y1={pr.y}
        x2={x}
        y2={pr.y + pr.h}
        stroke="var(--overlay-guide)"
        strokeWidth={1 * inv}
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  }
  const y = pr.y + drag.previewPosition;
  return (
    <line
      data-guide-preview="horizontal"
      x1={pr.x}
      y1={y}
      x2={pr.x + pr.w}
      y2={y}
      stroke="var(--overlay-guide)"
      strokeWidth={1 * inv}
      strokeDasharray={dash}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

export const guideOverlayContribution: OverlayContribution = {
  id: "paged.guide-overlay",
  render: GuideOverlayRender,
  // Just above the read-only ruler-guides (z 75) and page decorations,
  // below selection chrome (200+) — a quiet editable line, same band
  // as the static guides it supersedes.
  z: 80,
};
