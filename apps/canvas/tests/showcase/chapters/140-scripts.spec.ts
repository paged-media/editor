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

// Ch.6 — Scripts of the World (p41–p44): the opener, bidirectional
// text with a real substituted-font oracle, and the CJK vertical
// spread authored around the fixture's exhibits.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/140-scripts/01-opener";
import { build as bidi } from "../pages/140-scripts/02-bidi";
import { build as vertical } from "../pages/140-scripts/03-vertical";

annualChapter({
  id: "140-scripts",
  title: "Ch.6 Scripts of the World",
  modules: [
    { id: "sc-opener", pages: [p(41)], build: opener },
    { id: "sc-bidi", pages: [p(42)], build: bidi },
    { id: "sc-vertical", pages: [p(43), p(44)], build: vertical },
  ],
});
