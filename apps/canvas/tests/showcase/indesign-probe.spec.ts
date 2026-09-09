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

// THE INDESIGN PROBE — does Adobe keep what the annual's IDML says?
//
// Every other gate in this directory reads the twin through OUR loader,
// and our loader accepts whatever our writer emits. This one opens the
// exported book in real InDesign and compares what InDesign counts with
// what the package XML declares: page items per class, stories,
// sections, guides, hyperlinks, conditions, tables, the tint swatch.
// The rules are the ones the 2026-09-05 campaign measured — every
// difference below was, at some point that day, a real drop:
//   · page items, pages, spreads, masters: EXACT (InDesign has never
//     dropped one);
//   · sections, guides, hyperlinks, conditions: EXACT (all four were 0
//     in InDesign's hands until the spellings were fixed);
//   · tables: EXACTLY the tables in placed stories, and no orphaned
//     story reaches the export (InDesign discards its table);
//   · images: every `<Link>` found AND resolved (the `Links/` folder
//     beside the `.idml`; a missing link is an empty frame);
//   · the tint: present, same base, same value (the `<Color TintValue>`
//     spelling was discarded);
//   · faces: every face the book uses installed and resolved — a
//     substituted face reflows what it touches;
//   · overset: no more stories than the model's own count, which the
//     assembly records beside the export;
//   · paragraph totals and container entries: recorded, not asserted.
//
// Not a CI lane: it needs macOS and InDesign. Without them it SKIPS and
// says so; `REQUIRE_REAL_INDESIGN=1` turns that skip into a failure
// where the probe is meant to run. `INDESIGN_PROBE_IDML=<path>` probes
// another file than the assembled book.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { OUT } from "./chapter";
import { idmlExpectation } from "./indesign/expected";
import { inDesignAvailable, probeInDesign } from "./indesign/probe";

test.describe("InDesign", () => {
  test.setTimeout(45 * 60 * 1000);

  test("keeps what the annual's IDML declares @feat:round-tripping.idml-reserialization @level:happy", async () => {
    const available = inDesignAvailable();
    if (!available && process.env.REQUIRE_REAL_INDESIGN) {
      throw new Error("REQUIRE_REAL_INDESIGN is set and Adobe InDesign 2025 is not installed");
    }
    test.skip(!available, "Adobe InDesign 2025 is not installed here — the probe is skipped, not passed");

    const idmlPath = process.env.INDESIGN_PROBE_IDML ?? join(OUT, "showcase.idml");
    expect(existsSync(idmlPath), `${idmlPath} missing — the assembly spec runs first`).toBe(true);
    const workDir = join(OUT, "indesign");
    mkdirSync(workDir, { recursive: true });

    const expected = idmlExpectation(readFileSync(idmlPath));
    const seen = probeInDesign(idmlPath, workDir);
    writeFileSync(join(workDir, "expected.json"), JSON.stringify(expected, null, 2));
    writeFileSync(join(workDir, "indesign.json"), JSON.stringify(seen, null, 2));

    expect(seen.open_error, "InDesign opened the file").toBeNull();
    expect(seen.errors, "every section of the walk answered").toEqual([]);

    // ── structure: exact ─────────────────────────────────────────────
    expect(seen.pages).toBe(expected.pages);
    expect(seen.spreads).toBe(expected.spreads);
    expect(seen.master_spreads).toBe(expected.master_spreads);
    expect(seen.items, "page items per class, spreads").toEqual(expected.items);
    expect(seen.master_items, "page items per class, masters").toEqual(expected.master_items);
    expect(seen.other_classes, "no page item of a class the probe cannot name").toEqual([]);

    // ── navigation and conditions: exact ─────────────────────────────
    // A document always has one section; a book that declares none
    // shows InDesign's implicit one.
    expect(seen.sections, "sections").toBe(Math.max(expected.sections, 1));
    expect(seen.guides, "guides").toBe(expected.guides);
    expect(seen.hyperlinks, "hyperlinks").toBe(expected.hyperlinks);
    expect(seen.conditions, "conditions").toBe(expected.conditions);

    // ── tables: every one a reader can reach, and no ghost ───────────
    // An orphaned story (no frame references it) must not be exported
    // at all, so InDesign's count IS the placed count.
    expect(seen.tables, "tables").toBe(expected.tables_in_placed_stories);
    expect(expected.tables, "no table in an orphaned story reaches the export").toBe(
      expected.tables_in_placed_stories,
    );

    // ── images: placed, linked, and RESOLVED ─────────────────────────
    // IDML cannot embed pixels; the export writes `<Link>`s with absolute
    // URIs into the `Links/` folder beside the `.idml`, and InDesign must
    // find every one — a missing link is an empty frame in Adobe's hands.
    expect(seen.links?.total, "links InDesign found").toBe(expected.links);
    expect(seen.links?.missing, "links InDesign could not resolve").toBe(0);

    // ── faces: the book's own, installed and resolved ────────────────
    // A substituted face reflows every line it touches; fidelity in
    // InDesign's hands starts with the faces it can actually use.
    const unresolvedFonts = seen.fonts.filter((f) => f.status !== "INSTALLED");
    expect(
      unresolvedFonts.map((f) => `${f.name} (${f.status})`),
      "every face the book uses is installed here and resolved by InDesign",
    ).toEqual([]);

    // ── overset: no more than the model's own ────────────────────────
    // The assembly records the model's overset count beside the export;
    // the book carries deliberate overset exhibits, so InDesign may
    // report those — and nothing beyond them.
    const modelPath = join(workDir, "model.json");
    if (existsSync(modelPath)) {
      const model = JSON.parse(readFileSync(modelPath, "utf8")) as { oversetStories: number };
      expect(seen.overset_stories, "overset stories, against the model's own count").toBeLessThanOrEqual(
        model.oversetStories,
      );
    }

    // ── the tint ─────────────────────────────────────────────────────
    for (const t of expected.tint_swatches) {
      const hit = seen.tint_swatches.find((s) => s.name === t.name);
      expect(hit, `tint "${t.name}" survives as a Tint swatch`).toBeTruthy();
      expect(hit?.base, `tint "${t.name}" keeps its base`).toBe(t.base);
      expect(hit?.tint, `tint "${t.name}" keeps its value`).toBe(t.tint);
    }

    // ── spellings InDesign ignores: none may be present ──────────────
    expect(expected.applied_font_attribute_form, "AppliedFont as an attribute").toBe(0);
    expect(expected.root_paragraph_style_groups, "one root paragraph style group").toBe(1);

    // ── recorded ─────────────────────────────────────────────────────
    const missing = unresolvedFonts.length;
    const orphanTables = expected.tables - expected.tables_in_placed_stories;
    // eslint-disable-next-line no-console
    console.log(
      `[indesign] opened in ${seen.open_seconds}s · stories ${expected.stories}→${seen.stories} · ` +
        `paragraphs ${seen.paragraphs} (floor ${expected.br_total + expected.non_empty_stories}) · ` +
        `tables ${expected.tables}→${seen.tables}${orphanTables ? ` (${orphanTables} in orphaned stories)` : ""} · ` +
        `fonts ${missing}/${seen.fonts.length} not installed · overset ${seen.overset_stories} · ` +
        `foreign entries ${expected.foreign_entries.length}`,
    );
  });
});
