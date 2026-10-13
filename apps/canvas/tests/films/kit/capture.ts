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

// Capture for the marketing films (ADR 224): the page's own compositor
// frames through `page.screencast`, written to disk as they arrive, each
// with the wall-clock time Node received it. The compositor (in the
// website's media/ package) turns that variable-rate frame list into a
// constant-rate video, so nothing here encodes.

import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export interface CaptureOptions {
  /** Directory the frames and `frames.jsonl` are written to. */
  dir: string;
  /** Frame size in device pixels (viewport × deviceScaleFactor). */
  size: { width: number; height: number };
  /** JPEG quality, 0–100. */
  quality?: number;
}

export interface Capture {
  /** Frames written so far. */
  readonly count: number;
  stop(): Promise<void>;
}

/** One line of `frames.jsonl`: the file, the screencast's own timestamp
 *  (seconds, the browser's clock) and the Node wall clock it arrived at
 *  (ms since epoch, the clock marks and pointer events are logged on). */
export interface FrameRecord {
  file: string;
  ts: number;
  wall: number;
}

export async function startCapture(page: Page, opts: CaptureOptions): Promise<Capture> {
  const framesDir = join(opts.dir, "frames");
  mkdirSync(framesDir, { recursive: true });
  const index = join(opts.dir, "frames.jsonl");
  writeFileSync(index, "");
  let count = 0;
  // CDP directly, not `page.screencast`: Playwright 1.63 does not pass an
  // `onFrame` client's `size` through and falls back to 800 px wide.
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", (ev) => {
    const wall = Date.now();
    const file = `f${String(count).padStart(6, "0")}.jpg`;
    count += 1;
    // Synchronous on purpose: the order on disk is the arrival order.
    writeFileSync(join(framesDir, file), Buffer.from(ev.data, "base64"));
    const rec: FrameRecord = { file, ts: ev.metadata.timestamp ?? 0, wall };
    appendFileSync(index, `${JSON.stringify(rec)}\n`);
    void cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: opts.quality ?? 92,
    maxWidth: opts.size.width,
    maxHeight: opts.size.height,
    everyNthFrame: 1,
  });
  return {
    get count() {
      return count;
    },
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await cdp.detach().catch(() => {});
    },
  };
}
