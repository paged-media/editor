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

// Ch.12 The Table — p65–p70, the E-Data chapter. The flagship is the
// p66–67 spread: one native table taller than its frame, continuing
// across a linked chain that crosses the gutter, with a header row
// and a footer row that visibly REPEAT at the break — the
// demonstration the 16-page showcase recorded it could not make.
// p68 samples the cell property paths, p69 the structure ops, p70 the
// table/cell style CRUD and the closing financial exhibit.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/170-table/01-opener";
import { build as ledger } from "../pages/170-table/02-ledger";
import { build as anatomy } from "../pages/170-table/03-cell-anatomy";
import { build as structure } from "../pages/170-table/04-structure";
import { build as styles } from "../pages/170-table/05-styles";

annualChapter({
  id: "170-table",
  title: "Ch.12 The Table",
  modules: [
    { id: "tb-opener", pages: [p(65)], build: opener },
    { id: "tb-ledger", pages: [p(66), p(67)], build: ledger },
    { id: "tb-anatomy", pages: [p(68)], build: anatomy },
    { id: "tb-structure", pages: [p(69)], build: structure },
    { id: "tb-styles", pages: [p(70)], build: styles },
  ],
});
