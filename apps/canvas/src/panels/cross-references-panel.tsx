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

// SDK Phase 5 / panel-gallery pass — Cross References panel.
//
// Gallery list shape: source name + mono format secondary. CRUD +
// live update on reflow land with their Operations.

import { ListRows, useCollection } from "@paged-media/shell";
import type { CrossReferenceSummary } from "@paged-media/client";

export function CrossReferencesPanel() {
  const items = useCollection<CrossReferenceSummary>("crossReferences");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-cross-references-panel="loading"
      >
        Loading cross-references…
      </div>
    );
  }
  return (
    <div data-cross-references-panel="ready">
      {items.length === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground"
          data-empty-cross-references
        >
          No cross-references in this document.
        </div>
      ) : (
        <div data-cross-reference-list>
          <ListRows
            rows={items.map((x) => ({
              key: x.selfId,
              icon: "panel-cross-references",
              primary: x.name,
              secondary: x.format ?? undefined,
            }))}
          />
        </div>
      )}
    </div>
  );
}
