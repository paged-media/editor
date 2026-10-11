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

// Cockpit — the kit's nine-menu line (File Edit Layout Type Object
// Data View Window Help). Real commands register elsewhere
// (File/Open IDML…, File/Export PDF…, Edit/Undo…, View/Zoom…, the
// registry-driven Window menu); everything here is the VISIBLE,
// honestly-disabled remainder of the kit's menu skeleton — each
// item lights up when its backing lands. Sentence case per the
// content rules.

import { PAGED_FILE_NEW, PAGED_FILE_NEW_FROM_BRIEF } from "@paged-media/shell";
import type { MenuItemContribution } from "@paged-media/shell";

const soon = (
  path: string,
  order: number,
  group?: string,
): MenuItemContribution => ({
  path,
  command: `paged.soon.${path.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  order,
  group,
  disabled: true,
});

/** A menu item that raises a registered panel (the registry derives a
 *  `paged.panel.show.<id>` command for every panel). */
const panel = (
  path: string,
  id: string,
  order: number,
  group?: string,
): MenuItemContribution => ({
  path,
  command: `paged.panel.show.${id}`,
  order,
  group,
});

export const COCKPIT_MENU_SEAMS: MenuItemContribution[] = [
  // ── File (kit FILE_MENU; New document… + Open IDML… + Export PDF… are real) ──
  { path: "File/New document…", command: PAGED_FILE_NEW, order: 5, group: "open" },
  { path: "File/New from a brief…", command: PAGED_FILE_NEW_FROM_BRIEF, order: 6, group: "open" },
  soon("File/Open recent", 12, "open"),
  soon("File/Close", 30, "save"),
  // `File/Save (.paged)` was a seam here until `client.exportPaged()`
  // got a caller; it is now a REAL entry registering from
  // app-commands.ts at the same slot (order 31, group "save"). The
  // MenuRegistry dedupes by path and would throw on the collision, so
  // the stub is gone rather than duplicated — same move `File/Place…`
  // made when the `paged.insert.*` layer landed.
  // `File/Place…` was a seam here until the `paged.insert.*` layer
  // landed; it is now a REAL entry (→ paged.insert.placeImage) that
  // registers from `insert-commands.ts` at the same slot (order 40,
  // group "place") — the MenuRegistry dedupes by path and would throw
  // on the collision, so the stub is gone rather than duplicated.
  soon("File/Package…", 60, "produce"),
  soon("File/Print…", 61, "produce"),
  // ── Layout ── (pages are real, from insert-commands; these three
  //    groups stay honest seams until their dialogs land)
  soon("Layout/Margins and columns…", 20, "page-setup"),
  soon("Layout/Ruler guides…", 30, "guides"),
  soon("Layout/Create guides…", 31, "guides"),
  soon("Layout/Numbering and section options…", 40, "numbering"),
  // ── Type ── all four were `soon` seams while the panels they name
  //    were registered and working; a whole top-level menu of dead
  //    items. They raise those panels now.
  panel("Type/Character…", "paged.character", 10, "format"),
  panel("Type/Paragraph…", "paged.paragraph", 11, "format"),
  panel("Type/Tabs…", "paged.tabs", 12, "format"),
  panel("Type/Bullets and numbering…", "paged.bullets-numbering", 13, "format"),
  panel("Type/Paragraph styles", "paged.paragraph-styles", 20, "styles"),
  panel("Type/Character styles", "paged.character-styles", 21, "styles"),
  panel("Type/Glyphs…", "paged.glyphs", 30, "insert"),
  panel("Type/Text variables", "paged.text-variables", 31, "insert"),
  // ── Object ──
  //
  // `Arrange` and `Group` were seams here until the `paged.object.*`
  // command layer landed; they are now REAL entries registered from
  // `object-commands.ts` (Bring to front / Bring forward / Send
  // backward / Send to back, and Group / Ungroup / Select parent
  // group), so the stubs are gone rather than duplicated — the
  // MenuRegistry treats a path as its dedupe key and would throw on
  // the collision anyway.
  soon("Object/Transform", 10),
  soon("Object/Effects…", 30),
  // ── Data (the data-publishing surface) ──
  //
  // D1 — these three were `soon(...)` seams whose labels duplicated
  // three LIVE, enabled pills in the Data-layout toolbar
  // (`data-sources` / `data-mapping` / `data-generate`), each of which
  // raises a real paged.data panel. So the verbs existed and the menu
  // said they did not: a designer who reached for Data > Connect source…
  // found it greyed with a "soon" badge and concluded the feature was
  // unbuilt. The seam was pointing the wrong way.
  //
  // They now open the same panels the pills do, through the panel-show
  // commands the registry derives for every registered panel. Gated on
  // the panel existing, so a build without paged.data shows nothing
  // rather than a dead entry.
  // ── Help ──
  //
  // E1/E5 — both items were `soon(...)` seams, so the app's only offer
  // to explain itself explained nothing. Keyboard shortcuts now opens a
  // panel rendered from the LIVE keybinding registry; Documentation
  // opens docs.paged.media.
];
