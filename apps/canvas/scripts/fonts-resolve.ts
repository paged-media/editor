#!/usr/bin/env node
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

// Bulk-resolve every declared font across every envato pack into
// `corpus/fonts/.cache/`. Run this once before a fidelity sweep so the
// per-pack tests never block on a network round-trip.
//
//   npm run fonts:resolve            # default: cache only
//   npm run fonts:resolve -- --list  # print declared fonts without downloading
//
// `--re-export` (rewriting fonts.jsx + reinvoking InDesign) is planned
// per the plan file but unwired here — it touches a host-side script
// and isn't safe to run unattended. Use the manual export workflow in
// `corpus/envato/export-pdf.sh` for that.

import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = pathResolve(__dirname, "..", "tests", "fidelity");

// Dynamically import the test helpers — they live next to the suite
// so the resolver can share the same family-extraction code.
const { listPacks } = await import(pathResolve(TESTS_DIR, "fixtures.ts"));
const { declaredFonts } = await import(pathResolve(TESTS_DIR, "idml-fonts.ts"));
const { resolveGoogleFontFamily } = await import(
  pathResolve(TESTS_DIR, "google-fonts.ts")
);

interface PackResolution {
  pack: string;
  declared: Array<{ family: string; styles: string[]; resolved: boolean }>;
}

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");

  const packs = listPacks();
  const summary: PackResolution[] = [];

  for (const pack of packs) {
    if (!existsSync(pack.idmlPath)) continue;
    const fonts = declaredFonts(pack.idmlPath);
    const declared: PackResolution["declared"] = [];
    for (const f of fonts) {
      let resolved = false;
      if (!listOnly) {
        try {
          const items = await resolveGoogleFontFamily(f.family);
          resolved = items.length > 0;
        } catch (err) {
          process.stderr.write(
            `[${pack.name}] ${f.family}: download failed (${String(err)})\n`,
          );
        }
      }
      declared.push({ family: f.family, styles: f.styles, resolved });
    }
    summary.push({ pack: pack.name, declared });
    const label = listOnly ? "listing" : "resolving";
    process.stdout.write(
      `[${pack.name}] ${label}: ${declared.length} families` +
        (listOnly
          ? ` (${declared.map((d) => d.family).join(", ")})\n`
          : ` (${declared.filter((d) => d.resolved).length} on Google Fonts)\n`),
    );
  }

  // Final tally helps spot patterns: which fonts every pack declares,
  // which are missing from Google Fonts.
  const tally = new Map<string, { total: number; resolved: number }>();
  for (const p of summary) {
    for (const d of p.declared) {
      const t = tally.get(d.family) ?? { total: 0, resolved: 0 };
      t.total += 1;
      if (d.resolved) t.resolved += 1;
      tally.set(d.family, t);
    }
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1].total - a[1].total);
  process.stdout.write("\nFamily tally (sorted by frequency):\n");
  for (const [family, t] of sorted) {
    process.stdout.write(
      `  ${family.padEnd(40)} ${t.total} packs / ${t.resolved} resolved\n`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(`fatal: ${String(err)}\n`);
  process.exit(1);
});
