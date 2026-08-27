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

// Chapter 9 — Ink & Light (physical p53–p56). The compositing chapter:
// the opener states the arithmetic, the D-Plate spread runs all sixteen
// blend modes over one constant motif, and the closing page mints
// gradients live, steps an opacity ramp, and applies both kinds of
// opacity mask — with the margin recording what the GPU lane and the
// IDML twin cannot carry.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/155-ink-light/01-opener";
import { build as modes } from "../pages/155-ink-light/02-modes";
import { build as light } from "../pages/155-ink-light/03-light";

annualChapter({
  id: "155-ink-light",
  title: "Ch.9 Ink & Light — p53–p56",
  modules: [
    { id: "il-opener", pages: [p(53)], build: opener },
    { id: "il-modes", pages: [p(54), p(55)], build: modes },
    { id: "il-light", pages: [p(56)], build: light },
  ],
});
