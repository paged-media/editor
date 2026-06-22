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

// W2.4 (2026-06-06) — Tabs panel composition. The Tabs ruler is a
// bespoke whole-list editor (see tabs-panel.tsx): protocol v28's
// `paragraphTabStops` path replaces the paragraph's entire
// `<TabList>` in one op (`Value::TabStops(TabStopSpec[])`), the
// gradient-feather stop-list precedent — `Value` has no per-element
// list-edit form, so the panel commits the full new stop list per
// change.
//
// No catalog leaf models a variable-length struct list, so this file
// carries only the section wrapper that gives the panel its
// `data-section` hook; every stop row is hand-wired in the panel over
// the single content-scope `paragraphTabStops` binding.

import type { CompositionNode } from "@paged-media/catalog";
import { PAGED_LAYOUT_SECTION } from "@paged-media/shell";

export const tabsComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Tabs", heading: false },
  bindings: {},
  children: [],
};
