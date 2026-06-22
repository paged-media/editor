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

// E2E op suite — lightweight PNG pixel diff (pngjs, no external
// binaries). The fidelity suite's ΔE2000/SSIM Rust differ is for
// judging RENDER QUALITY against references; this helper answers a
// different question — DID the render change, WHERE, and is the
// change contained to the affected region (collateral-damage
// detection). Exact-byte comparisons ride Buffer.equals directly.

import { PNG } from "pngjs";

/** Pixel-space rectangle (inclusive-exclusive). */
export interface PxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DiffStats {
  width: number;
  height: number;
  /** Total pixels whose RGBA differs. */
  changed: number;
  /** Changed pixels inside the region (= `changed` when no region). */
  changedInside: number;
  /** Changed pixels outside the region. */
  changedOutside: number;
  /** Bounding box of ALL changed pixels, or null when unchanged. */
  bbox: PxRect | null;
}

/**
 * Compare two PNGs pixel-by-pixel. `region` (optional, px space,
 * pre-inflated by the caller) splits the changed count into
 * inside/outside for containment assertions. Throws when dimensions
 * differ — the harness always snapshots the same page at the same
 * dpi, so a size change is itself a bug signal.
 */
export function diffPngPixels(
  a: Uint8Array,
  b: Uint8Array,
  region?: PxRect | null,
): DiffStats {
  const pa = PNG.sync.read(Buffer.from(a));
  const pb = PNG.sync.read(Buffer.from(b));
  if (pa.width !== pb.width || pa.height !== pb.height) {
    throw new Error(
      `snapshot dimensions differ: ${pa.width}×${pa.height} vs ${pb.width}×${pb.height}`,
    );
  }
  const w = pa.width;
  const h = pa.height;
  const da = pa.data;
  const db = pb.data;
  let changed = 0;
  let inside = 0;
  let outside = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (
        da[i] !== db[i] ||
        da[i + 1] !== db[i + 1] ||
        da[i + 2] !== db[i + 2] ||
        da[i + 3] !== db[i + 3]
      ) {
        changed++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (region) {
          if (
            x >= region.x0 &&
            x < region.x1 &&
            y >= region.y0 &&
            y < region.y1
          ) {
            inside++;
          } else {
            outside++;
          }
        }
      }
    }
  }
  return {
    width: w,
    height: h,
    changed,
    changedInside: region ? inside : changed,
    changedOutside: region ? outside : 0,
    bbox:
      changed === 0 ? null : { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 },
  };
}

/** Inflate a px rect by `slack`, clamped to the image. */
export function inflate(
  r: PxRect,
  slack: number,
  width: number,
  height: number,
): PxRect {
  return {
    x0: Math.max(0, Math.floor(r.x0 - slack)),
    y0: Math.max(0, Math.floor(r.y0 - slack)),
    x1: Math.min(width, Math.ceil(r.x1 + slack)),
    y1: Math.min(height, Math.ceil(r.y1 + slack)),
  };
}

/** Page-space pt rect → px rect for a snapshot of `widthPx`. */
export function ptRectToPx(
  rect: { top: number; left: number; bottom: number; right: number },
  pageWidthPt: number,
  widthPx: number,
): PxRect {
  const scale = widthPx / pageWidthPt;
  return {
    x0: rect.left * scale,
    y0: rect.top * scale,
    x1: rect.right * scale,
    y1: rect.bottom * scale,
  };
}
