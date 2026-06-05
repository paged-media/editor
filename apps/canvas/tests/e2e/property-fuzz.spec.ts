// E2E op suite — property fuzz. A seeded LCG (fixed seed →
// reproducible) drives many random in-range values through
// setElementProperty for each numeric writable path, asserting after
// each that the worker accepted it (mutationApplied, never
// mutationFailed) and the value round-trips (or clamps — recorded).
// Then the whole batch is undone and the canvas must return to the
// load-time pixels byte-for-byte. Exercises the value-coercion +
// undo-log paths far past what the fixed-value suites reach.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, snapshotPagePng } from "../fidelity/canvas-driver";
import {
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";

const SEED = 0x5eed_1234;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 0xffffffff;
  };
}

async function snap(
  page: Page,
  pageId: string,
  widthPt: number,
): Promise<Buffer> {
  const widthPx = 440;
  const dpi = (widthPx * 72) / widthPt;
  return Buffer.from(await snapshotPagePng(page, pageId, widthPx, dpi));
}

async function setProp(
  page: Page,
  ref: ElementRef,
  path: string,
  value: number,
): Promise<{ ok: boolean; readBack: number | null }> {
  return page.evaluate(
    async ({ ref, path, value }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<{ kind: string }>;
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value: unknown }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const reply = await c.client.mutate({
        op: "setElementProperty",
        args: { elementId: ref, path, value: { type: "length", value } },
      });
      const props = await c.client.elementProperties(ref);
      const v = props?.entries.find((e) => e.path === path)?.value as
        | { value: number }
        | undefined;
      return {
        ok: reply.kind === "mutationApplied",
        readBack: v?.value ?? null,
      };
    },
    { ref, path, value },
  );
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas.client.undo();
  });
}

const PATHS: Array<{ path: string; min: number; max: number }> = [
  { path: "frameOpacity", min: 0, max: 100 },
  { path: "frameStrokeWeight", min: 0, max: 24 },
  { path: "frameFillTint", min: 0, max: 100 },
];

const ITERATIONS = 6;

test("AC-E2E-FUZZ-1 — random in-range property writes never error and undo to byte-identical baseline", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openCanvas(page);
  const fx: LoadedFixture = await loadFixture(page, "geometry");
  const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
  const rect = target.ref;
  const pageInfo = fx.pages[target.pageIndex];

  const baseline = await snap(page, pageInfo.pageId, pageInfo.widthPt);
  const rand = lcg(SEED);
  let applied = 0;

  for (const { path, min, max } of PATHS) {
    let pushed = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const v = Math.round(min + rand() * (max - min));
      const { ok, readBack } = await setProp(page, rect, path, v);
      expect(ok, `${path}=${v} was rejected by the worker`).toBe(true);
      // Value round-trips exactly, or clamps to the legal range.
      if (readBack !== null) {
        expect(
          readBack >= min - 0.5 && readBack <= max + 0.5,
          `${path}=${v} read back out of range as ${readBack}`,
        ).toBe(true);
      }
      pushed += 1;
      applied += 1;
    }
    // Undo this path's writes so the next path starts clean.
    for (let i = 0; i < pushed; i++) await undo(page);
  }

  expect(applied, "fuzz applied no writes").toBeGreaterThan(0);
  const after = await snap(page, pageInfo.pageId, pageInfo.widthPt);
  expect(
    after.equals(baseline),
    "undoing every fuzzed write did not restore the load-time canvas byte-for-byte",
  ).toBe(true);
});
