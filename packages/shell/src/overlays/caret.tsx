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
import { useContentSelection } from "../state/content-selection-context";

/**
 * Text caret + selection-range rects. Both come from
 * ContentSelectionContext; the caret animates opacity, the rects are
 * filled translucent blue. Caret width inverse-scales so it stays
 * ~1.5 CSS px at any zoom.
 */
function CaretRender(props: OverlayProps) {
  const { caret, selectionRects } = useContentSelection();
  if (!caret && selectionRects.length === 0) return null;
  const inv = 1 / props.camera.scale;

  return (
    <>
      {selectionRects.map((r, i) => {
        const pr = props.pageRects.get(r.pageId);
        if (!pr) return null;
        return (
          <rect
            key={`range:${i}`}
            x={pr.x + r.leftPt}
            y={pr.y + r.topPt}
            width={r.widthPt}
            height={r.heightPt}
            fill="var(--overlay-selection)"
            fillOpacity={0.25}
            pointerEvents="none"
          />
        );
      })}
      {caret && renderCaret(caret, props, inv)}
    </>
  );
}

function renderCaret(
  caret: NonNullable<ReturnType<typeof useContentSelection>["caret"]>,
  props: OverlayProps,
  inv: number,
) {
  const pr = props.pageRects.get(caret.pageId);
  if (!pr) return null;
  const width = 1.5 * inv;
  return (
    <rect
      x={pr.x + caret.xPt - width / 2}
      y={pr.y + caret.topPt}
      width={width}
      height={caret.heightPt}
      fill="var(--overlay-selection)"
      pointerEvents="none"
      data-text-caret
    >
      <animate
        attributeName="opacity"
        values="1;0;1"
        dur="1.05s"
        repeatCount="indefinite"
      />
    </rect>
  );
}

export const caretContribution: OverlayContribution = {
  id: "paged.caret",
  render: CaretRender,
  z: 600,
};
