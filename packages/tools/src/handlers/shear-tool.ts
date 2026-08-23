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

// Editor-ops — the Shear tool's gesture handler.
//
// Drives the WORKER gesture `{kind:"shear"}` (protocol v24) about the
// selection centroid, Shift snapping the shear angle to 15° tangents
// engine-side. The implementation lives in `transform-tools.ts`: Shear,
// Rotate and Scale are the SAME begin/stream/commit handler with a
// different `GestureType`, so they share one body. This module stays as
// the tool's named entry point (and its import site in
// `built-in-tools.ts`) — behaviour is unchanged from the inline version.

import type { GestureHandler } from "@paged-media/shell";

import { createTransformGestureHandler } from "./transform-tools";

export function createShearHandler(): GestureHandler {
  return createTransformGestureHandler("shear");
}
