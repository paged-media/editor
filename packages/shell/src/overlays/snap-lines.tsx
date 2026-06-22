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
 * Active snap guides — magenta 1pt non-scaling-stroke lines spanning
 * the relevant page along the perpendicular axis. Drawn high in the
 * z-order so they sit above selection chrome during a drag.
 */
function SnapLinesRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  const lines = signals?.snapLines ?? [];
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((l, i) => {
        const pr = props.pageRects.get(l.pageId);
        if (!pr) return null;
        if (l.axis === "x") {
          return (
            <line
              key={i}
              x1={pr.x + l.position}
              y1={pr.y}
              x2={pr.x + l.position}
              y2={pr.y + pr.h}
              stroke="var(--overlay-snap)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          );
        }
        return (
          <line
            key={i}
            x1={pr.x}
            y1={pr.y + l.position}
            x2={pr.x + pr.w}
            y2={pr.y + l.position}
            stroke="var(--overlay-snap)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        );
      })}
    </>
  );
}

export const snapLinesContribution: OverlayContribution = {
  id: "paged.snap-lines",
  render: SnapLinesRender,
  z: 500,
};
