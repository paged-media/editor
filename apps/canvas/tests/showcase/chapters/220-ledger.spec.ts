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

// Ch.16 The Ledger — p95–p102, the paged.sheet chapter. The opener
// states the chapter's honesty rule (session state vs what persists);
// p96–97 hang the ten-kind chart wall as native vector art; p98 pours
// a range to a native table; p99 drives the calc engine, a spill, and
// the registry-counted function roster; p100–101 walk a spilled
// day-book across the gutter on a linked chain with a repeating header
// band; p102 closes with the edit verbs, a real XLSX export, and the
// container's own parts listing.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/220-ledger/01-opener";
import { build as chartWall } from "../pages/220-ledger/02-chart-wall";
import { build as pour } from "../pages/220-ledger/03-pour";
import { build as formulas } from "../pages/220-ledger/04-formulas";
import { build as chain } from "../pages/220-ledger/05-chain";
import { build as roundtrip } from "../pages/220-ledger/06-roundtrip";

annualChapter({
  id: "220-ledger",
  title: "Ch.16 The Ledger",
  modules: [
    { id: "lg-opener", pages: [p(95)], build: opener },
    { id: "lg-chart-wall", pages: [p(96), p(97)], build: chartWall },
    { id: "lg-pour", pages: [p(98)], build: pour },
    { id: "lg-formulas", pages: [p(99)], build: formulas },
    { id: "lg-chain", pages: [p(100), p(101)], build: chain },
    { id: "lg-roundtrip", pages: [p(102)], build: roundtrip },
  ],
});
