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

// SDK Phase 5 / panel-gallery pass — Condition Sets panel.
//
// Gallery list shape over every `<ConditionSet>`: glyph rows with
// the condition count, plus a per-set Apply trail button as an
// honest seam (awaits `Operation::ActivateConditionSet`).

import { CockpitBtn, ListRows, useCollection } from "@paged-media/shell";
import type { ConditionSetSummary } from "@paged-media/client";

export function ConditionSetsPanel() {
  const items = useCollection<ConditionSetSummary>("conditionSets");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-condition-sets-panel="loading"
      >
        Loading condition sets…
      </div>
    );
  }
  return (
    <div data-condition-sets-panel="ready">
      {items.length === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground"
          data-empty-condition-sets
        >
          No condition sets in this document.
        </div>
      ) : (
        <div data-condition-set-list>
          <ListRows
            rows={items.map((set) => ({
              key: set.selfId,
              icon: "panel-condition-sets",
              primary: set.name,
              secondary: `${set.conditions.length} condition${
                set.conditions.length === 1 ? "" : "s"
              }`,
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
