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

// Ch.13 The Picture — p71–p74. The opener carries the hero placement;
// the p72–73 spread is the format gallery (the SAME photograph through
// six codecs, plus the EPS that is recognised and honestly not
// decoded); p74 works the fitting model and the inline-bytes lane that
// survives the container round trip.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/175-picture/01-opener";
import { build as formats } from "../pages/175-picture/02-formats";
import { build as fitting } from "../pages/175-picture/03-fitting";

annualChapter({
  id: "175-picture",
  title: "Ch.13 The Picture",
  modules: [
    { id: "pi-opener", pages: [p(71)], build: opener },
    { id: "pi-formats", pages: [p(72), p(73)], build: formats },
    { id: "pi-fitting", pages: [p(74)], build: fitting },
  ],
});
