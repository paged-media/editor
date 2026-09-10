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

// Per-page ceilings for the InDesign render compare, and the capture
// mode that writes them. Same shape as the envato fidelity suite's
// `tests/fidelity/thresholds.ts`: measurements plus headroom, a
// rationale per page that survives a re-capture, and NEVER a loosening
// to make a red go away — a page that got worse is a regression to fix.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const RENDER_THRESHOLDS_PATH = join(
  __dirname,
  "..",
  "indesign-render-thresholds.json",
);

export interface PageThreshold {
  max_changed_ratio: number;
  max_mean_de?: number;
  min_ssim?: number;
  rationale?: string;
}

export interface RenderThresholds {
  /** Export/compare resolution both sides must agree on. */
  dpi: number;
  /** Per-channel slack before a pixel counts as changed (0–255). */
  tolerance: number;
  default: PageThreshold;
  /** Keyed by 1-based absolute page index, as a string. */
  pages: Record<string, PageThreshold>;
}

export const FALLBACK_THRESHOLDS: RenderThresholds = {
  dpi: 163.2,
  tolerance: 32,
  default: { max_changed_ratio: 0.06, max_mean_de: 6, min_ssim: 0.8 },
  pages: {},
};

export function loadRenderThresholds(): RenderThresholds {
  if (!existsSync(RENDER_THRESHOLDS_PATH)) return FALLBACK_THRESHOLDS;
  return JSON.parse(
    readFileSync(RENDER_THRESHOLDS_PATH, "utf8"),
  ) as RenderThresholds;
}

export function thresholdFor(
  t: RenderThresholds,
  page: number,
): PageThreshold {
  return { ...t.default, ...(t.pages[String(page)] ?? {}) };
}

export interface PageMeasurement {
  page: number;
  changedRatio: number;
  meanDe: number | null;
  ssim: number | null;
}

/**
 * Write thresholds from a measured run: ratios and ΔE get 25 % headroom,
 * SSIM loses 2 %, and any rationale already recorded for a page is kept
 * (it explains WHY that page is allowed to be worse, and a re-capture
 * must not erase the reason).
 */
export function writeRenderThresholds(
  measured: PageMeasurement[],
  opts: { dpi: number; tolerance: number },
): RenderThresholds {
  const prev = loadRenderThresholds();
  const pages: Record<string, PageThreshold> = {};
  for (const m of measured) {
    const key = String(m.page);
    const entry: PageThreshold = {
      max_changed_ratio: Number((m.changedRatio * 1.25 + 0.002).toFixed(4)),
    };
    if (m.meanDe !== null) {
      entry.max_mean_de = Number((m.meanDe * 1.25 + 0.1).toFixed(3));
    }
    if (m.ssim !== null) {
      entry.min_ssim = Number((m.ssim * 0.98).toFixed(4));
    }
    const rationale = prev.pages[key]?.rationale;
    if (rationale) entry.rationale = rationale;
    pages[key] = entry;
  }
  const next: RenderThresholds = {
    dpi: opts.dpi,
    tolerance: opts.tolerance,
    default: prev.default,
    pages,
  };
  writeFileSync(RENDER_THRESHOLDS_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
