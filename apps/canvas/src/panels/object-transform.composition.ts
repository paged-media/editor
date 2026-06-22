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

// SDK Phase 3 — Object/Transform panel as a declarative composition.
//
// Element-scope bindings — bounds + opacity, both existing
// frame-level paths. The full Object/Transform panel will eventually
// also expose explicit rotation + scale (decomposed from
// FrameTransform via a future `paged.input.rotation` /
// `paged.input.scale` primitive); for v1 only bounds + opacity are
// catalog-bindable, which keeps this commit scope-minimal.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_LENGTH,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const objectTransformComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Object" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_BOUNDS,
      props: { label: "Bounds" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameBounds",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_LENGTH,
      props: { label: "Opacity" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameOpacity",
        },
      },
    },
  ],
};
