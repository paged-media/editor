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

// Ch.20 continued (p123–p124): the preflight and the container. Both
// pages run a real door over the WHOLE book in-module — a pdf17 export
// session that answers for all 134 pages, then the container part doors
// as a list/write/read round trip — which is why they carry a 70-minute
// budget instead of the authoring default. Ch.20 originally ran as one
// spec and outran 40 minutes twice; the exports, not the authoring, are
// what the clock was measuring.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as preflightPage } from "../pages/300-press/04-preflight";
import { build as container } from "../pages/300-press/05-container";

annualChapter({
  id: "302-press-b",
  title: "Ch.20 Imposition & Proof - the preflight and the container",
  budgetMinutes: 70,
  modules: [
    { id: "pr-preflight", pages: [p(123)], build: preflightPage },
    { id: "pr-container", pages: [p(124)], build: container },
  ],
});
