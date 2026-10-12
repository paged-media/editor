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

// Pointer movement for the films: the cursor travels the way a hand moves
// it (a minimum-jerk profile along a slight arc, its duration from Fitts's
// law), and every position it passes through is logged, because the
// compositor draws the cursor from that log rather than from the page. A
// headless page has no visible pointer at all, and a cursor drawn into the
// app's DOM would go blind over a sandboxed iframe.

import type { Page } from "@playwright/test";
import { appendFileSync, writeFileSync } from "node:fs";

export interface Point {
  x: number;
  y: number;
}

/** One line of `cursor.jsonl`: Node wall clock (ms), CSS px, button state,
 *  and `click` on the sample that releases a click. */
export interface CursorSample {
  t: number;
  x: number;
  y: number;
  down: boolean;
  click?: boolean;
}

/** A small seeded generator, so a re-take moves the same way. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const minJerk = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s);

export class Pointer {
  private at: Point;
  private down = false;
  private readonly rand: () => number;

  constructor(
    private readonly page: Page,
    private readonly logFile: string,
    start: Point = { x: 800, y: 450 },
    seed = 1,
  ) {
    this.at = { ...start };
    this.rand = mulberry32(seed);
    writeFileSync(logFile, "");
  }

  get position(): Point {
    return { ...this.at };
  }

  private log(sample: Omit<CursorSample, "t">): void {
    appendFileSync(this.logFile, `${JSON.stringify({ t: Date.now(), ...sample })}\n`);
  }

  /** Teleport without a visible path (setup only, before the camera rolls). */
  async place(p: Point): Promise<void> {
    this.at = { ...p };
    await this.page.mouse.move(p.x, p.y);
    this.log({ x: p.x, y: p.y, down: this.down });
  }

  /** Travel to `to` along a gentle arc. `targetWidth` (CSS px) feeds Fitts's
   *  law: small targets are approached more slowly. */
  async moveTo(to: Point, opts: { targetWidth?: number; speed?: number } = {}): Promise<void> {
    const from = this.at;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;
    const w = Math.max(opts.targetWidth ?? 24, 4);
    const ms = (250 + 150 * Math.log2(dist / w + 1)) / (opts.speed ?? 1);
    // The arc bows to one side by 6–10% of the distance.
    const bow = (0.06 + this.rand() * 0.04) * dist * (this.rand() < 0.5 ? -1 : 1);
    const nx = -dy / dist;
    const ny = dx / dist;
    const steps = Math.max(2, Math.round(ms / (1000 / 60)));
    const t0 = Date.now();
    for (let i = 1; i <= steps; i++) {
      const s = minJerk(i / steps);
      const arc = Math.sin(Math.PI * s) * bow;
      const x = from.x + dx * s + nx * arc;
      const y = from.y + dy * s + ny * arc;
      await this.page.mouse.move(x, y);
      this.at = { x, y };
      this.log({ x, y, down: this.down });
      // Hold to an absolute schedule so a slow `mouse.move` does not stretch
      // the whole gesture.
      const due = t0 + (i * ms) / steps;
      const wait = due - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }

  async click(to?: Point, opts: { targetWidth?: number } = {}): Promise<void> {
    if (to) await this.moveTo(to, opts);
    await this.page.mouse.down();
    this.down = true;
    this.log({ ...this.at, down: true });
    await new Promise((r) => setTimeout(r, 80));
    await this.page.mouse.up();
    this.down = false;
    this.log({ ...this.at, down: false, click: true });
  }

  /** Press where the pointer is, follow `path` along straight segments at
   *  `pxPerSec` CSS px per second, release: a retouching stroke, which an
   *  arcing path would let wander off what it is meant to cover. */
  async paint(path: Point[], pxPerSec = 160): Promise<void> {
    await this.page.mouse.down();
    this.down = true;
    this.log({ ...this.at, down: true });
    const t0 = Date.now();
    let travelled = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / 4));
      for (let j = 1; j <= steps; j++) {
        const x = a.x + ((b.x - a.x) * j) / steps;
        const y = a.y + ((b.y - a.y) * j) / steps;
        await this.page.mouse.move(x, y);
        this.at = { x, y };
        this.log({ x, y, down: true });
        travelled += len / steps;
        const wait = t0 + (travelled / pxPerSec) * 1000 - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    }
    await this.page.mouse.up();
    this.down = false;
    this.log({ ...this.at, down: false });
  }

  /** Press at `from`, travel to `to` with the button held, release. */
  async drag(from: Point, to: Point, opts: { speed?: number } = {}): Promise<void> {
    await this.moveTo(from, { targetWidth: 12 });
    await this.page.mouse.down();
    this.down = true;
    this.log({ ...this.at, down: true });
    await new Promise((r) => setTimeout(r, 90));
    await this.moveTo(to, { targetWidth: 200, speed: opts.speed ?? 0.8 });
    await new Promise((r) => setTimeout(r, 120));
    await this.page.mouse.up();
    this.down = false;
    this.log({ ...this.at, down: false });
  }
}

/** Type like a person: 55–85 ms a key, a little longer after a space or
 *  punctuation. Seeded, so a re-take types at the same rhythm. */
export async function typeHuman(page: Page, text: string, seed = 7): Promise<void> {
  const rand = mulberry32(seed);
  for (const ch of text) {
    await page.keyboard.type(ch);
    let ms = 55 + rand() * 30;
    if (/[\s.,;:!?]/.test(ch)) ms += 120 + rand() * 80;
    await new Promise((r) => setTimeout(r, ms));
  }
}
