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
    if (!dirty.has(o.pageId)) {
      // A PLAIN throw, deliberately — `expect.soft` recorded the failure
      // and kept going, so the op still got classified/collected while
      // the PACK went red for a reason absent from its own advisory
      // report (found 2026-08-18 when frameStrokeWeight, which reports
      // no invalidation at all, reddened 5 corpus packs whose reports
      // read "8 pass, 1 stale, 1 error"). Throwing routes it through
      // runOp's classify — advisory collects it, gate mode still fails.
      throw new Error(
        `invalidation contract: page ${o.pageId} not in dirty pageIds ${[...dirty]}`,
      );
    }
  }

  await o.expectModel();

  // ── render verification ───────────────────────────────────────
  // First pass without a region to learn the image dimensions,
  // then re-diff with the px region clamped to them.
  const sample = async () => {
    const png = await snap(page, o.pageId, o.pageWidthPt, widthPx);
    const p = diffPngPixels(baseline, png);
    const r: PxRect | null = o.region
      ? inflate(
          ptRectToPx(o.region!, o.pageWidthPt, widthPx),
          slack,
          p.width,
          p.height,
        )
      : null;
    return { probe: p, region: r, diff: r ? diffPngPixels(baseline, png, r) : p };
  };

  let { probe, region, diff: finalDiff } = await sample();

  // The snapshot is ONE SAMPLE of an asynchronous rebuild. The dirty-
  // pageIds contract above proves the op was accepted and the page was
  // marked for repaint; it does NOT prove the repaint has landed by the
  // time the next `requestSnapshot` is served. On a loaded runner it
  // sometimes has not, and a stale PNG is indistinguishable from an op
  // that painted nothing — the assertion then reports a render defect
  // that the engine does not have.
  //
  // That is what AC-E2E-FX-directional-feather has been doing in CI. The
  // engine paints it (the core sweep's digest moves, and a local probe
  // measures 4898 changed px); the run is reproducible under CI's exact
  // invocation on a dev machine and still passes; the wasm is identical
  // bytes and its float maths is deterministic, so the same input cannot
  // produce different pixels — leaving WHEN the sample was taken as the
  // only variable.
  //
  // Re-sampling costs nothing when the first sample already shows the
  // change, which is the overwhelmingly common case.
  if (!o.noRenderChange) {
    const settleBy = Date.now() + 5_000;
    while (finalDiff.changedInside === 0 && Date.now() < settleBy) {
      await page.waitForTimeout(150);
      ({ probe, region, diff: finalDiff } = await sample());
    }
  }

  if (o.noRenderChange) {
    expect(
      finalDiff.changed,
      "op declared noRenderChange but pixels changed",
    ).toBe(0);
  } else {
    // Say WHICH of the two failures this is. `changedInside === 0` has
    // two very different causes — the op painted nothing anywhere, or
    // it painted somewhere the region does not cover — and the old
    // message asserted the first while being equally true of the
    // second. That ambiguity is why AC-E2E-FX-directional-feather sat
    // red in CI for weeks reading like an engine defect: the whole-page
    // number, which distinguishes them in one line, was measured
    // (`probe`) and then thrown away.
    // WHAT THE ENGINE SAID IT DID, attached to the failure.
    //
    // `cacheStats` rides every `mutationApplied` and has been recorded
    // by this harness all along without ever being surfaced. On a
    // zero-pixel failure it is the cheapest evidence of WHERE the
    // pipeline stopped.
    //
    // READ `rebuilds`, NOT `misses`. A passing local run of
    // AC-E2E-FX-directional-feather reports
    // `{hits: 20, misses: 0, rebuilds: 2, rebuildMs: 77}` — zero misses
    // WHILE painting 4,898 px. So "misses = 0" does not mean "served
    // from cache and never redrawn", and an earlier draft of this
    // comment claimed exactly that. `rebuilds` is the field that
    // separates the two remaining explanations:
    //
    //   rebuilds > 0 → the scene WAS rebuilt and the rasterizer still
    //                  produced identical bytes. An engine defect.
    //   rebuilds = 0 → nothing was redrawn, so the op never reached the
    //                  raster and the drawing code is innocent.
    //
    // Why this exists: the test is red on Linux CI and green on macOS
    // with byte-identical wasm (same npm 0.62.0, same lockfile
    // integrity, same 21,521,112-byte module — the browser's own
    // request was measured), the same regenerated fixture (paged-gen
    // output compared byte-for-byte), the same CPU backend (both log
    // "no compatible wgpu adapter"), the same shard invocation, and an
    // exact pixel comparison with no tolerance. Every input matches and
    // the outputs do not, so the next move is to make CI say which half
    // of the pipeline stopped rather than guess a sixth time.
    const engineSaid = replies
      .filter((r) => r.kind === "mutationApplied")
      .map((r) => ({ pages: r.pageIds?.length ?? 0, cache: r.cacheStats }));

    expect(
      finalDiff.changedInside,
      probe.changed === 0
        ? "operation produced NO render change ANYWHERE on the page — not applied to the canvas document" +
          `\n  engine replies: ${JSON.stringify(engineSaid)}` +
          `\n  (read \`rebuilds\`: > 0 ⇒ rebuilt and still identical = engine defect;` +
          ` 0 ⇒ never redrawn = the op did not reach the raster)`
        : `operation changed ${probe.changed}px on the page but 0 inside the affected region ` +
          `(region px ${JSON.stringify(region)}, whole-page bbox ${JSON.stringify(probe.bbox)}) ` +
          `— the op painted, the region is looking in the wrong place`,
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
