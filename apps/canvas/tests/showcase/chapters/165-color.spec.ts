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

// Ch.11 The Colour — p61–p64. The opener shows the fixture's brand
// palette as labeled chips; p62 performs swatch and group surgery
// live (create, edit, transient delete, character-level colour,
// overprint); p63 walks the palette out of the document as .ase bytes
// and back in again; p64 works the prepress settings — colour
// management, proof setup, the ink manager, and document defaults.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/165-color/01-opener";
import { build as crud } from "../pages/165-color/02-swatch-crud";
import { build as ase } from "../pages/165-color/03-ase-loop";
import { build as management } from "../pages/165-color/04-management";

annualChapter({
  id: "165-color",
  title: "Ch.11 The Colour",
  modules: [
    { id: "co-opener", pages: [p(61)], build: opener },
    { id: "co-crud", pages: [p(62)], build: crud },
    { id: "co-ase", pages: [p(63)], build: ase },
    { id: "co-management", pages: [p(64)], build: management },
  ],
});
