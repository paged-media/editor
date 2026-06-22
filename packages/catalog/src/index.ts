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

// @paged-media/catalog — declarative-component catalog + binding model.
//
// Per docs/paged/sdk-implementation-plan.md §Phase 3a. The catalog
// is the finite, curated registry that declarative panel
// compositions reference, what an external producer (A2UI etc.)
// would be constrained to, and what a future third-party bundle
// would be auditable against. One object, multiple consumers.
//
// This is the *skeleton* commit: types + registry only. The
// `CompositionRenderer` + primitive leaves + a real Character
// composition land in follow-up commits once the channel surface
// for content-scoped writes is finalised.

export {
  type Binding,
  type BindingDeclaration,
  type CatalogEntry,
  type CatalogEntryKind,
  type CollectionName,
  type CompositionNode,
  type DocumentMetaKey,
  type LeafProps,
  type PropSchema,
  type ReadSpec,
  type SelectionPropertyBinding,
  type WriteSpec,
} from "./types";

export {
  createCatalogRegistry,
  type CatalogRegistry,
} from "./registry";
