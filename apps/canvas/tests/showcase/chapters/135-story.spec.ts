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

// Ch.5 — The Story (p33–p40): the flow chapter. The opener, the
// flagship four-frame thread with its pull-quote wrap and the
// fixture's footnote exhibit, honest overset with live page-number
// fields, the text-frame preference battery, auto-sizing, the wrap
// catalog, and anchored objects.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/135-story/01-opener";
import { build as thread } from "../pages/135-story/02-thread";
import { build as overset } from "../pages/135-story/03-overset";
import { build as framePrefs } from "../pages/135-story/04-frame-prefs";
import { build as autosize } from "../pages/135-story/05-autosize";
import { build as wrap } from "../pages/135-story/06-wrap";
import { build as anchored } from "../pages/135-story/07-anchored";

annualChapter({
  id: "135-story",
  title: "Ch.5 The Story — flow",
  modules: [
    // TEMP-DIAG: other modules disabled while the thread overset is
    // diagnosed; restored before handoff.
    { id: "st-thread", pages: [p(34), p(35)], build: thread },
  ],
});
