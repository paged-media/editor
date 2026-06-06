// E2E gesture suite — shared channel drivers for the specs derived
// from the gesture & interaction test plan
// (thoughts/docs/paged/tests/gestures.md). Wraps the worker gesture
// channel (begin/update/commit/cancel), page-PNG byte snapshots, and
// a worker-notification recorder that — unlike op-sandwich's — also
// captures `gestureCancelled` / `gestureFailed`, because the cancel
// specs assert the ABSENCE of commits, not just their presence.

import type { Page } from "@playwright/test";

import { snapshotPagePng } from "../../fidelity/canvas-driver";
import type { ElementRef } from "./fixtures";

export interface GestureMods {
  shift: boolean;
  alt: boolean;
  disableSnap?: boolean;
}

export type GestureSpec =
  | { kind: "translate" }
  | { kind: "resize"; handle: string }
  | { kind: "rotate" }
  | { kind: "scale" }
  | { kind: "shear" }
  | { kind: "translateContent" };

export interface GestureAnchor {
  pageId: string;
  pointInPage: [number, number];
}

export interface GestureStep {
  delta: [number, number];
  mods: GestureMods;
}

interface ClientSurface {
  beginGesture: (
    nodes: unknown[],
    gesture: unknown,
    anchor?: unknown,
  ) => Promise<number>;
  updateGesture: (
    h: number,
    d: [number, number],
    m: unknown,
  ) => Promise<{ pageIds: string[]; snapLines: unknown[] }>;
  commitGesture: (h: number) => Promise<{ appliedSeq: number; pageIds: string[] }>;
  cancelGesture: (h: number) => Promise<string[]>;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
  send: (msg: unknown) => Promise<unknown>;
  subscribe: (fn: (msg: unknown) => void) => () => void;
}

interface CanvasGlobal {
  __canvas: { client: ClientSurface };
  __gestureLog?: Array<{ kind: string; error?: string }>;
  __gestureUnsub?: () => void;
}

export async function beginGesture(
  page: Page,
  refs: ElementRef[],
  spec: GestureSpec,
  anchor: GestureAnchor | null = null,
): Promise<number> {
  return page.evaluate(
    async ({ refs, spec, anchor }) => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      return c.client.beginGesture(refs, spec, anchor);
    },
    { refs, spec, anchor },
  );
}

export interface UpdateResult {
  pageIds: string[];
  snapLines: Array<{ axis: "x" | "y"; position: number; pageId: string }>;
}

export async function updateGesture(
  page: Page,
  handle: number,
  delta: [number, number],
  mods: GestureMods,
): Promise<UpdateResult> {
  return page.evaluate(
    async ({ handle, delta, mods }) => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      return (await c.client.updateGesture(handle, delta, mods)) as UpdateResult;
    },
    { handle, delta, mods },
  );
}

export async function commitGesture(page: Page, handle: number): Promise<void> {
  await page.evaluate(async (h) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    await c.client.commitGesture(h);
  }, handle);
}

export async function cancelGesture(page: Page, handle: number): Promise<void> {
  await page.evaluate(async (h) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    await c.client.cancelGesture(h);
  }, handle);
}

/** begin → update×N → commit (or cancel) in one evaluate round-trip. */
export async function runGesture(
  page: Page,
  refs: ElementRef[],
  spec: GestureSpec,
  steps: GestureStep[],
  opts: { anchor?: GestureAnchor | null; commit?: boolean } = {},
): Promise<void> {
  await page.evaluate(
    async ({ refs, spec, steps, anchor, commit }) => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      const h = await c.client.beginGesture(refs, spec, anchor ?? null);
      for (const s of steps) await c.client.updateGesture(h, s.delta, s.mods);
      if (commit) await c.client.commitGesture(h);
      else await c.client.cancelGesture(h);
    },
    {
      refs,
      spec,
      steps,
      anchor: opts.anchor ?? null,
      commit: opts.commit ?? true,
    },
  );
}

export async function undo(page: Page, steps = 1): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(async () => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      await c.client.undo();
    });
  }
}

export async function redo(page: Page, steps = 1): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(async () => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      await c.client.redo();
    });
  }
}

/** PNG bytes of one page at a deterministic width (op-sandwich's
 *  dpi-from-width trick so the raster is byte-stable). */
export async function pagePng(
  page: Page,
  pageId: string,
  pageWidthPt: number,
  widthPx = 420,
): Promise<Buffer> {
  const dpi = (widthPx * 72) / pageWidthPt;
  return Buffer.from(await snapshotPagePng(page, pageId, widthPx, dpi));
}

/** MODEL-space bounds `[top, left, bottom, right]` straight off the
 *  geometry channel (the space gesture deltas mutate). */
export async function bounds(
  page: Page,
  ref: ElementRef,
): Promise<[number, number, number, number]> {
  return page.evaluate(async (id) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const r = (await c.client.send({
      kind: "requestElementGeometry",
      payload: { ids: [id] },
    })) as {
      payload: { items: Array<{ bounds: [number, number, number, number] }> };
    };
    if (r.payload.items.length === 0) throw new Error("no geometry");
    return r.payload.items[0].bounds;
  }, ref);
}

/** Item transform `[a, b, c, d, tx, ty]` (null = identity not set). */
export async function itemTransform(
  page: Page,
  ref: ElementRef,
): Promise<[number, number, number, number, number, number] | null> {
  return page.evaluate(async (id) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const r = (await c.client.send({
      kind: "requestElementGeometry",
      payload: { ids: [id] },
    })) as { payload: { items: Array<{ itemTransform: number[] | null }> } };
    const t = r.payload.items[0]?.itemTransform;
    if (!t) return null;
    return [t[0], t[1], t[2], t[3], t[4], t[5]] as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
  }, ref);
}

// ── gesture-event recorder ────────────────────────────────────────
// Counts EVERY gesture-relevant worker envelope. The atomicity and
// cancel specs hinge on exact counts: a cancel must produce one
// `gestureCancelled` and ZERO `gestureCommitted`/`mutationApplied`.

const RECORDED = [
  "gestureBegun",
  "gestureCommitted",
  "gestureCancelled",
  "gestureFailed",
  "mutationApplied",
  "undoApplied",
  "redoApplied",
] as const;

export async function installGestureRecorder(page: Page): Promise<void> {
  await page.evaluate((kinds) => {
    const g = globalThis as unknown as CanvasGlobal;
    if (g.__gestureUnsub) return;
    g.__gestureLog = [];
    g.__gestureUnsub = g.__canvas.client.subscribe((msg) => {
      const m = msg as { kind: string; payload?: { error?: { kind?: string } } };
      if ((kinds as readonly string[]).includes(m.kind)) {
        g.__gestureLog!.push({
          kind: m.kind,
          error: m.payload?.error?.kind,
        });
      }
    });
  }, RECORDED);
}

export async function drainGestureLog(
  page: Page,
): Promise<Array<{ kind: string; error?: string }>> {
  return page.evaluate(() => {
    const g = globalThis as unknown as CanvasGlobal;
    const out = g.__gestureLog ?? [];
    g.__gestureLog = [];
    return out;
  });
}

export function countKind(
  log: Array<{ kind: string }>,
  kind: string,
): number {
  return log.filter((e) => e.kind === kind).length;
}
