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

// SDK Phase 5 / panel-gallery pass — Master Pages panel.
//
// Gallery list shape over every master spread referenced via
// `AppliedMaster`. ADR 323 §4 — the toolbar and the per-master trail run
// the typed core commands: New (`core.createMaster`), Apply to a page
// (`core.applyMasterToPage`), Rename (`core.renameMaster`) and Delete
// (`core.deleteMaster`) — each one invoke = one undo step; the ones that
// need a name or a page open the generated form.

import { ListRows, useCollection, useDocument } from "@paged-media/shell";
import type { MasterPageSummary } from "@paged-media/client";

import { CoreCommandButton, newMasterPrefill } from "../core-command-dialog";

export function MasterPagesPanel() {
  const items = useCollection<MasterPageSummary>("masterPages");
  const pageSize = useDocument().handle?.pageSizesPt[0] ?? null;
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-master-pages-panel="loading"
      >
        Loading master pages…
      </div>
    );
  }
  return (
    <div data-master-pages-panel="ready">
      <div className="flex gap-[5px] px-3 pb-1 pt-2" data-master-actions="">
        <CoreCommandButton
          op="createMaster"
          label="New master…"
          testId="master-new"
          prefill={newMasterPrefill(pageSize)}
        />
      </div>
      {items.length === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground"
          data-empty-master-pages
        >
          No master pages.
        </div>
      ) : (
        <div data-master-page-list>
          <ListRows
            rows={items.map((m) => ({
              key: m.selfId,
              icon: "panel-master-pages",
              primary: m.label,
              secondary: `${m.pageCount} page${m.pageCount === 1 ? "" : "s"}`,
              trail: (
                <span className="flex gap-[4px]" data-master-row={m.selfId}>
                  <CoreCommandButton
                    op="applyMasterToPage"
                    label="Apply…"
                    testId="master-apply"
                    prefill={{ master: `master:${m.selfId}` }}
                  />
                  <CoreCommandButton
                    op="renameMaster"
                    label="Rename…"
                    testId="master-rename"
                    prefill={{ master: `master:${m.selfId}`, name: m.label }}
                  />
                  <CoreCommandButton
                    op="deleteMaster"
                    label="Delete"
                    testId="master-delete"
                    args={{ master: `master:${m.selfId}` }}
                  />
                </span>
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
}
