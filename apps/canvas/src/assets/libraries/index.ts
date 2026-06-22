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

// Concept 2 — bundled open swatch libraries.
//
// The files are the UNMODIFIED originals published by freieFarbe
// e.V. under CC BY-ND 4.0 (attribution required, no derivatives):
// shipping the original bytes and parsing at load is USE, not
// derivative creation — never re-bake the data into another format
// (see NOTICE at the repo root). Proprietary libraries
// (Pantone/HKS/RAL) stay out by design; the device-independent
// CIELAB atlas is the deliberate open alternative.
//
// The flagship HLC atlas ships eagerly (?url — a hashed asset, the
// bytes load only when the user imports it); the 376-library Open
// Colour Systems Collection is glob-lazy: each entry resolves its
// asset URL on demand.

import hlcAtlasUrl from "./HLC-Colour-Atlas_EPV_Swatches_v2-3.ase?url";

export interface BundledLibrary {
  id: string;
  title: string;
  attribution: string;
  /** Resolve the asset URL (lazy for the OCSC glob). */
  url: () => Promise<string>;
}

const HLC_ATTRIBUTION =
  "CIELAB HLC Colour Atlas — freieFarbe e.V. / Holger Everding, CC BY-ND 4.0 (freiefarbe.de)";
const OCSC_ATTRIBUTION =
  "Open Colour Systems Collection (OCSC) 2.0 — freieFarbe e.V., CC BY-ND 4.0 (freiefarbe.de)";

// Each OCSC .ase resolves to a hashed asset URL on demand.
const ocscModules = import.meta.glob<string>("./ocsc/*.ase", {
  query: "?url",
  import: "default",
});

export const BUNDLED_LIBRARIES: BundledLibrary[] = [
  {
    id: "hlc-colour-atlas",
    title: "HLC Colour Atlas (2040, CIELAB)",
    attribution: HLC_ATTRIBUTION,
    url: () => Promise.resolve(hlcAtlasUrl),
  },
  ...Object.entries(ocscModules)
    .map(([path, load]) => {
      const file = path.split("/").pop() ?? path;
      const title = file.replace(/\.ase$/i, "");
      return {
        id: `ocsc-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title,
        attribution: OCSC_ATTRIBUTION,
        url: load,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title)),
];
