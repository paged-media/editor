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

// THE INDESIGN RENDER COMPARE — does the annual LOOK like InDesign's?
//
// `indesign-probe.spec.ts` asks InDesign what it READS from the exported
// IDML; this asks what it DRAWS, and holds our own page renders against
// it pixel for pixel.
//
// Why not compare against InDesign's exported PDF, as the campaign did
// for two weeks: poppler rasterises InDesign's knockout transparency
// groups wrongly — the effects chapter's bevelled moon and feathered
// veil come out WHITE — so every number that chapter produced was
// measured against an artefact, and two "regressions" chased there were
// poppler's. InDesign rendering its own document has no such gap.
//
// The two sides must agree on resolution: the canvas pages the assembly
// writes are 1224 px on a 540 pt trim, so 163.2 dpi, and InDesign is
// asked for exactly that. They will never agree to the byte — different
// rasterisers, and InDesign exports JPEG — so `tolerance` (per channel)
// decides what counts as a changed pixel, and the changed RATIO is the
// gate. ΔE and SSIM ride along as the secondary read.
//
// Not a CI lane: needs macOS, InDesign, and the fonts installed (a
// substituted face reflows text and swamps every metric). Without them
// it SKIPS and says so; `REQUIRE_REAL_INDESIGN=1` turns that into a
// failure where the compare is meant to run.
//
// Modes (`SHOWCASE_RENDER_MODE`): `gate` (default) asserts every page
// against `indesign-render-thresholds.json`; `capture` rewrites that
// file from this run; `advisory` only reports.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

import { diffPngPixels } from "../e2e/harness/pixel-diff";
import { diffPng } from "../fidelity/diff";
import { OUT } from "./chapter";
import { inDesignAvailable } from "./indesign/probe";
import {
  DEFAULT_CMYK_PROFILE,
  pageFileName,
  renderInDesign,
} from "./indesign/render";
import {
  loadRenderThresholds,
  thresholdFor,
  writeRenderThresholds,
  type PageMeasurement,
} from "./indesign/render-thresholds";
import { writeSideBySide } from "./indesign/side-by-side";
import { ANNUAL_PAGES, TRIM_W_PT } from "./names-annual";

type Mode = "gate" | "capture" | "advisory";

interface PageResult extends PageMeasurement {
  canvas: string;
  indesign: string;
  heat: string | null;
  p99De: number | null;
  ceiling: number;
  passes: boolean;
}

function parsePages(spec: string | undefined): number[] {
  if (!spec) return [];
  return spec
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= ANNUAL_PAGES);
}

test.describe("InDesign render", () => {
  test.setTimeout(120 * 60 * 1000);

  test("draws the annual the way InDesign draws it @feat:round-tripping.idml-reserialization @level:happy", async () => {
    const available = inDesignAvailable();
    if (!available && process.env.REQUIRE_REAL_INDESIGN) {
      throw new Error(
        "REQUIRE_REAL_INDESIGN is set and Adobe InDesign 2025 is not installed",
      );
    }
    test.skip(
      !available,
      "Adobe InDesign 2025 is not installed here — the render compare is skipped, not passed",
    );

    const idmlPath =
      process.env.INDESIGN_RENDER_IDML ?? join(OUT, "showcase.idml");
    expect(
      existsSync(idmlPath),
      `${idmlPath} missing — the assembly spec runs first`,
    ).toBe(true);

    // A substituted face reflows every line it touches, so the compare
    // would measure the substitution, not the renderer. The probe writes
    // what InDesign resolved; trust it when it is there.
    const probeJson = join(OUT, "indesign", "indesign.json");
    if (existsSync(probeJson)) {
      const seen = JSON.parse(readFileSync(probeJson, "utf8")) as {
        fonts?: Array<{ name: string | null; status: string | null }>;
      };
      const missing = (seen.fonts ?? []).filter(
        (f) => f.status !== null && f.status !== "INSTALLED",
      );
      test.skip(
        missing.length > 0,
        `InDesign resolved ${missing.length} face(s) to a substitute — install them before comparing renders`,
      );
    }

    const thresholds = loadRenderThresholds();
    const mode = (process.env.SHOWCASE_RENDER_MODE ?? "gate") as Mode;
    const tolerance = Number.parseInt(
      process.env.SHOWCASE_RENDER_TOLERANCE ?? String(thresholds.tolerance),
      10,
    );

    // Both sides at one resolution. The canvas PNGs already exist at
    // 1224 px / 540 pt = 163.2 dpi; read the width rather than trusting
    // a constant, so a change to the assembly cannot silently desync.
    const canvasDir = join(OUT, "pages");
    const firstCanvas = join(canvasDir, pageFileName(1, "png"));
    expect(
      existsSync(firstCanvas),
      `${firstCanvas} missing — the assembly writes one PNG per page`,
    ).toBe(true);
    const canvasWidthPx = PNG.sync.read(readFileSync(firstCanvas)).width;
    const dpi = process.env.SHOWCASE_RENDER_DPI
      ? Number.parseFloat(process.env.SHOWCASE_RENDER_DPI)
      : Number(((canvasWidthPx * 72) / TRIM_W_PT).toFixed(4));

    const manifestOnly = process.env.SHOWCASE_RENDER_MANIFEST_ONLY === "1";
    const requested = parsePages(process.env.SHOWCASE_RENDER_PAGES);
    const pages =
      requested.length > 0
        ? requested
        : manifestOnly
          ? Object.keys(thresholds.pages)
              .map((k) => Number.parseInt(k, 10))
              .sort((a, b) => a - b)
          : Array.from({ length: ANNUAL_PAGES }, (_, i) => i + 1);
    expect(pages.length, "at least one page to compare").toBeGreaterThan(0);

    const workDir = join(OUT, "indesign", "render");
    mkdirSync(join(workDir, "worst"), { recursive: true });

    const report = renderInDesign(idmlPath, workDir, {
      dpi,
      pages: pages.length === ANNUAL_PAGES ? [] : pages,
      force: process.env.SHOWCASE_RENDER_FORCE === "1",
      cmykProfile: process.env.SHOWCASE_CMYK_PROFILE ?? DEFAULT_CMYK_PROFILE,
    });
    console.log(
      `[render] InDesign ${report.app_version ?? "?"} · ${report.cached ? "cached" : "rendered"} ` +
        `${report.pages.length} page(s) at ${dpi} dpi · profile ${report.cmyk_profile ?? "?"} ` +
        `· opened in ${report.open_seconds ?? "?"}s`,
    );
    expect(report.open_error, "InDesign opened the file").toBeNull();
    expect(report.errors, "every page exported").toEqual([]);

    const results: PageResult[] = [];
    for (const page of pages) {
      const canvas = join(canvasDir, pageFileName(page, "png"));
      const indesign = join(workDir, pageFileName(page, "png"));
      if (!existsSync(canvas) || !existsSync(indesign)) {
        throw new Error(
          `page ${page}: missing ${existsSync(canvas) ? indesign : canvas}`,
        );
      }
      const a = PNG.sync.read(readFileSync(indesign));
      const b = PNG.sync.read(readFileSync(canvas));
      // Two rasterisers rounding the same trim can disagree by a pixel;
      // more than that means a bleed or spread leaked into the export.
      expect(
        Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2,
        `page ${page}: InDesign ${a.width}×${a.height} vs canvas ${b.width}×${b.height}`,
      ).toBe(true);

      const heat = join(workDir, `heat-${String(page).padStart(3, "0")}.png`);
      const metrics = diffPng(indesign, canvas, heat);
      const stats =
        a.width === b.width && a.height === b.height
          ? diffPngPixels(
              readFileSync(indesign),
              readFileSync(canvas),
              null,
              tolerance,
            )
          : null;
      const changedRatio = stats
        ? stats.changed / (stats.width * stats.height)
        : 1;
      const ceiling = thresholdFor(thresholds, page).max_changed_ratio;
      results.push({
        page,
        changedRatio,
        meanDe: metrics?.meanDe ?? null,
        ssim: metrics?.ssim ?? null,
        p99De: metrics?.p99De ?? null,
        canvas,
        indesign,
        heat: existsSync(heat) ? heat : null,
        ceiling,
        passes: changedRatio <= ceiling,
      });
    }

    const sorted = [...results].sort((x, y) => y.changedRatio - x.changedRatio);
    for (const r of sorted.slice(0, 8)) {
      const out = join(
        workDir,
        "worst",
        `page-${String(r.page).padStart(3, "0")}-canvas-vs-indesign.png`,
      );
      writeSideBySide(r.canvas, r.indesign, out);
    }
    writeFileSync(
      join(workDir, "compare.json"),
      `${JSON.stringify({ dpi, tolerance, mode, results }, null, 2)}\n`,
    );

    const ratios = results.map((r) => r.changedRatio).sort((x, y) => x - y);
    const median = ratios[Math.floor(ratios.length / 2)] ?? 0;
    console.log(
      `[render] ${results.length} page(s) · changed median ${(median * 100).toFixed(2)}% ` +
        `max ${(ratios[ratios.length - 1]! * 100).toFixed(2)}% · worst ` +
        sorted
          .slice(0, 6)
          .map((r) => `p${r.page} ${(r.changedRatio * 100).toFixed(2)}%`)
          .join(", "),
    );
    if (sorted[0]) {
      await test.info().attach(`worst page ${sorted[0].page}`, {
        path: join(
          workDir,
          "worst",
          `page-${String(sorted[0].page).padStart(3, "0")}-canvas-vs-indesign.png`,
        ),
        contentType: "image/png",
      });
    }

    if (mode === "capture") {
      writeRenderThresholds(results, { dpi, tolerance });
      console.log(
        `[render] captured thresholds for ${results.length} page(s) — review the diff before committing`,
      );
      return;
    }
    if (mode === "advisory") return;

    const failed = results.filter((r) => !r.passes);
    expect(
      failed.map(
        (r) =>
          `p${r.page} ${(r.changedRatio * 100).toFixed(2)}% > ${(r.ceiling * 100).toFixed(2)}%`,
      ),
      "every page within its measured ceiling (fix the renderer; do not raise the ceiling)",
    ).toEqual([]);
  });
});
