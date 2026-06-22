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

// SDK Phase 5 (v1 sweep) — Color panel as a declarative
// composition.
//
// v1 ships fill picking + fill-tint scrub. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 2b. Future v2:
// CMYK / RGB channel sliders (would land as a new
// `paged.input.color-channel-sliders` primitive once we have a
// resolved-rgb side channel and a matching apply path).
//
// Reads:  `selectionProperty:frameFillColor` +
//         `selectionProperty:frameFillTint`
// Writes: same.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLLECTION_SELECT,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const colorComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Color" },
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
    {
      catalogId: PAGED_INPUT_NUMERIC_SCRUB,
      props: { label: "Tint" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFillTint",
        },
      },
    },
  ],
};
