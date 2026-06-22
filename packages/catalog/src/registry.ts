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

// SDK Phase 3 — catalog registry.
//
// Maps catalog ids to `CatalogEntry`. Finite + curated by design
// (§sdk.md §6.1): new entries land in code review, never emitted
// inline by documents or agents. The registry is the single
// auditable definition of "what UI is allowed to exist."

import type { CatalogEntry } from "./types";

export interface CatalogRegistry {
  /** Add an entry. Duplicate ids throw — like the panel registry,
   *  collisions surface as configuration bugs at startup. */
  register(entry: CatalogEntry): void;
  /** Look up an entry by id. Returns undefined for unknown ids;
   *  the composition renderer surfaces this as a visible "unknown
   *  catalog entry" placeholder rather than throwing. */
  get(id: string): CatalogEntry | undefined;
  /** List every registered entry — used by the catalog audit
   *  surface (which leaves declare which writes) and by future
   *  bundle-loader machinery. */
  list(): CatalogEntry[];
}

export function createCatalogRegistry(): CatalogRegistry {
  const byId = new Map<string, CatalogEntry>();
  return {
    register(entry) {
      if (byId.has(entry.id)) {
        throw new Error(
          `CatalogRegistry: catalog id "${entry.id}" already registered`,
        );
      }
      byId.set(entry.id, entry);
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return Array.from(byId.values());
    },
  };
}
