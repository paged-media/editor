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

// Demo capture — records a journey as an rrweb session with the document-canvas
// frames bridged in (the frame-bridge addon, @paged-media/demo-replay).
//
// rrweb records the editor's DOM chrome; the editor's frame-tap
// (CanvasClient.startFrameTap / onFrame, added in packages/client) feeds the
// WebGPU document frames, which we relay as rrweb Custom events. The captured
// JSON replays faithfully — chrome from rrweb, document from the frames — with no
// WebGPU needed to watch.
//
// REQUIREMENTS (CI / full stack):
//   - The editor page is already loaded and `window.__canvas.client` is ready
//     (a dev/demo build — the handle + frame-tap are stripped from prod).
//   - rrweb is injectable (CDN by default; vendor a dist for hermetic CI).
//   - Drive the journey via the existing Designer harness between start/finish,
//     calling `step(page, label)` at each test.step boundary for captions.
//
// The custom-event tags are inlined here (mirror of
// @paged-media/demo-replay/types PAGED_DEMO) so the editor needs no extra dep.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";

const require = createRequire(import.meta.url);
/** Local rrweb UMD bundle (hermetic — no CDN). rrweb is an editor devDependency.
 *  rrweb's exports map hides the dist subpath, so resolve the main entry (which
 *  lives in dist/) and join the UMD bundle beside it. */
function localRrwebPath(): string | null {
  try {
    const main = require.resolve("rrweb"); // .../rrweb/dist/rrweb.cjs
    const umd = join(dirname(main), "rrweb.umd.min.cjs");
    return existsSync(umd) ? umd : null;
  } catch {
    return null;
  }
}

const PAGED_DEMO = {
  ATTACH: "paged.canvas.attach",
  FRAME: "paged.canvas.frame",
  STEP: "paged.demo.step",
} as const;

export interface CaptureOptions {
  /** Selector for the document canvas (matches in the replayed DOM). */
  canvasSelector: string;
  /** Frames per second to tap (default 10). */
  fps?: number;
  /** Override the rrweb UMD source. Defaults to the local install (hermetic). */
  rrwebUrl?: string;
}

export interface DemoSessionResult {
  events: unknown[];
}

/** Begin recording: inject rrweb, start the frame-tap, bridge frames → events. */
export async function startCapture(page: Page, opts: CaptureOptions): Promise<void> {
  // Prefer the local rrweb bundle (hermetic); fall back to a CDN only if asked.
  const localPath = localRrwebPath();
  if (opts.rrwebUrl) {
    await page.addScriptTag({ url: opts.rrwebUrl });
  } else if (localPath) {
    await page.addScriptTag({ path: localPath });
  } else {
    await page.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/rrweb@2/dist/rrweb.umd.min.cjs" });
  }
  await page.evaluate(
    ({ tags, selector, fps }) => {
      const w = window as unknown as Record<string, unknown>;
      const rr = w.rrweb as {
        record: (o: unknown) => () => void;
        addCustomEvent: (tag: string, payload: unknown) => void;
      };
      const events: unknown[] = [];
      w.__demoEvents = events;
      // recordCanvas:false — we supply the canvas via the frame-bridge instead.
      w.__demoStop = rr.record({ emit: (e: unknown) => events.push(e), recordCanvas: false });

      const client = (w.__canvas as { client: PagedCanvasClient }).client;
      let attached = false;
      w.__demoUnsub = client.onFrame((f: { src: string; width: number; height: number }) => {
        if (!attached) {
          rr.addCustomEvent(tags.ATTACH, { selector, width: f.width, height: f.height });
          attached = true;
        }
        rr.addCustomEvent(tags.FRAME, { src: f.src, width: f.width, height: f.height });
      });
      client.startFrameTap(fps);
      w.__demoStep = (label: string) => rr.addCustomEvent(tags.STEP, { label });
    },
    { tags: PAGED_DEMO, selector: opts.canvasSelector, fps: opts.fps ?? 10 },
  );
}

/** Emit a caption (call at each journey test.step boundary). */
export async function step(page: Page, label: string): Promise<void> {
  await page.evaluate((l) => {
    (window as unknown as { __demoStep?: (s: string) => void }).__demoStep?.(l);
  }, label);
}

/** Stop recording and return the rrweb event stream. */
export async function finishCapture(page: Page): Promise<DemoSessionResult> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __canvas?: { client?: { stopFrameTap?: () => void } };
      __demoUnsub?: () => void;
      __demoStop?: () => void;
      __demoEvents?: unknown[];
    };
    w.__canvas?.client?.stopFrameTap?.();
    w.__demoUnsub?.();
    w.__demoStop?.();
    return { events: w.__demoEvents ?? [] };
  });
}

// Minimal shape of the editor handle's client used here (the real type lives in
// @paged-media/client; kept structural so this file needs no import of it).
interface PagedCanvasClient {
  startFrameTap(fps?: number): void;
  stopFrameTap(): void;
  onFrame(cb: (f: { src: string; width: number; height: number }) => void): () => void;
}
