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

// E2E — paged.draw's Image Trace runs in a `host.workers` worker.
//
// The bundle opens a TRACE SESSION that runs the kernel in a worker when
// the host can spawn one and on the calling thread — the editor's UI
// thread — when it cannot. "Cannot" includes a host that injects a
// worker backend but registers no resolver for THIS bundle's module:
// the door is declared-only, so the spawn is refused by name, the
// bundle logs why and traces where it stands. That was the editor until
// `main.tsx` registered `media.paged.draw` → "workers/trace.js", and it
// is a failure nothing else would notice: the trace still produces the
// same paths, only the page freezes while it does.
//
// So the assertion here is about WHERE the trace ran, three ways, none
// of them the result alone:
//
//   1. the BROWSER reports a new dedicated worker whose script is the
//      bundle's `trace-worker` entry (Playwright's `worker` event — the
//      realm exists, whatever the bundle says about it);
//   2. the bundle's own log names the lane ("in a worker"), and never
//      says "no worker" (the fallback's line, which carries the reason);
//   3. the result landed — the worker answered, with real regions.
//
// A fourth, the point of the whole exercise: the page's own thread kept
// ticking while the trace ran. The raster is NOISE on purpose — the
// kernel's cost is its colour clustering, so noise is the slow input
// (trace-engine.ts carries the measured table) and a 512 px square of it
// keeps the kernel busy for most of a second. On the calling thread
// that is one synchronous wasm call and the page's timers cannot fire
// inside it; in a worker they never notice.

import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { openCanvas } from "../fidelity/canvas-driver";

const IMAGE_TRACE = "media.paged.draw.command.imageTrace";

interface ElementRef {
  kind: string;
  id: string;
}

/** The raster's edge, in pixels. Measured in Chromium, both lanes, on
 *  this raster (the second by breaking the resolver on purpose):
 *
 *    in the worker         command 1306 ms · 316 ticks · longest gap   21 ms
 *    on the calling thread command 1595 ms ·  15 ticks · longest gap 1506 ms
 */
const RASTER_PX = 512;

/** The most regions the trace may insert. The clustering — the cost —
 *  runs over the whole raster regardless; the cap only keeps the
 *  document write to three paths instead of several thousand, so the
 *  test measures the trace and not the editor inserting its result. */
const MAX_REGIONS = 3;

/** Deterministic RGB noise (xorshift32, fixed seed), as PNG bytes. */
function noisePng(size: number): number[] {
  const png = new PNG({ width: size, height: size });
  let s = 0x2545f491;
  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s & 255;
  };
  for (let i = 0; i < size * size; i += 1) {
    png.data[i * 4] = next();
    png.data[i * 4 + 1] = next();
    png.data[i * 4 + 2] = next();
    png.data[i * 4 + 3] = 255;
  }
  return [...PNG.sync.write(png)];
}

async function newBlankDocument(page: Page): Promise<void> {
  await openCanvas(page);
  await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (id: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas;
    await c.registries.commands.invoke("paged.file.new");
  });
  await page.waitForFunction(
    () =>
      (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas
        ?.ready === true,
    null,
    { timeout: 15_000 },
  );
}

/** The scene tree with its nesting, as one string. */
async function structure(page: Page): Promise<string> {
  return page.evaluate(async () => {
    interface N {
      id?: { kind: string; id: string } | null;
      children?: N[];
    }
    const c = (
      globalThis as unknown as {
        __canvas: { client: { sceneTree: () => Promise<N[]> } };
      }
    ).__canvas;
    const walk = (n: N): string => {
      const kids = (n.children ?? []).map(walk).filter(Boolean).join(",");
      if (!n.id) return kids;
      return `${n.id.kind}:${n.id.id}${kids ? `[${kids}]` : ""}`;
    };
    return (await c.client.sceneTree()).map(walk).filter(Boolean).join(",");
  });
}

test.describe("E2E paged.draw — Image Trace off the UI thread", () => {
  test.beforeEach(async ({ page }) => {
    await newBlankDocument(page);
    // Bundles load in a mount effect; the trace command is the sentinel.
    await expect
      .poll(
        () =>
          page.evaluate(
            (id) =>
              (
                globalThis as unknown as {
                  __canvas: {
                    registries: {
                      commands: { list: () => Array<{ id: string }> };
                    };
                  };
                }
              ).__canvas.registries.commands
                .list()
                .some((c) => c.id === id),
            IMAGE_TRACE,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test("AC-DRAW-TRACE-1 — the trace spawns the bundle's worker, the worker answers, and the page keeps running @feat:plugin-draw.image-trace @feat:plugin-platform.worker-pool @level:happy", async ({
    page,
  }) => {
    // Every worker the page starts from here on, by script URL.
    const spawned: string[] = [];
    page.on("worker", (w) => spawned.push(w.url()));
    // The bundle's own account of where it traced.
    const said: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[media.paged.draw]")) said.push(text);
    });

    // An image frame holding real pixels. `replaceImageBytes` (decoded
    // on apply) rather than `placeImage` with a link: the trace reads
    // the placed-image BYTES through the assets door, and a link the
    // engine never resolved has none to serve.
    const frame = await page.evaluate(async (bytes) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            handle: { pageIds: string[] };
            client: {
              mutate: (m: unknown) => Promise<{
                kind: string;
                payload: { createdId?: { kind: string; id: string } | null };
              }>;
              setElementSelection: (
                ids: unknown[],
                mode: string,
              ) => Promise<unknown[]>;
              elementGeometry: (
                ids: unknown[],
              ) => Promise<Array<{ hasImage?: boolean }>>;
            };
            setElementSelection?: (ids: unknown[]) => void;
            setElementGeometry?: (items: unknown[]) => void;
          };
        }
      ).__canvas;
      const made = await c.client.mutate({
        op: "insertFrame",
        args: { pageId: c.handle.pageIds[0], bounds: [100, 100, 356, 356] },
      });
      const ref = made.payload.createdId!;
      const placed = await c.client.mutate({
        op: "replaceImageBytes",
        args: { elementId: ref.id, bytes },
      });
      if (placed.kind !== "mutationApplied") {
        throw new Error(`replaceImageBytes: ${placed.kind}`);
      }
      const geometry = await c.client.elementGeometry([ref]);
      if (!geometry[0]?.hasImage) throw new Error("the frame holds no image");
      // Select it the way the commands read it: worker, then mirror.
      const applied = await c.client.setElementSelection([ref], "replace");
      c.setElementSelection?.(applied);
      c.setElementGeometry?.(geometry);
      return ref as ElementRef;
    }, noisePng(RASTER_PX));
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __canvas: { elementSelection: unknown[] };
              }
            ).__canvas.elementSelection.length,
        ),
      )
      .toBe(1);
    expect(await structure(page)).toBe(`rectangle:${frame.id}`);

    // Run the command with a 4 ms ticker on the PAGE's thread beside it.
    // A trace on the calling thread is one synchronous wasm call: the
    // ticker cannot fire while it runs, so its longest gap is the trace.
    const ran = await page.evaluate(
      async ({ commandId, maxRegions }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              registries: {
                commands: {
                  invoke: (id: string, payload?: unknown) => Promise<unknown>;
                };
              };
            };
          }
        ).__canvas;
        let ticks = 0;
        let longestGapMs = 0;
        let last = performance.now();
        const ticker = setInterval(() => {
          const now = performance.now();
          longestGapMs = Math.max(longestGapMs, now - last);
          last = now;
          ticks += 1;
        }, 4);
        const started = performance.now();
        await c.registries.commands.invoke(commandId, { maxRegions });
        const tookMs = performance.now() - started;
        clearInterval(ticker);
        return { ticks, longestGapMs, tookMs };
      },
      { commandId: IMAGE_TRACE, maxRegions: MAX_REGIONS },
    );

    // 3. THE WORKER ANSWERED: the capped three regions, in the group the
    //    command wraps them in, beside the untouched source frame.
    //    Polled — the insert is two batches.
    await expect
      .poll(() => structure(page), { timeout: 20_000 })
      .toMatch(
        new RegExp(
          `^rectangle:${frame.id},group:[^\\[]+\\[polygon:[^,]+,polygon:[^,]+,polygon:[^\\]]+\\]$`,
        ),
      );

    // 1. THE BROWSER SAW THE WORKER, and its script is the bundle's
    //    trace-worker entry — not the image plugin's decode worker, not
    //    the engine's.
    const traceWorkers = spawned.filter((url) => url.includes("trace-worker"));
    expect(
      traceWorkers,
      `the trace worker should have been spawned (saw: ${spawned.join(", ") || "none"})`,
    ).toHaveLength(1);
    expect(traceWorkers[0]).toContain("@paged-media/draw");

    // 2. THE BUNDLE SAYS SO, and does not say the opposite. "no worker"
    //    is the fallback's line and carries the host's refusal verbatim.
    expect(
      said.filter((line) => line.includes("no worker")),
      "the bundle fell back to the calling thread",
    ).toEqual([]);
    expect(
      said.some((line) => /traced \d+×\d+ px in a worker/.test(line)),
      `the bundle should report the worker lane (said: ${said.join(" | ")})`,
    ).toBe(true);

    // 4. THE PAGE KEPT RUNNING. The command was long enough to matter,
    //    and the page's own timer never waited a quarter of a second
    //    inside it. Blocked, its longest gap IS the kernel call — most
    //    of `tookMs` — so the two bounds cannot both hold on the calling
    //    thread (`RASTER_PX` carries both lanes' measurements).
    expect(
      ran.tookMs,
      "the trace should be long enough for blocking to show",
    ).toBeGreaterThan(300);
    expect(
      ran.longestGapMs,
      `the page thread stalled for ${Math.round(ran.longestGapMs)} ms of a ` +
        `${Math.round(ran.tookMs)} ms trace`,
    ).toBeLessThan(250);
    expect(ran.ticks).toBeGreaterThan(ran.tookMs / 40);
  });
});
