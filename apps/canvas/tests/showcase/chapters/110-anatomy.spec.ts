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

// Part I · Chapter 1 — Anatomy of This Book (physical p11–p18). The
// book takes itself apart: the part divider, the chapter opener, the
// self-exposing grid with live guides, the transient page-op battery,
// the full layer lifecycle, and the conditions/variables apparatus.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as divider } from "../pages/110-anatomy/01-divider";
import { build as opener } from "../pages/110-anatomy/02-opener";
import { build as grid } from "../pages/110-anatomy/03-grid";
import { build as masters } from "../pages/110-anatomy/04-masters";
import { build as layers } from "../pages/110-anatomy/05-layers";
import { build as apparatus } from "../pages/110-anatomy/06-apparatus";

annualChapter({
  id: "110-anatomy",
  title: "Part I · Ch.1 Anatomy of This Book — p11–p18",
  modules: [
    { id: "an-divider", pages: [p(11), p(12)], build: divider },
    { id: "an-opener", pages: [p(13)], build: opener },
    { id: "an-grid", pages: [p(14), p(15)], build: grid },
    { id: "an-masters", pages: [p(16)], build: masters },
    { id: "an-layers", pages: [p(17)], build: layers },
    { id: "an-apparatus", pages: [p(18)], build: apparatus },
  ],
});
