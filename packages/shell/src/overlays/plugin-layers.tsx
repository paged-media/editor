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

// W-20 — the retained plugin overlay LAYERS (`host.overlay.layer`): data-
// only shapes a bundle keeps on the canvas (an in-frame text caret, an
// outline highlight) independent of the tool-preview slot. One
// contribution draws every layer, in stack order, through the SAME
// renderer as the tool preview, and sits just below it (z 410 < 420) so
// a tool's in-progress feedback is never hidden by a retained mark.

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useOptionalOverlaySignals } from "../state/overlay-signals-context";
import { renderPreviewShape } from "./tool-preview";

function PluginLayersRender(props: OverlayProps) {
  const layers = useOptionalOverlaySignals()?.overlayLayers;
  if (!layers || layers.length === 0) return null;
  return (
    <>
      {layers.map((layer) =>
        layer.shapes.length === 0 ? null : (
          <g key={layer.key} data-overlay-layer={layer.key}>
            {layer.shapes.map((shape, i) => (
              // Positional key: a layer is republished wholesale, so
              // there is no shape identity to preserve.
              // eslint-disable-next-line react/no-array-index-key
              <g key={i}>{renderPreviewShape(shape, props)}</g>
            ))}
          </g>
        ),
      )}
    </>
  );
}

export const pluginOverlayLayersContribution: OverlayContribution = {
  id: "paged.plugin-overlay-layers",
  render: PluginLayersRender,
  z: 410,
};
