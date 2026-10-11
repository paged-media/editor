/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This file is part of paged (https://paged.media) and is additionally
 * available under the Paged Media Enterprise License (PMEL). Full
 * copyright and license information is available in LICENSE.md which is
 * distributed with this source code.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    MPL-2.0 OR Paged Media Enterprise License (PMEL)
 */

// The engine catalog, shipped with this package so a consumer does not have
// to install @paged-media/introspect-wasm (11.5 MB of wasm) to read 140 KB of
// JSON. It is plugin-api's vendored copy, which CI holds in lockstep with
// the engine version the wire types were synced from (publish.yml). A
// separate entry point: the editor loads it on the first AI request, not at
// boot.

import catalog from "./catalog.json";

import type { ApiCatalog } from "./catalog";

const ENGINE_CATALOG = catalog as unknown as ApiCatalog;

export default ENGINE_CATALOG;
