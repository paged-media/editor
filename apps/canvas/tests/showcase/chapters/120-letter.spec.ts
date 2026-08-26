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

// Chapter 2 — The Letter (physical p19–p22). The OpenType specimen:
// the opener states the terms, the spread shows one feature per row
// with both states side by side, and the closing page runs the metric
// transforms. Rows whose feature the wire can only record are printed
// twice, identically, and labelled so.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/120-letter/01-opener";
import { build as features } from "../pages/120-letter/02-features";
import { build as metrics } from "../pages/120-letter/03-metrics";

annualChapter({
  id: "120-letter",
  title: "Ch.2 The Letter — p19–p22",
  modules: [
    { id: "lt-opener", pages: [p(19)], build: opener },
    { id: "lt-features", pages: [p(20), p(21)], build: features },
    { id: "lt-metrics", pages: [p(22)], build: metrics },
  ],
});
