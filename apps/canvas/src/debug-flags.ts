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

// Debug flags — diagnostics a developer opts into per page load, never
// chrome a user sees by default. `?debug=hits` (comma-separate several:
// `?debug=hits,foo`). Read once at module load: a flag is a property of
// the session, not something that toggles under a mounted canvas.

function readDebugFlags(): ReadonlySet<string> {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get(
      "debug",
    );
    return new Set(
      (raw ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

const FLAGS = readDebugFlags();

/** True when the page was opened with `?debug=<name>`. */
export function debugFlag(name: string): boolean {
  return FLAGS.has(name);
}
