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

// §21 advanced prepress — wire types for the `inkCoverage` collection.
//
// These are GENERATED types re-exported from the wasm package, never
// hand-written; the house rule that wire shapes must not be typed by
// hand still holds.
//
// They live here rather than in `packages/client/src/protocol.ts` (the
// normal home for wire re-exports) for a purely mechanical reason:
// that file currently carries an uncommittable local `PROTOCOL_VERSION`
// override pointing at the locally built wasm, so it cannot be staged
// without dragging the override into the commit. Fold these two names
// into protocol.ts's re-export block the moment that override is
// retired, and delete this file.
export type {
  InkCoverageSummary,
  PlateCoverageSummary,
} from "@paged-media/canvas-wasm";
