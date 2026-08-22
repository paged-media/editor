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

// SDK Phase 5 / panel-gallery pass — Pages list panel.
//
// Gallery list shape over `documentCollection:pages`, with the LIVE
// toolbar: New rides `insertPage` (after the selected page or the
// document end) and Delete rides `deletePage` against the selected row.
// Duplicate stays an honest seam (no duplicatePage Operation yet); the
// master column waits on per-page master reads.
//
// B3 — CLICKING A ROW ALSO NAVIGATES. InDesign's Pages panel is one
// surface that both goes to a page and edits the page list; paged split
// those in half and shipped the halves separately. `paged.pages` (the
// navigator, in Design mode's left dock by default) has thumbnails and
// jumps, and cannot add or delete. This panel could add and delete, is
// in no mode's slots, and its rows only toggled a local `selected`
// flag — so the half a designer can reach cannot edit, and the half
// that edits cannot be reached and did not navigate.
//
// Selection still toggles, because Delete needs a selected row. The
// jump is additive: click a row and the canvas goes there AND the row
// becomes the delete target, which is what the two-in-one panel does.

import { useState } from "react";

import {
  ListRows,
  PanelToolbar,
  ToolbarBtn,
  useCanvasClient,
  useCamera,
  useCollection,
  useDocument,
} from "@paged-media/shell";
import type { PageSummary } from "@paged-media/client";

import { fitCamera, layoutPages } from "../ui/layout";
import { useAnimatedCamera } from "../ui/useAnimatedCamera";

export function PagesListPanel() {
  const client = useCanvasClient();
  const items = useCollection<PageSummary>("pages");
  const [selected, setSelected] = useState<string | null>(null);
  const { handle } = useDocument();
  const { camera, setCamera, viewportSize } = useCamera();
  const animateCamera = useAnimatedCamera(camera, setCamera);

  // Page rects come from the same `layoutPages` the navigator and the
  // Home/PageUp shortcuts use, so "go to page 3" means the identical
  // camera wherever it is asked for.
  const jumpTo = (pageId: string) => {
    const [vw, vh] = viewportSize;
    if (vw < 10 || vh < 10 || !handle) return;
    const idx = handle.pageIds.indexOf(pageId);
    if (idx < 0) return;
    const rects = layoutPages(handle.pageSizesPt);
    const rect = rects[idx];
    if (rect) animateCamera(fitCamera(vw, vh, rect));
  };

  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-pages-list-panel="loading"
      >
        Loading pages…
      </div>
    );
  }

  const selectedPage = items.find((p) => p.selfId === selected) ?? null;

  const onNew = () => {
    const after = selectedPage ?? items[items.length - 1] ?? null;
    void client
      .mutate({
        op: "insertPage",
        args: { afterPageId: after?.selfId ?? null, masterId: null },
      })
      .catch(() => {});
  };

  // The seam here read "Duplicate page — awaiting engine support" while
  // `duplicatePage` sat in the capability matrix as MEASURED SUPPORTED.
  // A seam that outlives its gap tells the user a shipped feature is
  // missing, which is the same lie as claiming an unbuilt one works —
  // just harder to notice, because it still looks deliberate.
  const onDuplicate = selectedPage
    ? () => {
        void client
          .mutate({ op: "duplicatePage", args: { page: selectedPage.selfId } })
          .catch(() => {});
      }
    : undefined;

  const onDelete = selectedPage
    ? () => {
        void client
          .mutate({ op: "deletePage", args: { pageId: selectedPage.selfId } })
          .catch(() => {});
        setSelected(null);
      }
    : undefined;

  return (
    <div data-pages-list-panel="ready">
      <PanelToolbar>
        <ToolbarBtn icon="ui-plus" label="New page" onClick={onNew} />
        <ToolbarBtn
          icon="ui-x"
          label={
            selectedPage ? "Delete page" : "Delete page (select one first)"
          }
          onClick={onDelete}
        />
        <ToolbarBtn
          icon="ui-component"
          label={
            selectedPage ? "Duplicate page" : "Duplicate page (select one first)"
          }
          onClick={onDuplicate}
        />
      </PanelToolbar>
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-pages>
          No pages.
        </div>
      ) : (
        <div data-page-list>
          <ListRows
            rows={items.map((p) => ({
              key: p.selfId,
              icon: "panel-pages-list",
              primary: `Page ${p.index}`,
              secondary: `${p.sizePt[0].toFixed(0)} × ${p.sizePt[1].toFixed(0)} pt`,
              selected: p.selfId === selected,
              onClick: () => {
                setSelected((cur) => (cur === p.selfId ? null : p.selfId));
                jumpTo(p.selfId);
              },
            }))}
          />
        </div>
      )}
    </div>
  );
}
