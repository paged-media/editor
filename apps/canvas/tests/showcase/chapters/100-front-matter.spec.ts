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

// Front matter — folios i–x. Sections run FIRST (they re-bake every
// folio); then the cover plate, frontispiece + title, the imprint's
// conditional text, the tab-leader contents, the legend, the control
// foreword, and the capability-map poster spread.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as sections } from "../pages/front-matter/01-sections";
import { build as cover } from "../pages/front-matter/02-cover";
import { build as title } from "../pages/front-matter/03-title";
import { build as imprint } from "../pages/front-matter/04-imprint";
import { build as contents } from "../pages/front-matter/05-contents";
import { build as legend } from "../pages/front-matter/06-legend";
import { build as foreword } from "../pages/front-matter/07-foreword";
import { build as poster } from "../pages/front-matter/08-poster";

annualChapter({
  id: "100-front-matter",
  title: "Front matter — folios i–x",
  modules: [
    { id: "fm-sections", pages: [p(3)], build: sections },
    { id: "fm-cover", pages: [p(1)], build: cover },
    { id: "fm-title", pages: [p(2), p(3)], build: title },
    { id: "fm-imprint", pages: [p(4)], build: imprint },
    { id: "fm-contents", pages: [p(5), p(6)], build: contents },
    { id: "fm-legend", pages: [p(7)], build: legend },
    { id: "fm-foreword", pages: [p(8)], build: foreword },
    { id: "fm-poster", pages: [p(9), p(10)], build: poster },
  ],
});
