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

// Chapter 10 — The Effects (physical p57–p60). The engine's eight
// frame-effect families and their ~66 property paths: a contact sheet
// (one family per tile, full battery), two hero compositions plus the
// gradient feather, then the parameter table that varies one knob at a
// time. Every per-field path is written at least once across the
// chapter — the shared battery in effect-families.ts is the checklist.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/160-effects/01-opener";
import { build as families } from "../pages/160-effects/02-families";
import { build as parameters } from "../pages/160-effects/03-parameters";

annualChapter({
  id: "160-effects",
  title: "Ch.10 The Effects — p57–p60",
  modules: [
    { id: "fx-opener", pages: [p(57)], build: opener },
    { id: "fx-families", pages: [p(58), p(59)], build: families },
    { id: "fx-parameters", pages: [p(60)], build: parameters },
  ],
});
