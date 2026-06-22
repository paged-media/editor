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

// resolveGate — host-side evaluation of a schema visibility /
// enablement gate (the editor-side twin of plugin-sdk's `resolveGate`).
//
// THE B-01 LINE: this is a LOOKUP, not an expression language. A gate
// is `absent | boolean | {bind, negate?}`. `{bind}` reads ONE published
// plugin binding by name and coerces it to a boolean; `negate` inverts
// it (the only transform — a NOT, never `&&` / `==` / comparisons). A
// plugin that needs `strokeType == "dashed"` computes that boolean in
// its OWN realm and publishes the RESULT under a name. The catalog's
// binding ceiling stays intact; dynamic visibility comes from a derived
// bound value, exactly as B-01's resolution direction recorded.

import type { SchemaGate } from "./schema-panel-types";

export function resolveGate(
  gate: SchemaGate | undefined,
  lookup: (name: string) => unknown,
): boolean {
  if (gate === undefined) return true;
  if (typeof gate === "boolean") return gate;
  const raw = Boolean(lookup(gate.bind));
  return gate.negate ? !raw : raw;
}
