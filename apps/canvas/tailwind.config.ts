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

// Canvas-side Tailwind config. Inherits the shell's design tokens
// + theme variables, then adds the canvas's own JSX paths so its
// inline styles can migrate to Tailwind classes incrementally.
//
// Tailwind only scans paths listed in `content`, so we must enumerate
// both the canvas-side source and every workspace package whose JSX
// participates in the rendered tree.

import shellConfig from "@paged-media/shell/tailwind.config";
import type { Config } from "tailwindcss";

const config: Config = {
  ...shellConfig,
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/shell/src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
