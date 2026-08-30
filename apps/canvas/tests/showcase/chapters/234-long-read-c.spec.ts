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

// Ch.17 The Long Read — p106, the fragmentation ladder. The fares table
// splits between body rows with its two-row header repeating; the card
// column splits between blocks around one atomic image. Its own spec
// because the ladder alone is a chapter's worth of composition, and
// because the refusal it records belongs to a session nothing else
// shares.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as fragments } from "../pages/230-long-read/04-fragments";

// Continuation of 232-long-read-b — split for the in-chain per-op cost;
// the checkpoint chain absorbs splits with zero logic change. Page order
// is a property of the book, not of the run: p106 is authored last.
annualChapter({
  id: "234-long-read-c",
  title: "Ch.17 The Long Read - the fragmentation ladder",
  modules: [{ id: "lr-fragments", pages: [p(106)], build: fragments }],
});
