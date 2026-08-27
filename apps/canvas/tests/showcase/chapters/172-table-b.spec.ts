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

// The second half of Ch.12 — see 170-table.spec.ts. Cell anatomy,
// structure ops, table and cell styles.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as anatomy } from "../pages/170-table/03-cell-anatomy";
import { build as structure } from "../pages/170-table/04-structure";
import { build as styles } from "../pages/170-table/05-styles";

annualChapter({
  id: "172-table-b",
  title: "Ch.12 The Table — cells, structure, styles",
  modules: [
    { id: "tb-anatomy", pages: [p(68)], build: anatomy },
    { id: "tb-structure", pages: [p(69)], build: structure },
    { id: "tb-styles", pages: [p(70)], build: styles },
  ],
});
