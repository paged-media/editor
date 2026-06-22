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
 * Click-marker chrome — page outline + frame outline + crosshair at
 * the clicked document point. Diagnostic value: makes the hit-test
 * pipeline observable. Older than the element-selection chrome and
 * may eventually retire, but kept while the hit pathway is still
 * the source of truth for text editing.
 */
function HitMarkerRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  const selection = signals?.hitSelection;
  if (!selection) return null;
  const pr = props.pageRects.get(selection.pageId);
  if (!pr) return null;

  const markerX = pr.x + selection.docPoint[0];
  const markerY = pr.y + selection.docPoint[1];
  const inv = 1 / props.camera.scale;

  return (
    <g>
      <rect
        x={pr.x}
        y={pr.y}
        width={pr.w}
        height={pr.h}
        fill="none"
        stroke="var(--overlay-selection)"
        strokeOpacity="0.4"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {selection.hit.frameBounds && (
        <rect
          x={pr.x + selection.hit.frameBounds.left}
          y={pr.y + selection.hit.frameBounds.top}
          width={
            selection.hit.frameBounds.right - selection.hit.frameBounds.left
          }
          height={
            selection.hit.frameBounds.bottom - selection.hit.frameBounds.top
          }
          fill="none"
          stroke="var(--overlay-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      <g transform={`translate(${markerX}, ${markerY}) scale(${inv})`}>
        <line x1={-6} y1={0} x2={6} y2={0} stroke="var(--overlay-target)" strokeWidth={1.5} />
        <line x1={0} y1={-6} x2={0} y2={6} stroke="var(--overlay-target)" strokeWidth={1.5} />
        <circle cx={0} cy={0} r={2} fill="var(--overlay-target)" />
      </g>
    </g>
  );
}

export const hitMarkerContribution: OverlayContribution = {
  id: "paged.hit-marker",
  render: HitMarkerRender,
  z: 100,
};
