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
// WHERE does one write on the finished annual spend its time? (ADR 030 §1)
//
// The scripting bench measured ~14 s per wire write in the browser against
// ~16 ms native, and the working explanation was "the wasm rebuild is ~900×
// slower". This spec measures it instead of inferring it, on three lanes:
//
//   A. raw `client.mutate` — in-page wall time vs. the worker's OWN
//      `cacheStats.rebuild_ms` / `op_apply_ms` (the engine's clock)
//   B. a plain read (`requestSceneTree`) — what a round trip costs alone
//   C. the same write through the showcase driver (`doc.setProperty`)
//
// and, with PROFILE_TRACE=<file>, records a Chrome trace of one lane-A write
// (V8 CPU profiler, worker included) for a per-function breakdown.
//
// Run: PROFILE_TRACE=/tmp/rebuild.trace.json \
//        npx playwright test tests/showcase/rebuild-profile.spec.ts --project=showcase
import { existsSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openCanvas } from "../fidelity/canvas-driver";
import { CORPUS_FONTS, checkpointPath } from "./chapter";
import { ShowcaseDoc } from "./driver";
import { ANNUAL_PAGES, SWATCH } from "./names-annual";

const RUNS = Number(process.env.PROFILE_RUNS ?? 3);

test.describe("rebuild profile", () => {
  test.setTimeout(30 * 60 * 1000);

  test("one write on the finished book, timed three ways @feat:scripting.mutation-parity @level:happy", async ({
    page,
    browser,
  }) => {
    const checkpoint = checkpointPath("312-appendix-b");
    test.skip(!existsSync(checkpoint), `${checkpoint} missing — run the chapter specs first`);

    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.registerFonts(CORPUS_FONTS);
    const tLoad = Date.now();
    const pages = await doc.load(checkpoint);
    const loadMs = Date.now() - tLoad;
    expect(pages).toBe(ANNUAL_PAGES);
    const vermilion = await doc.swatch(SWATCH.vermilion);
    const all = await doc.refreshPages();
    const pageId = all[0].selfId;

    // One scratch frame to write to, minted on the raw lane.
    const frame = await page.evaluate(async (pid) => {
      const c = (window as unknown as { __canvas: { client: { mutate: (m: unknown) => Promise<any> } } })
        .__canvas.client;
      const r = await c.mutate({ op: "insertFrame", args: { pageId: pid, bounds: [40, 40, 80, 100] } });
      return r.payload?.createdId ?? null;
    }, pageId);
    expect(frame, "insertFrame minted an element").not.toBeNull();

    // A. raw writes, in-page clock vs the worker's own clock.
    const rawWrite = async (tint: number) =>
      page.evaluate(
        async ({ id, swatch, tint }) => {
          const c = (window as unknown as { __canvas: { client: { mutate: (m: unknown) => Promise<any> } } })
            .__canvas.client;
          const t0 = performance.now();
          const r = await c.mutate({
            op: "setElementProperty",
            args: { elementId: id, path: "frameFillColor", value: { type: "colorRef", value: swatch } },
          });
          const wall = performance.now() - t0;
          const s = r.payload?.cacheStats ?? {};
          void tint;
          return {
            kind: r.kind as string,
            wallMs: wall,
            rebuildMs: s.rebuild_ms ?? s.rebuildMs ?? null,
            opApplyMs: s.op_apply_ms ?? s.opApplyMs ?? null,
            paragraphs: s.paragraphs ?? null,
            hits: s.hits ?? null,
            misses: s.misses ?? null,
          };
        },
        { id: frame, swatch: vermilion, tint },
      );
    const laneA = [];
    for (let i = 0; i < RUNS; i += 1) laneA.push(await rawWrite(i));

    // B. a plain read.
    const laneB = [];
    for (let i = 0; i < RUNS; i += 1) {
      laneB.push(
        await page.evaluate(async () => {
          const c = (window as unknown as { __canvas: { client: { send: (m: unknown) => Promise<any> } } })
            .__canvas.client;
          const t0 = performance.now();
          await c.send({ kind: "requestSceneTree" });
          return performance.now() - t0;
        }),
      );
    }

    // C. the driver lane (what the chapter specs pay per op).
    const laneC = [];
    for (let i = 0; i < RUNS; i += 1) {
      const t0 = Date.now();
      await doc.setProperty(frame.kind, frame.id, "frameFillColor", { type: "colorRef", value: vermilion });
      laneC.push(Date.now() - t0);
    }

    // Optional: a Chrome trace of ONE raw write (worker CPU samples included).
    const tracePath = process.env.PROFILE_TRACE;
    if (tracePath) {
      await browser.startTracing(page, {
        categories: [
          "devtools.timeline",
          "v8.execute",
          "disabled-by-default-devtools.timeline",
          "disabled-by-default-v8.cpu_profiler",
        ],
      });
      laneA.push({ ...(await rawWrite(99)), traced: true } as never);
      const buf = await browser.stopTracing();
      writeFileSync(tracePath, buf);
    }

    const report = { pages, loadMs, laneA, laneB, laneC };
    console.log(`[rebuild-profile] ${JSON.stringify(report, null, 2)}`);
    for (const a of laneA) expect(a.kind).toBe("mutationApplied");
  });
});
