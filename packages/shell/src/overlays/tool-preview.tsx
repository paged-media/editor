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

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useOptionalOverlaySignals } from "../state/overlay-signals-context";

/**
 * Concept 1 — the active tool handler's in-progress preview (the
 * Rectangle rubber-band today; a future Pen path / Line preview reuses
 * the same signal). Solid stroke — visually distinct from the dashed
 * selection marquee. The writer is the gesture handler via
 * `paged.overlaySignals.setToolPreview`.
 */
function ToolPreviewRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  if (!signals?.toolPreview) return null;
  const p = signals.toolPreview;
  const pr = props.pageRects.get(p.pageId);
  if (!pr) return null;
  // Editor-ops — gridify variant (W2.7): the N×M cell outlines a
  // rectangle/frame drag splits into under arrow keys. Each cell is a
  // rect in the same stroke family as the single rubber-band.
  if ("cells" in p) {
    return (
      <g fill="none" stroke="var(--overlay-snap)" strokeWidth={1.25}>
        {p.cells.map(([top, left, bottom, right], i) => (
          <rect
            // Static list (one published grid frame); index key is stable.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            x={pr.x + left}
            y={pr.y + top}
            width={Math.max(0, right - left)}
            height={Math.max(0, bottom - top)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
      </g>
    );
  }
  // B-07 — path/cubic variant (in-progress pen). The signal carries
  // the true anchor/handle run, so we emit ONE real <path> of `C`
  // commands rather than a flattened polyline — exact at any zoom, no
  // per-pointermove sampling. Same snap-teal stroke as the rest of the
  // tool-preview family; `dashed` opts into the dashed vocabulary.
  if ("anchors" in p) {
    const a = p.anchors;
    if (a.length < 2) return null;
    // M to anchor 0, then a cubic per segment using the outgoing handle
    // of the start anchor (`right`) and the incoming handle of the end
    // anchor (`left`) as the two control points — IDML PathPointType
    // semantics, identical to how the engine reads the committed path.
    const seg = (
      from: (typeof a)[number],
      to: (typeof a)[number],
    ): string =>
      `C ${pr.x + from.right[0]},${pr.y + from.right[1]} ` +
      `${pr.x + to.left[0]},${pr.y + to.left[1]} ` +
      `${pr.x + to.anchor[0]},${pr.y + to.anchor[1]}`;
    let d = `M ${pr.x + a[0].anchor[0]},${pr.y + a[0].anchor[1]}`;
    for (let i = 0; i < a.length - 1; i++) d += ` ${seg(a[i], a[i + 1])}`;
    if (p.close) d += ` ${seg(a[a.length - 1], a[0])} Z`;
    return (
      <path
        d={d}
        fill="none"
        stroke="var(--overlay-snap)"
        strokeWidth={1.25}
        {...(p.dashed ? { strokeDasharray: "4 3" } : {})}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  }
  // Editor-ops — polyline variant (Line drag, Pencil stroke,
  // Gradient axis). Same stroke as the rect rubber-band so every
  // tool preview reads as one visual family.
  if ("points" in p) {
    const pts = p.points
      .map(([x, y]) => `${pr.x + x},${pr.y + y}`)
      .join(" ");
    const Tag = p.close ? "polygon" : "polyline";
    return (
      <Tag
        points={pts}
        fill="none"
        stroke="var(--overlay-snap)"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  }
  const [top, left, bottom, right] = p.rect;
  return (
    <rect
      x={pr.x + left}
      y={pr.y + top}
      width={Math.max(0, right - left)}
      height={Math.max(0, bottom - top)}
      fill="none"
      stroke="var(--overlay-snap)"
      strokeWidth={1.25}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

export const toolPreviewContribution: OverlayContribution = {
  id: "paged.tool-preview",
  render: ToolPreviewRender,
  z: 420,
};
