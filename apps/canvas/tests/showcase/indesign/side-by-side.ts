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

// Glue two page renders together so a human can see the difference the
// numbers report. A ratio tells you a page is wrong; only the picture
// tells you WHAT is wrong — that is how the group-layer, tab, oval and
// effect-enumerator bugs were each found in one look.

import { readFileSync, writeFileSync } from "node:fs";

import { PNG } from "pngjs";

/** Write `left | right` with a thin rule between, scaled to a common height. */
export function writeSideBySide(
  leftPng: string,
  rightPng: string,
  outPng: string,
  gutter = 8,
): void {
  const a = PNG.sync.read(readFileSync(leftPng));
  const b = PNG.sync.read(readFileSync(rightPng));
  const h = Math.max(a.height, b.height);
  const w = a.width + gutter + b.width;
  const out = new PNG({ width: w, height: h });
  out.data.fill(0x20);
  const blit = (src: PNG, dx: number): void => {
    for (let y = 0; y < src.height; y += 1) {
      for (let x = 0; x < src.width; x += 1) {
        const si = (y * src.width + x) * 4;
        const di = (y * w + dx + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  };
  blit(a, 0);
  blit(b, a.width + gutter);
  writeFileSync(outPng, PNG.sync.write(out));
}
