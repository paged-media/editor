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


// The journal subpath (`@paged-media/client/journal`).
//
// The package barrel pulls in the SAB primitives, which is more than a caller
// that only wants to record an event needs — and more than some runtimes can
// even parse (node's strip-only TypeScript mode rejects the parameter property
// in `sab/camera.ts`, which is what makes the barrel unusable from a plain
// node test). This subpath is the journal alone, mirroring the existing
// `./sab/*` subpath convention.

export * from "./entry";
export * from "./buffer";
export * from "./codes";
export * from "./uncaptured";
export * from "./export";
export { journal } from "./instance";
