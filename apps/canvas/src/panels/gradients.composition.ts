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

// SDK Phase 5 (named sweep) — Gradients panel as a declarative
// composition.
//
// Direct twin of `swatches.composition.ts`. IDML treats gradients
// as named entries in the same `Graphic` palette (via
// `<Gradient Self="Gradient/...">`); a frame's `FillColor`
// attribute can carry either a `Swatch/*` or `Gradient/*` self_id
// — both flow through the same `FrameFillColor` apply arm and
// `Value::ColorRef` write. So the only thing different from the
// Swatches panel is the bound collection.
//
// Reads:  `documentCollection:gradients`
// Writes: `selectionProperty:frameFillColor` (ColorRef payload
//         carrying a `Gradient/<self_id>`)

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLLECTION_SELECT,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const gradientsComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Gradients" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_COLLECTION_SELECT,
      props: {
        label: "Fill",
        collectionName: "gradients",
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
