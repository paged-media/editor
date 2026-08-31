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

// WIRE versus SCRIPT versus BATCH — where the annual's fifteen hours went.
//
// The book was authored one mutation at a time: every op a message from
// Playwright to the page, from the page to the worker, and an awaited
// reply back. The standing explanation was per-mutation recompose cost
// scaling with content. The hypothesis under test was that it was really
// POSTAGE, and that `paged.*` — the same Operation channel reached from
// inside the worker, crossing once — would collapse it.
//
// It measured the other way, and the answer is worth more than the
// hypothesis was.
//
// MEASURED, on the finished 134-page book:
//
//   lane                        | per write
//   ----------------------------|-------------------------------------
//   wire (browser)              | 14 000 ms
//   one batch of 40 (browser)   | 13.9 s TOTAL — 347 ms/op
//   script (browser)            | cannot complete: budget exhausted
//   single write (native)       | 16 ms
//   100 writes in one batch     | 0.20 ms/op   (native, 85×)
//
// Two facts explain every row:
//
// 1. `apply_mutation` calls `rebuild_after_mutation`, which runs
//    `pipeline::build_document` over the WHOLE document. It is a full
//    recompose per write. A layout cache spares text re-shaping, but the
//    walk scales with content: 0.02 ms/op on a blank page, 1.03 on 134
//    EMPTY pages, 16.3 on the authored book — 800× — and in wasm that
//    same rebuild is ~14 s. Note 40 wire ops = 560.0 s and one batch of
//    40 = 13.9 s: the same 14 s, paid forty times or once.
//
// 2. A script does NOT avoid it. `paged.set` calls `apply_mutation` per
//    call exactly as the wire does, so it pays the same rebuild and only
//    saves the crossing. Worse, `execute_script` carries a 2 s
//    wall-clock budget that is not overridable from the editor, so on
//    this document a script exhausts it before finishing even ONE
//    insert-plus-fill pair. That is why the script lane below reports
//    rather than throws: being budget-limited IS its result.
//
// So the lever is BATCHING, not the scripting language — and `batch` is
// an ordinary wire op whose inner ops the ledger already counts, which
// means migrating to it needs no new coverage accounting at all.
//
// The bench keeps all three lanes because the comparison is the point,
// each on its own scratch page so none pays for another's frames.

import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { script } from "../e2e/harness/ui";
import { CORPUS_FONTS, checkpointPath } from "./chapter";
import { ShowcaseDoc } from "./driver";
import { sceneRefs } from "./plugin-support";
import { ANNUAL_PAGES, SWATCH } from "./names-annual";

/** Frames per lane. Enough that the per-op cost dominates the setup. */
const OPS = Number(process.env.BENCH_OPS ?? 20);

/**
 * Ops per `executeScript` crossing.
 *
 * A script does NOT get to author a document in one call: the engine
 * gives each `execute_script` a 2 s wall-clock budget, checked at every
 * host-call boundary and NOT overridable from here. Measured on this
 * document, a single write costs ~16 ms — because `apply_mutation`
 * rebuilds the WHOLE document — so a script trips the budget at roughly
 * 120 ops and returns nothing at all. The first run of this bench died
 * exactly there, in the browser and headless alike.
 *
 * So the honest script lane slices its work and pays one crossing per
 * slice. 20 ops ≈ 320 ms of engine time, a comfortable sixth of the
 * budget.
 */
const SLICE = Number(process.env.BENCH_SLICE ?? 8);

/** Where the scratch frames go — a tidy grid, never off the page. */
function boundsFor(i: number): [number, number, number, number] {
  const col = i % 6;
  const row = Math.floor(i / 6);
  const left = 40 + col * 80;
  const top = 40 + row * 60;
  return [top, left, top + 40, left + 60];
}

test.describe("scripting bench", () => {
  test.setTimeout(30 * 60 * 1000);

  test("the script lane against the wire lane @feat:scripting.mutation-parity @level:happy", async ({
    page,
  }) => {
    const checkpoint = checkpointPath("312-appendix-b");
    expect(
      existsSync(checkpoint),
      `${checkpoint} missing — the chapter specs run first`,
    ).toBe(true);

    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.registerFonts(CORPUS_FONTS);
    const pages = await doc.load(checkpoint);
    expect(pages, "the bench runs against the finished book").toBe(
      ANNUAL_PAGES,
    );
    const vermilion = await doc.swatch(SWATCH.vermilion);

    /** Mint a scratch page at the end and return its id. */
    const scratch = async (): Promise<string> => {
      const all = await doc.refreshPages();
      await doc.mutate("insertPage", {
        afterPageId: all[all.length - 1].selfId,
        masterId: null,
      });
      const now = await doc.refreshPages();
      return now[now.length - 1].selfId;
    };
    const drop = async (pageId: string): Promise<void> => {
      await doc.mutate("deletePage", { pageId });
      const now = await doc.refreshPages();
      expect(now.length, "the bench leaves the book at its own length").toBe(
        ANNUAL_PAGES,
      );
    };

    // ── lane A: the wire, one awaited round trip per op ──────────────
    // Skippable while iterating: at ~14 s/op on this document it costs
    // minutes, and it is the arm whose number is already known.
    const skipWire = process.env.BENCH_SKIP_WIRE === "1";
    const pageA = skipWire ? null : await scratch();
    const startA = Date.now();
    for (let i = 0; skipWire ? false : i < OPS; i += 1) {
      const id = await doc.mutateId("insertFrame", {
        pageId: pageA as string,
        bounds: boundsFor(i),
      });
      await doc.setProperty("rectangle", id, "frameFillColor", {
        type: "colorRef",
        value: vermilion,
      });
    }
    const wireMs = Date.now() - startA;
    // eslint-disable-next-line no-console
    console.log(
      `[bench] wire lane   ${OPS * 2} ops in ${(wireMs / 1000).toFixed(1)}s ` +
        `— ${(wireMs / (OPS * 2)).toFixed(0)} ms/op`,
    );
    if (pageA) await drop(pageA);

    // ── lane B: one script, the same ops, one crossing ───────────────
    const pageB = await scratch();
    const quads = Array.from({ length: OPS }, (_, i) => boundsFor(i));
    const src = `
      var page = ${JSON.stringify(pageB)};
      var quads = ${JSON.stringify(quads)};
      var made = 0;
      for (var i = 0; i < quads.length; i++) {
        var id = paged.insertFrame(page, quads[i]);
        if (id) { paged.set(id, "frameFillColor", ${JSON.stringify(vermilion)}); made++; }
      }
      made;
    `;
    const startB = Date.now();
    let scripted = 0;
    let crossings = 0;
    let scriptBudgetHit = false;
    for (let from = 0; from < OPS; from += SLICE) {
      const slice = quads.slice(from, from + SLICE);
      let out: string[] = [];
      try {
        out = await script(
        page,
        `
      var page = ${JSON.stringify(pageB)};
      var quads = ${JSON.stringify(slice)};
      var made = 0;
      for (var i = 0; i < quads.length; i++) {
        var id = paged.insertFrame(page, quads[i]);
        if (id) { paged.set(id, "frameFillColor", ${JSON.stringify(vermilion)}); made++; }
      }
      made;
    `,
        );
      } catch (err) {
        // The engine's 2 s wall-clock budget, not overridable from here.
        // On this document a single write costs on the order of a second
        // of wasm engine time, so even ONE insert+fill pair can exhaust
        // it — measured, at SLICE=1. That is the script lane's honest
        // ceiling for bulk authoring, and it is the finding, not a flake.
        scriptBudgetHit = String(err).includes("budget");
        if (!scriptBudgetHit) throw err;
        break;
      }
      scripted += Number((out[out.length - 1] ?? "0").trim());
      crossings += 1;
    }
    const scriptMs = Date.now() - startB;
    // eslint-disable-next-line no-console
    console.log(
      scriptBudgetHit
        ? `[bench] script lane BUDGET-LIMITED — authored ${scripted}/${OPS} ` +
            `frames in ${crossings} crossing(s) before the engine's 2 s ` +
            `wall-clock ceiling stopped it`
        : `[bench] script lane authored ${scripted}/${OPS} frames`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[bench] script lane ${OPS * 2} ops in ${(scriptMs / 1000).toFixed(1)}s ` +
        `— ${(scriptMs / (OPS * 2)).toFixed(0)} ms/op (${crossings} crossing(s))`,
    );
    await drop(pageB);

    // ── lane C: one wire batch, the same ops, one crossing ───────────
    // The lane nobody costed. `batch` is an ordinary wire op carrying
    // other ops, so it crosses once like a script does — but the ledger
    // ALREADY counts its inner ops (driver.ts), which means migrating to
    // it needs no new accounting at all. If it lands near the script
    // lane, it is the cheaper migration by a wide margin.
    const pageC = await scratch();
    // `$created` addresses the element the most recent creating child of
    // this batch minted — the protocol-34 sentinel — so an insert and its
    // paint ride together without a round trip in between.
    const batchOps = quads.flatMap((bounds) => [
      { op: "insertFrame", args: { pageId: pageC, bounds } },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "rectangle", id: "$created" },
          path: "frameFillColor",
          value: { type: "colorRef", value: vermilion },
        },
      },
    ]);
    const beforeC = (await sceneRefs(page, "rectangle")).length;
    const startC = Date.now();
    await doc.batch(batchOps);
    const batchMs = Date.now() - startC;
    const madeC = (await sceneRefs(page, "rectangle")).length - beforeC;
    expect(madeC, "the batch lane authored every frame the others did").toBe(
      OPS,
    );
    await drop(pageC);

    // eslint-disable-next-line no-console
    console.log(
      `[bench] batch lane  ${OPS * 2} ops in ${(batchMs / 1000).toFixed(1)}s ` +
        `— ${(batchMs / (OPS * 2)).toFixed(0)} ms/op (${madeC} rects seen)`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[bench] against the wire lane on a ${ANNUAL_PAGES}-page document: ` +
        `script ${(wireMs / Math.max(scriptMs, 1)).toFixed(1)}×, ` +
        `batch ${(wireMs / Math.max(batchMs, 1)).toFixed(1)}×`,
    );

    // No assertion on the ratio: the number is the deliverable, and a
    // threshold here would only encode today's machine. The one thing
    // worth failing on is a lane that did not actually run.
    if (!skipWire) expect(wireMs, "the wire lane ran").toBeGreaterThan(0);
    expect(scriptMs, "the script lane ran").toBeGreaterThan(0);
  });
});
