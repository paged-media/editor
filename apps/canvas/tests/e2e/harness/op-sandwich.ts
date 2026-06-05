// E2E op suite — the operation sandwich: the core invariant proving
// an editor operation actually landed in the IDML document rendered
// on the canvas.
//
//   baseline snapshot + model dump
//     → apply (UI-driven where a UI path exists)
//     → invalidation contract (reply pageIds; control page byte-stable)
//     → model assertions
//     → render diff (changed inside the affected region; ZERO outside)
//     → undo → model deep-equals baseline AND pixels BYTE-IDENTICAL
//     → redo → model assertions again
//
// Byte-identical undo is an ENGINE GUARANTEE (CPU renderer: tiny-skia,
// single-threaded, signature-keyed layout cache — see core's
// paged-canvas AC-E-7 determinism test). A violation here is an
// engine bug, not test flake.

import { expect, type Page } from "@playwright/test";

import { snapshotPagePng } from "../../fidelity/canvas-driver";
import {
  diffPngPixels,
  inflate,
  ptRectToPx,
  type DiffStats,
  type PxRect,
} from "./pixel-diff";

export interface PtRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface SandwichOpts {
  /** Page whose render the op affects. */
  pageId: string;
  /** That page's width in pt (px scaling). */
  pageWidthPt: number;
  /** Snapshot width in px. Default 420 — fast and deterministic. */
  widthPx?: number;
  /** Affected region in page-space pt; null/omitted = whole page. */
  region?: PtRect | null;
  /** Region inflation in px (strokes/shadows bleed). Default 24. */
  regionSlackPx?: number;
  /** Assert ZERO changed pixels outside region+slack. Default true
   *  when a region is given. */
  containment?: boolean;
  /** Ops that legitimately don't repaint (layer rename …). */
  noRenderChange?: boolean;
  /** A page expected NOT to repaint (collateral check across pages).
   *  Provide its id + width; skipped when omitted. */
  controlPage?: { pageId: string; pageWidthPt: number } | null;
  /** The operation — drive the real UI where one exists. */
  apply: () => Promise<void>;
  /** Post-apply model assertions (elementProperties/collections…). */
  expectModel: () => Promise<void>;
  /** Capture the model baseline; re-invoked after undo and compared
   *  via deep equality. Defaults to nothing (render-only restore). */
  dumpModel?: () => Promise<string>;
  /** Extra post-undo assertions beyond the dump comparison. */
  expectRestored?: () => Promise<void>;
  /** Undo presses to revert `apply`. Default 1. */
  undoSteps?: number;
  skipRedo?: boolean;
  /** Tolerated pixel delta after undo. Default 0 (byte-identical);
   *  any non-zero use must carry an inline justification. */
  undoPixelTolerance?: number;
  /** Skip ONLY the byte-identical-undo render assertion (model
   *  restore + expectRestored stay hard). For ops whose undo render
   *  is broken by a KNOWN engine bug — the reason string is logged
   *  and a dedicated `test.fail` must own the strict check so the
   *  day core fixes it the suite flips loudly. Never use to hide an
   *  unexplained diff. */
  skipUndoPixelCheck?: string;
}

export interface SandwichResult {
  diff: DiffStats;
  /** mutationApplied/undo/redo replies recorded during apply. */
  replies: RecordedReply[];
}

export interface RecordedReply {
  kind: string;
  pageIds?: string[];
  createdId?: unknown;
  pageStructureChanged?: boolean;
  cacheStats?: { hits: number; misses: number };
}

interface CanvasGlobal {
  __canvas: {
    client: {
      undo: () => Promise<unknown>;
      redo: () => Promise<unknown>;
      subscribe: (fn: (msg: unknown) => void) => () => void;
    };
  };
  __e2eReplies?: RecordedReply[];
  __e2eUnsub?: () => void;
}

/** Install the worker-notification recorder (idempotent). Worker
 *  notifications are `{kind, payload}` envelopes; gestures land as
 *  `gestureCommitted` (also carrying dirty pageIds). */
export async function installReplyRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as unknown as CanvasGlobal;
    if (g.__e2eUnsub) return;
    g.__e2eReplies = [];
    g.__e2eUnsub = g.__canvas.client.subscribe((msg) => {
      const m = msg as { kind: string; payload?: Record<string, unknown> };
      if (
        m.kind === "mutationApplied" ||
        m.kind === "undoApplied" ||
        m.kind === "redoApplied" ||
        m.kind === "gestureCommitted"
      ) {
        const p = m.payload ?? {};
        g.__e2eReplies!.push({
          kind: m.kind,
          pageIds: p.pageIds as string[] | undefined,
          createdId: p.createdId,
          pageStructureChanged: p.pageStructureChanged as boolean | undefined,
          cacheStats: p.cacheStats as
            | { hits: number; misses: number }
            | undefined,
        });
      }
    });
  });
}

export async function drainReplies(page: Page): Promise<RecordedReply[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as CanvasGlobal;
    const out = g.__e2eReplies ?? [];
    g.__e2eReplies = [];
    return out;
  });
}

async function snap(
  page: Page,
  pageId: string,
  pageWidthPt: number,
  widthPx: number,
): Promise<Buffer> {
  // dpi wins over width in the worker; derive it so the PNG width
  // is exactly widthPx for any page size.
  const dpi = (widthPx * 72) / pageWidthPt;
  return Buffer.from(await snapshotPagePng(page, pageId, widthPx, dpi));
}

export async function opSandwich(
  page: Page,
  o: SandwichOpts,
): Promise<SandwichResult> {
  const widthPx = o.widthPx ?? 420;
  const slack = o.regionSlackPx ?? 24;
  const undoSteps = o.undoSteps ?? 1;
  await installReplyRecorder(page);
  await drainReplies(page);

  // ── baseline ──────────────────────────────────────────────────
  const baseline = await snap(page, o.pageId, o.pageWidthPt, widthPx);
  const controlBaseline = o.controlPage
    ? await snap(page, o.controlPage.pageId, o.controlPage.pageWidthPt, widthPx)
    : null;
  const modelBaseline = o.dumpModel ? await o.dumpModel() : null;

  // ── apply ─────────────────────────────────────────────────────
  await o.apply();
  // UI-driven applies commit asynchronously (panel onCommit →
  // client.mutate); wait for the worker's applied reply before
  // snapshotting so the render check never races the mutation.
  const replies: RecordedReply[] = [];
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    replies.push(...(await drainReplies(page)));
    if (replies.length > 0 || o.noRenderChange) break;
    await page.waitForTimeout(50);
  }
  // One more drain to catch stragglers from multi-message ops.
  await page.waitForTimeout(50);
  replies.push(...(await drainReplies(page)));

  // Invalidation contract: the mutation reply must list our page
  // dirty (unless the op never repaints).
  if (!o.noRenderChange) {
    const dirty = new Set(replies.flatMap((r) => r.pageIds ?? []));
    expect
      .soft(
        dirty.has(o.pageId),
        `invalidation contract: page ${o.pageId} not in dirty pageIds ${[...dirty]}`,
      )
      .toBe(true);
  }

  await o.expectModel();

  // ── render verification ───────────────────────────────────────
  const after = await snap(page, o.pageId, o.pageWidthPt, widthPx);
  // First pass without a region to learn the image dimensions,
  // then re-diff with the px region clamped to them.
  const probe = diffPngPixels(baseline, after);
  let region: PxRect | null = null;
  if (o.region) {
    region = inflate(
      ptRectToPx(o.region, o.pageWidthPt, widthPx),
      slack,
      probe.width,
      probe.height,
    );
  }
  const finalDiff = region ? diffPngPixels(baseline, after, region) : probe;

  if (o.noRenderChange) {
    expect(
      finalDiff.changed,
      "op declared noRenderChange but pixels changed",
    ).toBe(0);
  } else {
    expect(
      finalDiff.changedInside,
      "operation produced NO render change in the affected region — not applied to the canvas document",
    ).toBeGreaterThan(0);
    if (region && (o.containment ?? true)) {
      expect(
        finalDiff.changedOutside,
        `collateral pixels changed outside the affected region (bbox ${JSON.stringify(finalDiff.bbox)})`,
      ).toBe(0);
    }
  }

  // Control page byte-stable (cross-page collateral check).
  if (o.controlPage && controlBaseline) {
    const controlAfter = await snap(
      page,
      o.controlPage.pageId,
      o.controlPage.pageWidthPt,
      widthPx,
    );
    expect(
      controlAfter.equals(controlBaseline),
      `control page ${o.controlPage.pageId} repainted — over-invalidation or collateral mutation`,
    ).toBe(true);
  }

  // ── undo: model + pixels restore ──────────────────────────────
  for (let i = 0; i < undoSteps; i++) {
    await page.evaluate(async () => {
      const g = globalThis as unknown as CanvasGlobal;
      await g.__canvas.client.undo();
    });
  }
  if (modelBaseline !== null && o.dumpModel) {
    expect(await o.dumpModel(), "model not restored by undo").toBe(
      modelBaseline,
    );
  }
  await o.expectRestored?.();
  const undone = await snap(page, o.pageId, o.pageWidthPt, widthPx);
  const tolerance = o.undoPixelTolerance ?? 0;
  if (o.skipUndoPixelCheck) {
    if (!undone.equals(baseline)) {
      const ud = diffPngPixels(baseline, undone);
      // eslint-disable-next-line no-console
      console.warn(
        `[op-sandwich] undo render stale (KNOWN: ${o.skipUndoPixelCheck}) — ${ud.changed} px differ in bbox ${JSON.stringify(ud.bbox)}; model restore still asserted.`,
      );
    }
  } else if (!undone.equals(baseline)) {
    const ud = diffPngPixels(baseline, undone);
    expect(
      ud.changed,
      `undo did not restore the canvas byte-identically — ${ud.changed} px differ in bbox ${JSON.stringify(ud.bbox)} (engine determinism violation unless tolerated inline)`,
    ).toBeLessThanOrEqual(tolerance);
  }

  // ── redo: effect returns ──────────────────────────────────────
  if (!o.skipRedo) {
    for (let i = 0; i < undoSteps; i++) {
      await page.evaluate(async () => {
        const g = globalThis as unknown as CanvasGlobal;
        await g.__canvas.client.redo();
      });
    }
    await o.expectModel();
    // Leave the document back at baseline for the next test.
    for (let i = 0; i < undoSteps; i++) {
      await page.evaluate(async () => {
        const g = globalThis as unknown as CanvasGlobal;
        await g.__canvas.client.undo();
      });
    }
  }

  return { diff: finalDiff, replies };
}
