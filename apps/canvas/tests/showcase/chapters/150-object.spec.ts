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

// Ch.8 — The Object (p47–p52): the page-item chapter. The z-order
// ladder on the opener, the transform matrix and corner sampler on the
// p48/49 spread, stroke anatomy, path topology + every planar verb,
// and grouping/nesting with the object-style battery.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/150-object/01-opener";
import { build as transforms } from "../pages/150-object/02-transforms";
import { build as strokes } from "../pages/150-object/03-strokes";
import { build as paths } from "../pages/150-object/04-paths";
import { build as grouping } from "../pages/150-object/05-grouping";

annualChapter({
  id: "150-object",
  title: "Ch.8 The Object",
  modules: [
    { id: "ob-opener", pages: [p(47)], build: opener },
    { id: "ob-transforms", pages: [p(48), p(49)], build: transforms },
    { id: "ob-strokes", pages: [p(50)], build: strokes },
    { id: "ob-paths", pages: [p(51)], build: paths },
    { id: "ob-grouping", pages: [p(52)], build: grouping },
  ],
});
