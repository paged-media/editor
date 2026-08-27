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

// Ch.18 The Catalog — p109–p114, the paged.data chapter. The opener
// prints the order book as a source specimen; p110 lowers three of its
// columns into a record card as caret-placed fields; p111 shows the
// native table lane and transcribes the governance readouts; p112 draws
// all four barcode symbologies as native path geometry; p113 plays the
// card through data sets, the preview stepper and the refresh; p114
// prints the DSL's registry-driven roster and evaluates two expressions
// live.
//
// RUN ORDER ≠ PAGE ORDER, on purpose (pages keep their book order;
// modules need not run in it). The plugin's data session is shared
// across the chapter and `lowerAll` re-lowers EVERY binding — a
// re-lower re-draws each bound barcode afresh onto the ACTIVE page and
// re-commits the demo table as a new frame — so the modules run in
// dependency order instead: cards (mints the variable bindings), sets
// (previews/applies while only in-place-refreshing bindings exist),
// dsl (the first frame-bound bindings), barcodes (cleans dsl's
// re-draws), and the table LAST (the final lowering pass, cleaning all
// six symbols' re-draws behind itself).

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/240-catalog/01-opener";
import { build as cards } from "../pages/240-catalog/02-cards";
import { build as sets } from "../pages/240-catalog/03-sets";
import { build as dsl } from "../pages/240-catalog/04-dsl";
import { build as barcodes } from "../pages/240-catalog/05-barcodes";
import { build as table } from "../pages/240-catalog/06-table";

annualChapter({
  id: "240-catalog",
  title: "Ch.18 The Catalog",
  modules: [
    { id: "ct-opener", pages: [p(109)], build: opener },
    { id: "ct-cards", pages: [p(110)], build: cards },
    { id: "ct-sets", pages: [p(113)], build: sets },
    { id: "ct-dsl", pages: [p(114)], build: dsl },
    { id: "ct-barcodes", pages: [p(112)], build: barcodes },
    { id: "ct-table", pages: [p(111)], build: table },
  ],
});
