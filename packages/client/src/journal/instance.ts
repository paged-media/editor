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


// The process-wide journal buffer (ADR 025).
//
// It lives in `@paged-media/client` rather than in the app because BOTH the
// React shell and the canvas app need to reach the same ring, and this package
// is the only one both may import (eslint zone (b) keeps it React-free, which
// is exactly why the shell is allowed to depend on it).
//
// One buffer, one module, so there is no question of which ring an entry
// landed in. The render worker keeps its OWN buffer — a different realm, drained
// across the boundary rather than shared.

import { JournalBuffer } from "./buffer";

/** The shell-side ring. 2048 entries ≈ 250 KB: long enough to hold a real
 *  editing session, small enough to never think about. */
export const journal = new JournalBuffer({ origin: "shell", capacity: 2048 });
