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

// Ch.7 — The Apparatus (p45–p46): navigation as document structure.
// The fixture already carries the exhibits (hyperlink sources, the
// cross-reference pair, index markers, and the document-level
// bookmarks and topics); the two modules author AROUND them — a live
// insertHyperlink demonstration on the recto, the destination side and
// the fore-edge index-tab system on the verso, each with the live
// collection inventory printed on the page it describes.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as navigation } from "../pages/145-apparatus/01-navigation";
import { build as destination } from "../pages/145-apparatus/02-destination";

annualChapter({
  id: "145-apparatus",
  title: "Ch.7 The Apparatus",
  modules: [
    { id: "ap-navigation", pages: [p(45)], build: navigation },
    { id: "ap-destination", pages: [p(46)], build: destination },
  ],
});
