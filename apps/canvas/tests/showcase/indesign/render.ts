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

// Ask REAL InDesign to RENDER the annual, page by page.
//
// The sibling `probe.ts` asks InDesign what it READS; this asks what it
// DRAWS. We used to rasterise InDesign's exported PDF with poppler, but
// poppler mis-renders InDesign's knockout transparency groups — the
// effects chapter's bevelled moon and feathered veil come out white — so
// the pixel compare scored our renderer against an artefact. InDesign
// rendering its own document is the honest reference.
//
// Same process discipline as the probe: user interaction OFF (a
// missing-font dialog blocks everything), every document closed before
// and after, and a generous AppleScript timeout — opening the 134-page
// annual took 60 s on the machine this was written on, which tripped
// osascript's default and killed a whole chain.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { INDESIGN_APP } from "./probe";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** What `render.jsx` returns for one page. */
export interface RenderedPage {
  /** 1-based ABSOLUTE page index (not the section-relative name). */
  index: number;
  /** The page's InDesign name — "iv", "17", "A·3" in the annual. */
  name: string | null;
  /** Absolute path of the JPEG InDesign wrote. */
  file: string | null;
  ms: number | null;
  /** The `pageString` that selected it ("+17", or the name on fallback). */
  range: string | null;
  error: string | null;
}

export interface InDesignRenderReport {
  app_version: string | null;
  source: string;
  dpi: number;
  cmyk_profile: string | null;
  rgb_profile: string | null;
  open_seconds: number | null;
  open_error: string | null;
  page_count: number | null;
  pages: RenderedPage[];
  errors: string[];
  /** True when the cache was reused and InDesign never ran. */
  cached: boolean;
}

export interface RenderOptions {
  /** Export resolution. Match the canvas PNGs or the compare is meaningless. */
  dpi: number;
  /** 1-based absolute page indices; empty/omitted renders every page. */
  pages?: number[];
  /** Ignore the cache key and re-render. */
  force?: boolean;
  /** Document CMYK profile, to match the canvas's CMM conversion. */
  cmykProfile?: string;
  /** Seconds allowed for the whole InDesign run. */
  timeoutSec?: number;
}

export const DEFAULT_CMYK_PROFILE = "Coated FOGRA39 (ISO 12647-2:2004)";

/** `page-007.png` — the same stem the canvas side writes under `showcase/pages/`. */
export function pageFileName(index: number, ext: "png" | "jpg"): string {
  return `page-${String(index).padStart(3, "0")}.${ext}`;
}

function cacheKey(idmlPath: string, opts: RenderOptions): string {
  const h = createHash("sha256");
  h.update(readFileSync(idmlPath));
  h.update(`|dpi=${opts.dpi}`);
  h.update(`|pages=${(opts.pages ?? []).join(",")}`);
  h.update(`|profile=${opts.cmykProfile ?? DEFAULT_CMYK_PROFILE}`);
  h.update(readFileSync(join(__dirname, "render.jsx")));
  return h.digest("hex");
}

/** Convert one JPEG to PNG with `sips` (macOS built-in — no new dependency). */
function jpegToPng(jpg: string): string {
  const png = jpg.replace(/\.jpg$/, ".png");
  execFileSync("sips", ["-s", "format", "png", jpg, "--out", png], {
    stdio: "ignore",
  });
  return png;
}

/**
 * Render `idmlPath` page by page into `outDir` as `page-NNN.png`.
 *
 * The IDML is staged inside `outDir` first (InDesign opens by extension,
 * and a `.paged` is a valid IDML package); links resolve through the
 * absolute URIs the export baked in, so staging does not break them.
 */
export function renderInDesign(
  idmlPath: string,
  outDir: string,
  opts: RenderOptions,
): InDesignRenderReport {
  mkdirSync(outDir, { recursive: true });
  const key = cacheKey(idmlPath, opts);
  const keyFile = join(outDir, ".render-cache-key");
  const reportFile = join(outDir, "report.json");
  if (
    !opts.force &&
    existsSync(keyFile) &&
    readFileSync(keyFile, "utf8").trim() === key &&
    existsSync(reportFile)
  ) {
    const cached = JSON.parse(
      readFileSync(reportFile, "utf8"),
    ) as InDesignRenderReport;
    return { ...cached, cached: true };
  }

  // A stale render is worse than no render: drop the old frames so a
  // half-finished run can never be mistaken for a complete one.
  for (const f of existsSync(outDir) ? readdirSync(outDir) : []) {
    if (/^page-\d{3}\.(jpg|png)$/.test(f)) rmSync(join(outDir, f));
  }

  const id = basename(idmlPath).replace(/\.[^.]+$/, "");
  const staged = resolve(outDir, `${id}.idml`);
  copyFileSync(idmlPath, staged);

  const timeoutSec = opts.timeoutSec ?? 3600;
  const q = (s: string): string => JSON.stringify(s);
  const jsx = resolve(outDir, `run-render-${id}.jsx`);
  writeFileSync(
    jsx,
    `var __SRC = ${q(staged)};\n` +
      `var __OUT_DIR = ${q(resolve(outDir))};\n` +
      `var __DPI = ${opts.dpi};\n` +
      `var __PAGES = ${JSON.stringify(opts.pages ?? [])};\n` +
      `var __CMYK_PROFILE = ${q(opts.cmykProfile ?? DEFAULT_CMYK_PROFILE)};\n` +
      readFileSync(join(__dirname, "render.jsx"), "utf8"),
  );

  const applescript = resolve(outDir, `run-render-${id}.applescript`);
  writeFileSync(
    applescript,
    [
      `tell application "${INDESIGN_APP}"`,
      "\tset user interaction level of script preferences to never interact",
      `\twith timeout of ${timeoutSec + 300} seconds`,
      "\t\ttry",
      "\t\t\trepeat while (count of documents) > 0",
      "\t\t\t\tclose document 1 saving no",
      "\t\t\tend repeat",
      `\t\t\tset res to do script (POSIX file ${q(jsx)}) language javascript`,
      "\t\t\treturn res",
      "\t\ton error errMsg number errNum",
      "\t\t\ttry",
      "\t\t\t\trepeat while (count of documents) > 0",
      "\t\t\t\t\tclose document 1 saving no",
      "\t\t\t\tend repeat",
      "\t\t\tend try",
      '\t\t\treturn "@@ASERROR@@ " & errNum & ": " & errMsg',
      "\t\tend try",
      "\tend timeout",
      "end tell",
      "",
    ].join("\n"),
  );

  const raw = execFileSync("osascript", [applescript], {
    encoding: "utf8",
    timeout: timeoutSec * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (raw.startsWith("@@ASERROR@@")) {
    throw new Error(`InDesign refused the render: ${raw.slice(0, 500)}`);
  }
  const [json, rest = ""] = raw.split("\n@@ERRORS@@\n");
  const errors = rest.split("\n").filter((l) => l.trim().length > 0);
  const report = JSON.parse(json) as Omit<
    InDesignRenderReport,
    "errors" | "cached"
  >;

  for (const page of report.pages) {
    if (page.file && existsSync(page.file)) jpegToPng(page.file);
  }

  const full: InDesignRenderReport = { ...report, errors, cached: false };
  writeFileSync(reportFile, `${JSON.stringify(full, null, 2)}\n`);
  writeFileSync(keyFile, `${key}\n`);
  return full;
}
