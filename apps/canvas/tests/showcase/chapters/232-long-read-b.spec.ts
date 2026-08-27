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
import { build as fragments } from "../pages/230-long-read/04-fragments";
import { build as bake } from "../pages/230-long-read/05-bake";


// Continuation of 230-long-read - split for the in-chain per-op cost;
// the checkpoint chain absorbs splits with zero logic change.
annualChapter({
  id: "232-long-read-b",
  title: "Ch.17 The Long Read - fragments and the bake",
  modules: [
    // The BAKE runs before the fragments module ON PURPOSE (pages keep
    // their book order — modules need not run in it): the card chain's
    // scene-layer refusal on p106 leaves the web engine lane wounded
    // for the rest of the session, and the bake spread must meet a
    // healthy engine to have anything honest to compare. The refusal
    // itself is p106's finding and stays recorded there.
    { id: "lr-bake", pages: [p(107), p(108)], build: bake },
    { id: "lr-fragments", pages: [p(106)], build: fragments },
  ],
});
