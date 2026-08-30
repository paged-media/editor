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

// Ch.20 closing (p125–p126): the loss ledger and the exits. The ledger
// runs a full IDML projection of the finished book in-module and prints
// what the format could not carry — a whole-book door, so this spec
// buys the same enlarged budget its sibling does — and the prose close
// walks every exit the book actually uses.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as losses } from "../pages/300-press/06-losses";
import { build as exits } from "../pages/300-press/07-exits";

annualChapter({
  id: "304-press-c",
  title: "Ch.20 Imposition & Proof - the losses and the exits",
  budgetMinutes: 70,
  modules: [
    { id: "pr-losses", pages: [p(125)], build: losses },
    { id: "pr-exits", pages: [p(126)], build: exits },
  ],
});
