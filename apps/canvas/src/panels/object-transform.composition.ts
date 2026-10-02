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
// Bounds is `paged.input.pageBounds`: WHERE the selection is (its bounds
// through its item transform — `page-position.ts`), not its inner
// `frameBounds`, which stood still under a nudge or a rotation. Opacity
// is the plain element-scope binding. Rotation + scale live in the
// bespoke Transform panel (`object-transform-panel.tsx`).

import type { CompositionNode } from "@paged-media/catalog";
import { PAGED_INPUT_LENGTH, PAGED_LAYOUT_SECTION } from "@paged-media/shell";

import { PAGED_INPUT_PAGE_BOUNDS } from "./page-bounds-leaf";

export const objectTransformComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Object" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_PAGE_BOUNDS,
      props: { label: "Bounds" },
      // The leaf reads the selection's geometry itself: a footprint is
      // two paths composed, which a single binding cannot express.
      bindings: {},
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
