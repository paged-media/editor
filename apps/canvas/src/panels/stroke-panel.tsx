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

// SDK Phase 3 — Stroke panel.
//
// Declarative composition over the existing FrameStrokeWeight +
// FrameStrokeColor apply arms. Element-scope bindings.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { strokeComposition } from "./stroke.composition";

export function StrokePanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-stroke-panel="ready">
        <CompositionRenderer composition={strokeComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
