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

// Ch.17 The Long Read — p103–p108, the paged.web chapter. The opener
// states the source-beside-render thesis; p104 places the article and
// prints its own envelope next to it; p105 threads one source across
// four frames in two flows (the named sidebar flow included); p106
// climbs the fragmentation ladder — the fares table splitting between
// body rows with its two-row header repeating, the card column
// splitting between blocks around one atomic image; p107–108 close on
// the live-versus-baked asymmetry, with the bake's receipt printed as
// reported and its registry row deliberately unclaimed.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/230-long-read/01-opener";
import { build as source } from "../pages/230-long-read/02-source";
import { build as flows } from "../pages/230-long-read/03-flows";

annualChapter({
  id: "230-long-read",
  title: "Ch.17 The Long Read - source and flows",
  modules: [
    { id: "lr-opener", pages: [p(103)], build: opener },
    { id: "lr-source", pages: [p(104)], build: source },
    { id: "lr-flows", pages: [p(105)], build: flows },
  ],
});
