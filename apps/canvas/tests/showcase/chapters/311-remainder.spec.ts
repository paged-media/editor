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

// The remainder bench — a chapter with no pages. It runs after the
// appendix's limits ledger and index and BEFORE the colophon, so the
// colophon's printed coverage numbers are the book's final ones.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as bench } from "../pages/311-remainder/01-bench";

annualChapter({
  id: "311-remainder",
  title: "The remainder bench",
  modules: [
    { id: "rm-bench", pages: [p(134)], build: bench, selfGated: true },
  ],
});
