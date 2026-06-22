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

// SDK Phase 3 — shared catalog registry singleton.
//
// One registry per app, built lazily on first access. All
// declarative panels mount this same instance via
// `CatalogRegistryProvider`. A fresh instance per panel would
// also work (CatalogRegistry is plain data) but the singleton
// keeps the registration cost a one-time event.

import { createCatalogRegistry, type CatalogRegistry } from "@paged-media/catalog";
import { registerBuiltInCatalogEntries } from "@paged-media/shell";

let singleton: CatalogRegistry | null = null;

export function appCatalogRegistry(): CatalogRegistry {
  if (!singleton) {
    singleton = createCatalogRegistry();
    registerBuiltInCatalogEntries(singleton);
  }
  return singleton;
}
