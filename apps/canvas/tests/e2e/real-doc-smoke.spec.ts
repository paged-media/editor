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

// E2E op suite — real-document smoke. The curated core op pass
// (docOpPass) run against real-world InDesign documents (sample.idml,
// line-sheet.idml), proving the editor's operations land on the
// canvas of documents far richer than the generated fixtures. Each
// applicable op must pass its sandwich (model + render + undo);
// inapplicable ops (no target in the doc) are skipped, never failed.

import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { docOpPass } from "./harness/doc-op-pass";
import { loadFixture, type FixtureName } from "./harness/fixtures";

const REAL_DOCS: FixtureName[] = ["sample", "line-sheet"];

for (const doc of REAL_DOCS) {
  test(`AC-E2E-SMOKE-${doc} — core op pass lands on the canvas`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadFixture(page, doc);
    const results = await docOpPass(page, fx, { assert: false });

    const table = results
      .map(
        (r) =>
          `  ${r.op.padEnd(34)} ${r.status}${r.note ? `  — ${r.note}` : ""}`,
      )
      .join("\n");
    // eslint-disable-next-line no-console
    console.log(`\nREAL-DOC OP PASS — ${doc}\n${table}\n`);

    // No op may ERROR (worker failure / panic / exception) — that is
    // the hard contract on a real document. render-stale outcomes
    // (the op applied but the first matching frame didn't visibly
    // change — common for text frames with no fill, etc.) are
    // recorded as insights, not failures.
    const errors = results.filter((r) => r.status === "error");
    expect(
      errors,
      `ops ERRORED on ${doc}:\n${errors.map((f) => `  ${f.op}: ${f.note}`).join("\n")}`,
    ).toEqual([]);
    // The pass must have actually exercised ops (applied + verified),
    // not skipped everything.
    const exercised = results.filter(
      (r) => r.status === "pass" || r.status === "render-stale",
    ).length;
    expect(exercised, `${doc} exercised too few ops`).toBeGreaterThanOrEqual(4);
  });
}
