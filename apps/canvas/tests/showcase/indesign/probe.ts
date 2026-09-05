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

// Ask REAL InDesign what it reads from an IDML.
//
// Our own round-trip proves nothing about Adobe: the reader accepts
// whatever the writer emits, so a private spelling (a `<Tint>` written
// as a `<Color TintValue>`, a hyperlink block placed before the stories,
// a `<Condition>` inside an invented wrapper) round-trips here and
// vanishes there. The only oracle for "does InDesign keep it" is
// InDesign. This drives it through AppleScript with user interaction
// OFF (a missing-font dialog would block everything), runs one
// ExtendScript that walks the open document, and returns its counts.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const INDESIGN_APP = "Adobe InDesign 2025";

/** Is the application installed here? (macOS only; the probe is a
 *  local act, never a CI lane.) */
export function inDesignAvailable(): boolean {
  return process.platform === "darwin" && existsSync(`/Applications/${INDESIGN_APP}`);
}

export interface ItemCounts {
  textFrame: number;
  rectangle: number;
  oval: number;
  polygon: number;
  graphicLine: number;
  group: number;
  image: number;
  other: number;
}

/** What InDesign reports — the shape `probe.jsx` returns. */
export interface InDesignReport {
  id: string;
  source: string;
  opened_at: string | null;
  open_seconds: number | null;
  open_error: string | null;
  pages: number | null;
  spreads: number | null;
  master_spreads: number | null;
  stories: number | null;
  paragraphs: number | null;
  items: ItemCounts | null;
  other_classes: string[];
  master_items: ItemCounts | null;
  swatches: number | null;
  swatch_names: Array<string | null>;
  tint_swatches: Array<{ name: string | null; base: string | null; tint: number | null }>;
  paragraph_styles: number | null;
  character_styles: number | null;
  object_styles: number | null;
  table_styles: number | null;
  cell_styles: number | null;
  layers: number | null;
  layer_names: string[];
  sections: number | null;
  conditions: number | null;
  condition_names: string[];
  hyperlinks: number | null;
  guides: number | null;
  tables: number | null;
  fonts: Array<{ name: string | null; status: string | null }>;
  style_fonts: string[];
  text_fonts_sample: string[];
  overset_stories: number | null;
  links: { total: number; missing: number } | null;
  /** Sections of the walk that threw, one line each. */
  errors: string[];
}

/**
 * Open `idmlPath` in InDesign and read it. The file is COPIED under
 * `workDir` with an `.idml` extension first (a `.paged` is a valid IDML
 * package, and InDesign opens by extension); every document is closed
 * before and after, whatever happens.
 */
export function probeInDesign(
  idmlPath: string,
  workDir: string,
  timeoutSec = 1500,
): InDesignReport {
  mkdirSync(workDir, { recursive: true });
  const id = basename(idmlPath).replace(/\.[^.]+$/, "");
  const staged = resolve(workDir, `${id}.idml`);
  copyFileSync(idmlPath, staged);
  const jsx = resolve(workDir, `run-${id}.jsx`);
  const q = (s: string): string => JSON.stringify(s);
  writeFileSync(
    jsx,
    `var __SRC = ${q(staged)};\nvar __ID = ${q(id)};\nvar __ORIG = ${q(resolve(idmlPath))};\n` +
      readFileSync(join(__dirname, "probe.jsx"), "utf8"),
  );
  const applescript = resolve(workDir, `run-${id}.applescript`);
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
    throw new Error(`InDesign refused the probe: ${raw.slice(0, 500)}`);
  }
  const [json, rest = ""] = raw.split("\n@@ERRORS@@\n");
  const errors = rest
    .split("\n@@DIAG@@\n")[0]
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const report = JSON.parse(json) as Omit<InDesignReport, "errors">;
  return { ...report, errors };
}
