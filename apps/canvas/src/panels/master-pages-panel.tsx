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
// `AppliedMaster`. The per-master Apply trail button is an honest
// seam until `Operation::ApplyMasterToPage` ships.

import { CockpitBtn, ListRows, useCollection } from "@paged-media/shell";
import type { MasterPageSummary } from "@paged-media/client";

export function MasterPagesPanel() {
  const items = useCollection<MasterPageSummary>("masterPages");
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
                <CockpitBtn sm tone="soft" disabled>
                  Apply
                </CockpitBtn>
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
}
