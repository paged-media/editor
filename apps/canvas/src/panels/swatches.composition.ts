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

// SDK Phase 5 (named sweep) — Swatches panel as a declarative
// composition.
//
// Element-scope binding to `frameFillColor` (a `Value::ColorRef`
// payload, NOT `Value::Text`). Uses the same
// `PAGED_INPUT_COLLECTION_SELECT` primitive that drives Paragraph
// / Character / Object Styles, with `valueType: "colorRef"` so
// the leaf emits the matching wire shape on commit. This is the
// fourth panel exercising the §9 ≥2-panels rule for the
// collection-select primitive (now ≥4).
//
// v1 limitation: the panel only writes the fill color. A future
// polish adds a fill/stroke toggle so one swatch grid drives both
// targets. The `valueType` extension is the load-bearing piece.
//
// Reads:  `documentCollection:swatches`
// Writes: `selectionProperty:frameFillColor` (ColorRef payload)

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLLECTION_SELECT,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const swatchesComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Swatches" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_COLLECTION_SELECT,
      props: {
        label: "Fill",
        collectionName: "swatches",
        valueType: "colorRef",
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFillColor",
        },
      },
    },
  ],
};
