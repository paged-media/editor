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

// The chapter manifest — the whole build in one ordered list.
//
// Each entry pairs a chapter spec file (`NNN-name.spec.ts`) with the
// modules it runs. The assembly spec reads this to know the LAST
// checkpoint and the full module plan without importing spec files.
//
// This is currently the 16-page showcase redistributed into chapters —
// the machinery proof. The annual's ~70 modules land here chapter by
// chapter, replacing these entries; `TOTAL_PAGES` moves to the
// annual-base PAGE_COUNT when the fixture swaps.

import type { ChapterSpec } from "../chapter";
import type { SpreadSpec } from "../types";

import { build as buildCover } from "../pages/01-cover";
import { build as buildContents } from "../pages/02-contents";
import { build as buildEditorial } from "../pages/03-editorial";
import { build as buildRaster } from "../pages/05-raster";
import { build as buildVector } from "../pages/06-vector";
import { build as buildSpreadsheet } from "../pages/07-spreadsheet";
import { build as buildWeb } from "../pages/08-web";
import { build as buildDatabase } from "../pages/09-database";
import { build as buildWord } from "../pages/10-word";
import { build as buildTables } from "../pages/11-tables";
import { build as buildLayers } from "../pages/12-layers";
import { build as buildConditions } from "../pages/13-conditions";
import { build as buildMasters } from "../pages/14-masters";
import { build as buildColor } from "../pages/15-color";
import { build as buildColophon } from "../pages/16-colophon";

export const TOTAL_PAGES = 16;

const M = {
  cover: { id: "01-cover", pages: [0], build: buildCover },
  contents: { id: "02-contents", pages: [1], build: buildContents },
  editorial: { id: "03-editorial", pages: [2, 3], build: buildEditorial },
  raster: { id: "05-raster", pages: [4], build: buildRaster, needsGpu: true },
  vector: { id: "06-vector", pages: [5], build: buildVector },
  spreadsheet: { id: "07-spreadsheet", pages: [6], build: buildSpreadsheet },
  web: { id: "08-web", pages: [7], build: buildWeb },
  database: { id: "09-database", pages: [8], build: buildDatabase },
  word: { id: "10-word", pages: [9], build: buildWord },
  tables: { id: "11-tables", pages: [10], build: buildTables },
  layers: { id: "12-layers", pages: [11], build: buildLayers },
  conditions: { id: "13-conditions", pages: [12], build: buildConditions },
  masters: { id: "14-masters", pages: [13], build: buildMasters },
  color: { id: "15-color", pages: [14], build: buildColor },
  colophon: { id: "16-colophon", pages: [15], build: buildColophon },
} satisfies Record<string, SpreadSpec>;

export const CHAPTERS: ChapterSpec[] = [
  {
    id: "010-foundation",
    title: "cover, contents, and the threaded editorial",
    modules: [M.cover, M.contents, M.editorial],
    after: null,
    expectPages: TOTAL_PAGES,
  },
  {
    id: "020-studios-a",
    title: "raster, vector, spreadsheet, and web plates",
    modules: [M.raster, M.vector, M.spreadsheet, M.web],
    after: "010-foundation",
    expectPages: TOTAL_PAGES,
  },
  {
    id: "030-studios-b",
    title: "database and word plates",
    modules: [M.database, M.word],
    after: "020-studios-a",
    expectPages: TOTAL_PAGES,
  },
  {
    id: "040-native",
    title: "tables, layers, conditions, masters, colour",
    modules: [M.tables, M.layers, M.conditions, M.masters, M.color],
    after: "030-studios-b",
    expectPages: TOTAL_PAGES,
  },
  {
    id: "050-colophon",
    title: "the colophon",
    modules: [M.colophon],
    after: "040-native",
    expectPages: TOTAL_PAGES,
  },
];

/** The chapter whose checkpoint is the finished document. */
export const FINAL_CHAPTER = CHAPTERS[CHAPTERS.length - 1].id;
