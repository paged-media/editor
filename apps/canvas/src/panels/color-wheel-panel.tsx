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

// Panel-gallery pass — the Color Wheel panel: the brand kit's
// standalone colour wheel (color-wheel.jsx) as a dockable panel.
// Fully live: the wheel authors RGB colours client-side and both
// add paths land real swatches through `createSwatch` — the
// harmony palette as ONE batch mutation so a single undo removes
// the whole palette.

import { useCanvasClient } from "@paged-media/shell";
import { ColorWheel } from "@paged-media/ui";
import type { Mutation, SwatchSpec } from "@paged-media/client";

export function ColorWheelPanel() {
  const client = useCanvasClient();

  const addSwatch = (spec: SwatchSpec) => {
    void client
      .mutate({
        op: "createSwatch",
        args: { spec: { ...spec, name: spec.name ?? "New swatch" } },
      })
      .catch(() => {});
  };

  const addPalette = (specs: SwatchSpec[]) => {
    if (specs.length === 0) return;
    const ops: Mutation[] = specs.map((spec) => ({
      op: "createSwatch",
      args: { spec },
    }));
    void client.mutate({ op: "batch", args: { ops } }).catch(() => {});
  };

  return (
    <div className="p-3 overflow-y-auto" data-color-wheel-panel="ready">
      <ColorWheel size={220} onAddSwatch={addSwatch} onPalette={addPalette} />
    </div>
  );
}
