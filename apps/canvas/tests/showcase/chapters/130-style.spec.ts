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

// Ch.4 The Style — p27-p32. The opener, the cascade printing its own
// basedOn chains, live style CRUD narrated by the style it creates,
// nested styles + the next-style chain, bullets & numbering with the
// list-resource op triple, and rules/shading/borders/tabs.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/130-style/01-opener";
import { build as cascade } from "../pages/130-style/02-cascade";
import { build as crud } from "../pages/130-style/03-crud";
import { build as nested } from "../pages/130-style/04-nested-next";
import { build as numbering } from "../pages/130-style/05-numbering";
import { build as rulesTabs } from "../pages/130-style/06-rules-tabs";

annualChapter({
  id: "130-style",
  title: "Ch.4 The Style",
  modules: [
    { id: "st-opener", pages: [p(27)], build: opener },
    { id: "st-cascade", pages: [p(28)], build: cascade },
    { id: "st-crud", pages: [p(29)], build: crud },
    { id: "st-nested-next", pages: [p(30)], build: nested },
    { id: "st-numbering", pages: [p(31)], build: numbering },
    { id: "st-rules-tabs", pages: [p(32)], build: rulesTabs },
  ],
});
