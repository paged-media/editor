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

// Public surface for the sample bundle. Apps + tests import this
// to construct the worker URL via `import.meta.url`, which gives
// Vite the static reference it needs to bundle the worker as an
// entry point (`new URL("./sample-bundle.worker.ts", import.meta.url)`).

import type { BundleManifest } from "./manifest";

export function sampleBundleManifest(): BundleManifest {
  return {
    id: "paged.sample",
    name: "Paged Sample Bundle",
    version: "0.0.0",
    kernel: new URL("./sample-bundle.worker.ts", import.meta.url),
    contributes: {
      commands: ["paged.sample.hello"],
      keybindings: ["cmd+shift+h"],
      menus: ["Tools/Sample Bundle Hello"],
    },
  };
}
