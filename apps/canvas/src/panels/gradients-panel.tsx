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

// SDK Phase 5 (named sweep) — Gradients panel.
//
// Composition shim. Same recipe as Swatches with collectionName:
// "gradients". A gradient self_id flows through the same
// FrameFillColor apply arm as a swatch self_id (IDML allows
// either as the FillColor attribute).

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { gradientsComposition } from "./gradients.composition";
import { GradientEditor } from "./gradient-editor";

export function GradientsPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-gradients-panel="ready">
        <CompositionRenderer composition={gradientsComposition} />
        {/* Concept 2 — the ramp editor (expert child). */}
        <GradientEditor />
      </div>
    </CatalogRegistryProvider>
  );
}
