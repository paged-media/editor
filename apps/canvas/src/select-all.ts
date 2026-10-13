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

// Edit ▸ Select all (Cmd/Ctrl+A).
//
// With a text caret it selects the whole story the caret is in (or the
// whole cell); otherwise every page item on the spread in view — the
// spread's pages and anything parked on its pasteboard, groups as one
// item each, which is what InDesign selects. There was no Select All at
// all before (film defect ED-14): no menu item, and Cmd+A did nothing.
//
// The caret case is ALSO handled inside `useTextEditing`, on the key, so
// it queues behind keys still in flight; the menu reaches it here.

import type {
  CommandContribution,
  KeybindingContribution,
  MenuItemContribution,
  PagedEditor,
} from "@paged-media/shell";
import type { ElementId, SceneTreeNode } from "@paged-media/client";

import { currentPageTarget } from "./insert-commands";
import { wholeStorySelection } from "./ui/useTextEditing";

export const PAGED_EDIT_SELECT_ALL = "paged.edit.selectAll";

/** A document is open and no edit context owns the selection model. */
const selectAllApplies = (state: unknown): boolean => {
  const s = state as {
    document?: { handle?: { pageCount?: number } | null } | null;
    editContext?: unknown;
  } | null;
  if (!s?.document?.handle || (s.document.handle.pageCount ?? 0) === 0) {
    return false;
  }
  return !s.editContext;
};

/** Every page item on the spread holding page `pageIndex` (document
 *  order, the order `handle.pageIds` and the scene tree share). */
export function spreadItems(
  tree: readonly SceneTreeNode[],
  pageIndex: number,
): ElementId[] {
  let pagesBefore = 0;
  for (const spread of tree) {
    const children = spread.children ?? [];
    const pages = children.filter((n) => n.kind === "Page").length;
    if (pageIndex < pagesBefore + pages) {
      const items: ElementId[] = [];
      for (const child of children) {
        if (child.kind === "Page") {
          for (const item of child.children ?? []) {
            if (item.id) items.push(item.id);
          }
        } else if (child.id) {
          items.push(child.id);
        }
      }
      return items;
    }
    pagesBefore += pages;
  }
  return [];
}

export async function selectAll(paged: PagedEditor): Promise<void> {
  const caret = paged.contentSelection.contentSelectionRef.current;
  if (caret) {
    const all = await wholeStorySelection(paged.client, caret);
    if (all) paged.contentSelection.setContentSelection(all);
    return;
  }
  const handle = paged.document.handle;
  if (!handle || handle.pageCount === 0) return;
  const pageId = currentPageTarget(paged)?.pageId ?? handle.pageIds[0];
  const ids = spreadItems(
    await paged.client.sceneTree(),
    Math.max(0, handle.pageIds.indexOf(pageId)),
  );
  // The engine has the last word on what is selectable.
  const applied = await paged.client.setElementSelection(ids, "replace");
  paged.selection.setElementSelection(applied);
  // Objects are selected now, so the Type tool would only get in the way
  // of moving them — InDesign hands over the Selection tool too.
  if (paged.selection.activeTool === "text") paged.selection.setActiveTool("select");
  paged.selection.setElementGeometry(await paged.client.elementGeometry(applied));
}

/** A text field has focus. Cmd+A is then the field's own: it selects the
 *  field's text, as in any app. Without this the binding took the key from
 *  every field (a panel's search box, the sheet's formula bar) and
 *  selected page items instead. A focused `<select>` or button does not
 *  count: Cmd+A there means the page. */
function textFieldHasFocus(): boolean {
  const el = typeof document === "undefined" ? null : document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return ["", "text", "search", "number", "email", "url", "tel", "password"].includes(type);
}

const selectAllKeyApplies = (state: unknown): boolean => selectAllApplies(state) && !textFieldHasFocus();

export const SELECT_ALL_COMMAND: CommandContribution = {
  id: PAGED_EDIT_SELECT_ALL,
  title: "Select all",
  category: "Edit",
  when: selectAllApplies,
  handler: (paged) => selectAll(paged as PagedEditor),
};

export const SELECT_ALL_MENU_ITEM: MenuItemContribution = {
  path: "Edit/Select all",
  command: PAGED_EDIT_SELECT_ALL,
  order: 10,
  group: "select",
  when: selectAllApplies,
};

export const SELECT_ALL_KEYBINDINGS: KeybindingContribution[] = [
  { key: "cmd+a", command: PAGED_EDIT_SELECT_ALL, when: selectAllKeyApplies },
  { key: "ctrl+a", command: PAGED_EDIT_SELECT_ALL, when: selectAllKeyApplies },
];
