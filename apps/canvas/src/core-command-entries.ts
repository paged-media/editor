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

// ADR 323 §4 — the menu / palette entry points onto the typed core
// commands. Each row names a core op; its command opens the generated
// form (core-command-dialog.tsx) on `core.<op>`, prefilled from the
// selection / caret plus the row's defaults. The panels add their own
// in-place entries (Masters, Pages, Text Variables, Gradients, Cell /
// Table Styles, Conditions, Table, the Path section).

import type { CommandContribution, MenuItemContribution } from "@paged-media/shell";

import { openCoreCommand } from "./core-command-dialog";

export interface CoreCommandEntry {
  /** The core op (the typed command is `core.<op>`). */
  op: string;
  title: string;
  /** Menu path; absent = palette only. */
  menu?: string;
  group?: string;
  order?: number;
  /** Defaults beyond what the selection / caret prefill. */
  prefill?: Record<string, unknown>;
}

/** Run any typed core command (the picker). */
export const RUN_CORE_COMMAND = "paged.core.runCommand";

export const CORE_COMMAND_ENTRIES: readonly CoreCommandEntry[] = [
  // Insert (Object menu, text-anchored inserts).
  { op: "insertField", title: "Insert field…", menu: "Object/Insert field…", group: "insert-text", order: 20, prefill: { field: "pageNumber" } },
  { op: "insertHyperlink", title: "Insert hyperlink…", menu: "Object/Insert hyperlink…", group: "insert-text", order: 21, prefill: { url: "https://" } },
  { op: "insertAnchoredFrame", title: "Insert anchored frame…", menu: "Object/Insert anchored frame…", group: "insert-text", order: 22, prefill: { width: 72, height: 72 } },
  { op: "setFieldValue", title: "Set field value…", menu: "Object/Set field value…", group: "insert-text", order: 23 },
  // Path (Object menu): point edits, construction, masks, type on a path.
  { op: "pathPointInsert", title: "Path: insert point…", menu: "Object/Path: insert point…", group: "path", order: 60, prefill: { index: 1, anchor: { anchor: [0, 0], left: [0, 0], right: [0, 0] } } },
  { op: "pathPointRemove", title: "Path: remove point…", menu: "Object/Path: remove point…", group: "path", order: 61, prefill: { index: 0 } },
  { op: "pathPointSet", title: "Path: move point…", menu: "Object/Path: move point…", group: "path", order: 62, prefill: { index: 0, role: "anchor" } },
  { op: "closePath", title: "Path: close path", menu: "Object/Path: close path…", group: "path", order: 63 },
  { op: "joinPaths", title: "Path: join paths", menu: "Object/Path: join paths…", group: "path", order: 64 },
  { op: "outlineStroke", title: "Path: outline stroke", menu: "Object/Path: outline stroke…", group: "path", order: 65, prefill: { width: 1, cap: "butt", join: "miter", miterLimit: 4 } },
  { op: "offsetPath", title: "Path: offset path", menu: "Object/Path: offset path…", group: "path", order: 66, prefill: { delta: 6, join: "miter", miterLimit: 4 } },
  { op: "pathfinderFaces", title: "Pathfinder: keep / remove faces…", menu: "Object/Pathfinder: faces…", group: "path", order: 67, prefill: { mode: "keep", faces: [] } },
  { op: "attachTextToPath", title: "Type on a path: attach…", menu: "Object/Type on a path: attach…", group: "path", order: 68 },
  { op: "detachTextFromPath", title: "Type on a path: detach", menu: "Object/Type on a path: detach…", group: "path", order: 69 },
  { op: "applyOpacityMask", title: "Opacity mask: make…", menu: "Object/Opacity mask: make…", group: "mask", order: 70 },
  { op: "releaseOpacityMask", title: "Opacity mask: release", menu: "Object/Opacity mask: release…", group: "mask", order: 71 },
  { op: "duplicateElements", title: "Step and repeat…", menu: "Object/Step and repeat…", group: "mask", order: 72, prefill: { offset: [12, 12] } },
  // Layout: pages, masters, sections.
  { op: "movePage", title: "Move page…", menu: "Layout/Move page…", order: 7 },
  { op: "createMaster", title: "New master…", menu: "Layout/New master…", order: 8 },
  { op: "renameMaster", title: "Rename master…", order: 9 },
  { op: "deleteMaster", title: "Delete master…", order: 10 },
  { op: "deleteSection", title: "Delete section…", order: 11 },
  // Named document objects (their panels carry the in-place buttons).
  { op: "createTextVariable", title: "New text variable…" },
  { op: "deleteTextVariable", title: "Delete text variable…" },
  { op: "createGradient", title: "New gradient…", prefill: { spec: { name: "New gradient", kind: "Linear", stops: [{ stopColor: "Color/Paper", locationPct: 0 }, { stopColor: "Color/Black", locationPct: 100 }] } } },
  { op: "deleteGradient", title: "Delete gradient…" },
  { op: "createCellStyle", title: "New cell style…" },
  { op: "deleteCellStyle", title: "Delete cell style…" },
  { op: "createTableStyle", title: "New table style…" },
  { op: "deleteTableStyle", title: "Delete table style…" },
  { op: "setConditionVisible", title: "Show / hide condition…" },
  { op: "deleteTable", title: "Delete table…" },
];

const entryCommandId = (op: string) => `paged.core.${op}`;

export function buildCoreCommandEntries(): CommandContribution[] {
  return [
    {
      id: RUN_CORE_COMMAND,
      title: "Run command…",
      category: "Edit",
      handler: () => openCoreCommand(null),
    },
    ...CORE_COMMAND_ENTRIES.map((e) => ({
      id: entryCommandId(e.op),
      title: e.title,
      category: e.menu?.split("/")[0] ?? "Document",
      handler: () => openCoreCommand(e.op, e.prefill ?? {}, { title: e.title }),
    })),
  ];
}

export const CORE_COMMAND_MENU_ITEMS: MenuItemContribution[] = [
  { path: "Edit/Run command…", command: RUN_CORE_COMMAND, order: 90, group: "commands" },
  ...CORE_COMMAND_ENTRIES.filter((e) => e.menu).map((e) => ({
    path: e.menu!,
    command: entryCommandId(e.op),
    order: e.order ?? 100,
    group: e.group,
  })),
];
