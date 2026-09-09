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

// Part II · Ch.14 — The Drawing Office (p75–p86): the paged.draw
// chapter. The Part II divider, the crest-import opener, and then the
// studio floor by floor: parametric drafting, the pathfinder wall,
// live paint, the appearance stack, paint (gradients/pattern/dashes),
// repeats + symbols, blends + objects-on-path, type on a path, and the
// image-trace plate that closes the chapter.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as divider } from "../pages/200-drawing-office/01-divider";
import { build as opener } from "../pages/200-drawing-office/02-opener";
import { build as drafting } from "../pages/200-drawing-office/03-drafting";

annualChapter({
  id: "200-drawing-office",
  title: "Part II . Ch.14 The Drawing Office - crest and instruments",
  modules: [
    { id: "do-divider", pages: [p(75), p(76)], build: divider },
    { id: "do-opener", pages: [p(77)], build: opener },
    { id: "do-drafting", pages: [p(78)], build: drafting },
  ],
});
