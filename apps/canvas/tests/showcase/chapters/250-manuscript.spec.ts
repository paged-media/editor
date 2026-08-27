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

// Ch.19 The Manuscript — p115–p118, the paged.doc chapter. The opener
// states the provenance thesis (a placed DOCX is a PLACE, not an open);
// p116–117 pour annual-report.docx and read it as the exhibit — every
// lowering tier in the poured content itself, the source part's
// single-prefix path printed from the container's own listing; p118
// tells the byte-splice save-back story, prints the host's readiness
// verdict from the plugin's panel, and exports the .docx through the
// app's one download door with the result measured in bytes.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/250-manuscript/01-opener";
import { build as manuscript } from "../pages/250-manuscript/02-manuscript";
import { build as saveback } from "../pages/250-manuscript/03-saveback";

annualChapter({
  id: "250-manuscript",
  title: "Ch.19 The Manuscript",
  modules: [
    { id: "mp-opener", pages: [p(115)], build: opener },
    { id: "mp-manuscript", pages: [p(116), p(117)], build: manuscript },
    { id: "mp-saveback", pages: [p(118)], build: saveback },
  ],
});
