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

// The appendix, close — p133–p134. The colophon reads its numbers from
// the ledger fragments, the coverage universes and the live container,
// and ends the book on its one-line thesis, alone on the final verso.
// Its own spec: the appendix ran as one and outran 40 minutes twice
// with the limits and the index already banked, which puts the cost
// here — on the last two pages of the fullest the document ever gets.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as colophon } from "../pages/310-appendix/03-colophon";

annualChapter({
  id: "312-appendix-b",
  title: "Appendix - the Colophon",
  budgetMinutes: 70,
  modules: [{ id: "ax-colophon", pages: [p(133), p(134)], build: colophon }],
});
