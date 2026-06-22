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
 * Live drag-selection rectangle. Reads from `OverlaySignalsContext`
 * so the marquee writer (ViewportCanvas) and the marquee renderer
 * stay decoupled — anyone who wants to draw a marquee
 * (a future "drag-select within a panel" gesture) writes the same
 * signal and the rendering survives.
 */
function MarqueeRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  if (!signals?.marqueeRect) return null;
  const m = signals.marqueeRect;
  const pr = props.pageRects.get(m.pageId);
  if (!pr) return null;
  const [top, left, bottom, right] = m.rect;
  return (
    <rect
      x={pr.x + left}
      y={pr.y + top}
      width={Math.max(0, right - left)}
      height={Math.max(0, bottom - top)}
      fill="var(--overlay-selection)"
      fillOpacity={0.08}
      stroke="var(--overlay-selection)"
      strokeWidth={1}
      strokeDasharray="4 2"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

export const marqueeContribution: OverlayContribution = {
  id: "paged.marquee",
  render: MarqueeRender,
  z: 400,
};
