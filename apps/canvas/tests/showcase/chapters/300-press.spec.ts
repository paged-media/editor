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

// Part III divider + Ch.20 — Imposition & Proof (p119–p126): the
// press pass. The divider and opener state the exits-honestly thesis;
// the marks plate draws trim/bleed/marks anatomy as native geometry;
// then three E-Data pages run the real doors in-module — a pdf17
// preflight (diagnostics + findings printed, bytes discarded), the
// container part doors as a list/write/read round trip, and the IDML
// loss ledger with its own resident opacity-mask specimen — before
// the prose close walks every exit the book actually uses.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as divider } from "../pages/300-press/01-divider";
import { build as opener } from "../pages/300-press/02-opener";
import { build as marks } from "../pages/300-press/03-marks";
import { build as preflightPage } from "../pages/300-press/04-preflight";
import { build as container } from "../pages/300-press/05-container";
import { build as losses } from "../pages/300-press/06-losses";
import { build as exits } from "../pages/300-press/07-exits";

annualChapter({
  id: "300-press",
  title: "Part III divider · Ch.20 Imposition & Proof",
  modules: [
    { id: "pr-divider", pages: [p(119), p(120)], build: divider },
    { id: "pr-opener", pages: [p(121)], build: opener },
    { id: "pr-marks", pages: [p(122)], build: marks },
    { id: "pr-preflight", pages: [p(123)], build: preflightPage },
    { id: "pr-container", pages: [p(124)], build: container },
    { id: "pr-losses", pages: [p(125)], build: losses },
    { id: "pr-exits", pages: [p(126)], build: exits },
  ],
});
