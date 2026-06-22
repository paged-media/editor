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

// SDK Phase 5 (v1 sweep) — Text Wrap panel.
//
// Composition shim. Element-scope bindings to frameTextWrapMode +
// frameTextWrapOffsets + textWrapInvert (W2.3). All three share the
// same Option<TextWrap> backing field; the apply arms preserve the
// other members when one is committed in isolation.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { textWrapComposition } from "./text-wrap.composition";

export function TextWrapPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-text-wrap-panel="ready">
        <CompositionRenderer composition={textWrapComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
