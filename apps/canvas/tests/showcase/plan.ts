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

// The page plan. One entry per spread, in document order.
//
// Kept separate from the spec so the ORDER and the OWNERSHIP of pages
// are one readable list rather than something you reconstruct from a
// sequence of awaits. Adding a spread is adding a line here plus a
// module in `pages/`.

import type { SpreadSpec } from "./types";

import { build as buildCover } from "./pages/01-cover";
import { build as buildContents } from "./pages/02-contents";
import { build as buildEditorial } from "./pages/03-editorial";
import { build as buildRaster } from "./pages/05-raster";
import { build as buildVector } from "./pages/06-vector";
import { build as buildSpreadsheet } from "./pages/07-spreadsheet";
import { build as buildWeb } from "./pages/08-web";
import { build as buildDatabase } from "./pages/09-database";
import { build as buildWord } from "./pages/10-word";
import { build as buildTables } from "./pages/11-tables";
import { build as buildLayers } from "./pages/12-layers";
import { build as buildConditions } from "./pages/13-conditions";
import { build as buildMasters } from "./pages/14-masters";
import { build as buildColor } from "./pages/15-color";
import { build as buildColophon } from "./pages/16-colophon";

export const SHOWCASE_PAGES = 16;

export const PLAN: SpreadSpec[] = [
  { id: "01-cover", pages: [0], build: buildCover },
  { id: "02-contents", pages: [1], build: buildContents },
  { id: "03-editorial", pages: [2, 3], build: buildEditorial },
  { id: "05-raster", pages: [4], build: buildRaster, needsGpu: true },
  { id: "06-vector", pages: [5], build: buildVector },
  { id: "07-spreadsheet", pages: [6], build: buildSpreadsheet },
  { id: "08-web", pages: [7], build: buildWeb },
  { id: "09-database", pages: [8], build: buildDatabase },
  { id: "10-word", pages: [9], build: buildWord },
  { id: "11-tables", pages: [10], build: buildTables },
  { id: "12-layers", pages: [11], build: buildLayers },
  { id: "13-conditions", pages: [12], build: buildConditions },
  { id: "14-masters", pages: [13], build: buildMasters },
  { id: "15-color", pages: [14], build: buildColor },
  { id: "16-colophon", pages: [15], build: buildColophon },
];
