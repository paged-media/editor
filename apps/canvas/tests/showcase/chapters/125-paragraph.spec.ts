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

// Ch.3 The Paragraph — p23-p26. The opener, then the Knuth-Plass
// demonstration (the same paragraph set twice across the spread:
// hyphenated + justified against ragged + unhyphenated, with the
// tracking parameter row beneath), then keeps, breaks, drop caps and
// the indent/spacing battery.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/125-paragraph/01-opener";
import { build as knuthPlass } from "../pages/125-paragraph/02-knuth-plass";
import { build as keeps } from "../pages/125-paragraph/03-keeps";

annualChapter({
  id: "125-paragraph",
  title: "Ch.3 The Paragraph",
  modules: [
    { id: "pg-opener", pages: [p(23)], build: opener },
    { id: "pg-knuth-plass", pages: [p(24), p(25)], build: knuthPlass },
    { id: "pg-keeps", pages: [p(26)], build: keeps },
  ],
});
