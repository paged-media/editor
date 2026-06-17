// E2E op suite — performance budgets. Measures document load, op
// latency (mutate → reply), and snapshot latency, logs them, and
// asserts against deliberately GENEROUS ceilings — enough to catch a
// catastrophic regression (a 10× slowdown, an accidental O(n²)) while
// staying immune to per-machine CI jitter. Tighten a ceiling only
// after measuring + leaving headroom; never loosen to hide a
// regression (the fidelity-threshold rule applies here too).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, snapshotPagePng } from "../fidelity/canvas-driver";
import { loadFixture, type ElementRef } from "./harness/fixtures";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

// Generous ceilings (ms). A healthy run is far under these — they
// catch a catastrophic regression (10× slowdown, accidental O(n²)),
// not per-machine jitter. Op + snapshot latency are measured on the
// geometry fixture (20 simple pages — the suite's working doc) where
// the budget is meaningful; a single mutation triggers a whole-doc
// relayout, so the cost scales with page count (NOTE: on a 48-page
// real doc the op median is ~2.3 s — a rebuild-granularity signal
// worth an incremental-relayout look, logged below, not asserted).
const BUDGET = {
  loadMs: 20_000,
  opMedianMs: 2_000,
  opP95Ms: 4_000,
  snapshotMs: 4_000,
};

async function opLatencies(page: Page, ref: ElementRef): Promise<number[]> {
  return page.evaluate(
    async ({ ref }: { ref: ElementRef }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<unknown>;
              undo: () => Promise<unknown>;
            };
          };
        }
      ).__canvas;
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const v = 20 + (i % 60);
        const start = performance.now();
        await c.client.mutate({
          op: "setElementProperty",
          args: {
            elementId: ref,
            path: "frameOpacity",
            value: { type: "length", value: v },
          },
        });
        times.push(performance.now() - start);
      }
      for (let i = 0; i < 20; i++) await c.client.undo();
      return times;
    },
    { ref },
  );
}

test("AC-E2E-PERF-1 — load / op / snapshot latencies stay within budget @feat:the-renderer.pipeline @level:happy", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openCanvas(page);

  // Load latency on a real 48-page document.
  const t0 = await page.evaluate(() => performance.now());
  const sample = await loadFixture(page, "sample");
  const loadMs = (await page.evaluate(() => performance.now())) - t0;
  // Informational: op latency on the big doc (rebuild granularity).
  const sampleOp = sample.frames[0]
    ? Math.round(median(await opLatencies(page, sample.frames[0].ref)))
    : -1;

  // Op + snapshot latency on the working fixture (budget-meaningful).
  const fx = await loadFixture(page, "geometry");
  const target = fx.frames.find((f) => f.ref.kind === "rectangle")!.ref;
  const pageInfo =
    fx.pages[fx.frames.find((f) => f.ref.kind === "rectangle")!.pageIndex];
  const opTimes = await opLatencies(page, target);

  const snapTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const s = Date.now();
    await snapshotPagePng(
      page,
      pageInfo.pageId,
      420,
      (420 * 72) / pageInfo.widthPt,
    );
    snapTimes.push(Date.now() - s);
  }

  const report = {
    loadMs: Math.round(loadMs),
    sampleOpMedianMs: sampleOp,
    opMedianMs: Math.round(median(opTimes)),
    opP95Ms: Math.round(p95(opTimes)),
    snapshotMedianMs: Math.round(median(snapTimes)),
  };
  // eslint-disable-next-line no-console
  console.log(`\nPERF\n${JSON.stringify(report, null, 2)}\n`);

  expect(report.loadMs, "document load over budget").toBeLessThan(
    BUDGET.loadMs,
  );
  expect(report.opMedianMs, "op median over budget").toBeLessThan(
    BUDGET.opMedianMs,
  );
  expect(report.opP95Ms, "op p95 over budget").toBeLessThan(BUDGET.opP95Ms);
  expect(report.snapshotMedianMs, "snapshot over budget").toBeLessThan(
    BUDGET.snapshotMs,
  );
});
