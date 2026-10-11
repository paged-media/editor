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
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// Types for module-index.mjs (read by vite.config.ts).
import type { ModuleManifest } from "../src/plugin-modules";

export const APP: string;
export const MODULE_HOST: string;
export function buildModuleManifest(opts?: {
  app?: string;
  host?: string | null;
  dev?: boolean;
}): ModuleManifest;
