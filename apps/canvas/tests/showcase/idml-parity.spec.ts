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

// IDML PARITY — does the interchange twin RENDER what the container
// renders?
//
// The assembly already proves the twin is STRUCTURALLY sound: valid
// UCF, a designmap, every page present, no page blank, and no export
// loss outside the `.paged`-native set. None of that is a claim about
// PIXELS. A frame can survive the round trip at the wrong size, a story
// can reflow because an attribute did not carry, a swatch can resolve
// to a different ink — and every one of those passes a presence gate
// while the page looks different.
//
// This spec closes that: render all 134 pages from `showcase.paged`,
// render all 134 from `showcase.idml`, and compare them pixel for
// pixel. What differs is reported per page with its changed-pixel
// ratio, and the worst offenders are written out side by side so the
// difference can be LOOKED at rather than argued about.
//
// Legitimate difference has exactly one source today — the three
// opacity masks IDML cannot express, which the export names in its own
// loss ledger. Those pages are allowed a budget; every other page must
// match within the anti-aliasing floor.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { diffPngPixels } from "../e2e/harness/pixel-diff";
import { CORPUS_FONTS, OUT } from "./chapter";
import { ShowcaseDoc } from "./driver";
import { ANNUAL_PAGES } from "./names-annual";

/** Render width for the comparison. Wide enough that a half-point
 *  shift moves pixels, cheap enough to do 268 times. */
const WIDTH = 816;

/**
 * How many pages may render differently. ZERO — measured, not hoped.
 *
 * The three opacity-mask pages were expected to differ: IDML has no
 * opacity-mask element and the export names the loss. They do not, and
 * the reason matters — the mask does not PAINT on the WebGPU path
 * (it is a CPU/PDF-only construct), so both sides render the unmasked
 * artwork and agree. That makes them useless as an allowance and a
 * lie as an excuse, so the budget is zero and any divergence at all
 * fails. If a mask ever starts painting here, this gate goes red and
 * raising it becomes a deliberate, argued decision.
 *
 * The limit of this oracle, stated plainly: it proves that everything
 * the GPU renderer PAINTS survives the round trip. It cannot speak for
 * a construct the renderer never draws.
 */
const MASK_PAGES_ALLOWED = 0;

/** Anti-aliasing floor: two renders of the same page are not always
 *  bit-identical, so a page counts as matching under this ratio. */
const NOISE = 0.0005;

interface PageDiff {
  page: number;
  ratio: number;
}

test.describe("idml parity", () => {
  test.setTimeout(30 * 60 * 1000);

  test("the interchange twin renders what the container renders @feat:companion-formats.idml-round-trip @level:happy", async ({
    page,
  }) => {
    const pagedPath = join(OUT, "showcase.paged");
    const idmlPath = join(OUT, "showcase.idml");
    for (const p of [pagedPath, idmlPath]) {
      expect(existsSync(p), `${p} missing — the assembly spec runs first`).toBe(
        true,
      );
    }
    const outDir = join(OUT, "parity");
    mkdirSync(outDir, { recursive: true });

    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    // Fonts BEFORE the load, both times: RegisterFont seeds shaping at
    // load, and a document shaped against substitutes would differ from
    // itself for a reason that has nothing to do with IDML.
    await doc.registerFonts(CORPUS_FONTS);

    const container = await doc.load(pagedPath);
    expect(container, "the container opens with every page").toBe(ANNUAL_PAGES);
    const fromPaged: Buffer[] = [];
    for (let i = 0; i < ANNUAL_PAGES; i += 1) {
      fromPaged.push(await doc.renderPage(i, WIDTH));
    }

    await doc.registerFonts(CORPUS_FONTS);
    const twin = await doc.load(idmlPath);
    expect(twin, "the twin opens with every page").toBe(ANNUAL_PAGES);

    const diffs: PageDiff[] = [];
    const fromIdml: Buffer[] = [];
    let worstUnder = 0;
    for (let i = 0; i < ANNUAL_PAGES; i += 1) {
      const after = await doc.renderPage(i, WIDTH);
      fromIdml.push(after);
      const stats = diffPngPixels(fromPaged[i], after);
      const ratio = stats.changed / (stats.width * stats.height);
      if (ratio > NOISE) diffs.push({ page: i + 1, ratio });
      else worstUnder = Math.max(worstUnder, ratio);
    }

    // ── the oracle's own control ─────────────────────────────────────
    // "Nothing differs" is the same answer a BLIND comparison gives: a
    // second load that silently no-ops, a render call that returns the
    // cached first document, a diff that always says zero. Before the
    // green means anything, the oracle has to prove it can see. Diff
    // pages that are KNOWN to be different — page k of one document
    // against page k+1 of the other — and demand a difference.
    for (const k of [4, 57, 96]) {
      const mismatched = diffPngPixels(fromPaged[k], fromIdml[k + 1]);
      const ratio = mismatched.changed / (mismatched.width * mismatched.height);
      expect(
        ratio,
        `the parity oracle is blind: page ${k + 1} and page ${k + 2} came ` +
          `back identical, so a real difference could not have been seen`,
      ).toBeGreaterThan(NOISE);
    }
    // eslint-disable-next-line no-console
    console.log(
      `[parity] oracle control passed; worst matching page differs by ` +
        `${(worstUnder * 100).toFixed(4)}% (floor ${(NOISE * 100).toFixed(2)}%)`,
    );

    diffs.sort((a, b) => b.ratio - a.ratio);
    for (const d of diffs) {
      // eslint-disable-next-line no-console
      console.log(
        `[parity] page ${String(d.page).padStart(3, "0")} differs — ` +
          `${(d.ratio * 100).toFixed(2)}% of pixels`,
      );
    }
    // Write the worst offenders out as before/after pairs so the
    // difference is inspectable, not just counted.
    for (const d of diffs.slice(0, 12)) {
      const stem = join(outDir, `page-${String(d.page).padStart(3, "0")}`);
      writeFileSync(`${stem}-paged.png`, fromPaged[d.page - 1]);
      writeFileSync(`${stem}-idml.png`, await doc.renderPage(d.page - 1, WIDTH));
    }
    // eslint-disable-next-line no-console
    console.log(
      `[parity] ${diffs.length} of ${ANNUAL_PAGES} pages differ beyond the ` +
        `anti-aliasing floor; the budget is ${MASK_PAGES_ALLOWED}`,
    );

    expect(
      diffs.length,
      `pages whose IDML twin renders differently: ${diffs
        .map((d) => `${d.page} (${(d.ratio * 100).toFixed(2)}%)`)
        .join(", ")}`,
    ).toBeLessThanOrEqual(MASK_PAGES_ALLOWED);
  });
});
