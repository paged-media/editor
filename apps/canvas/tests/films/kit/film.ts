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

// One narrated take (ADR 224). The storyboard lives in the website's media/
// package; its narrate step voices every line and writes
// `.build/plans/<slug>.json`, which says how long each scene's line runs.
// A take follows that plan: each scene lasts at least as long as its line,
// so the edit never has to stretch or squeeze the recording to fit the voice.
//
// Everything is logged on Node's wall clock: frames (capture.ts), the
// pointer (pointer.ts) and the marks written here. The compositor lines them
// up from those logs alone.

import { test, expect, type Page } from "@playwright/test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Designer } from "../../journey/driver/designer";
import { screenPoint } from "../../e2e/harness/viewport";
import { startCapture, type Capture } from "./capture";
import { Pointer } from "./pointer";
import { dressStage } from "./stage";

const ROOT = process.env.PAGED_MEDIA_ROOT;

/** The viewport every film is recorded at, and its device pixel ratio: the
 *  frames are 3200×1800, the master is 2560×1440. */
export const VIEW = { width: 1600, height: 900 } as const;
export const DPR = 2;

/** One scene of a plan: the voice starts `leadMs` into the scene, speaks for
 *  `speechMs`, and the shot holds `tailMs` after it. */
export interface PlanScene {
  id: string;
  leadMs: number;
  speechMs: number;
  tailMs: number;
}

export interface Plan {
  slug: string;
  version: 1;
  scenes: PlanScene[];
}

/** One line of `marks.jsonl`. */
export type Mark =
  | { mark: "clapper-on" | "clapper-off" | "roll" | "wrap"; wall: number }
  | { mark: "scene"; id: string; wall: number; speechAt: number }
  | { mark: "scene-end"; id: string; wall: number }
  | { mark: "cut-start" | "cut-end"; label: string; wall: number }
  | { mark: "chip"; wall: number; text: string; icon: "key" | "file" | "save" | "done"; kbd?: string }
  /** Page 1's origin in CSS px and CSS px per point, so a storyboard can
   *  aim its zooms in page points. */
  | { mark: "camera"; wall: number; origin: [number, number]; scale: number }
  /** Punch in on a page rectangle (points: x0, y0, x1, y1) until unfocus. */
  | { mark: "focus"; wall: number; page: [number, number, number, number]; max?: number }
  | { mark: "unfocus"; wall: number };

export interface Kit {
  readonly page: Page;
  readonly designer: Designer;
  readonly pointer: Pointer;
  /** The take's directory, `<media>/.build/raw/<slug>`. */
  readonly dir: string;
  /** Off camera. Only before `roll()`. */
  setup(fn: () => Promise<void>): Promise<void>;
  /** Start the camera. The editor must be on WebGPU: the films show the
   *  GPU renderer, never the CPU fallback. */
  roll(): Promise<void>;
  /** One narrated scene. The actions run while the line is spoken; the
   *  scene ends when both the line (with its tail) and the actions are over. */
  scene(id: string, actions?: () => Promise<void>): Promise<void>;
  /** A wait the edit removes, shown as a chip ("6 s skipped"). */
  cut(label: string, wait: () => Promise<void>): Promise<void>;
  /** Hold the shot. */
  hold(ms: number): Promise<void>;
  /** Press a shortcut; with a label it shows on screen as a keycap. */
  key(combo: string, label?: string, shown?: string): Promise<void>;
  /** A chip for what the picture cannot show (a file picked, a file saved). */
  chip(text: string, icon: "file" | "save" | "done"): void;
  /** Punch the camera in on a page rectangle, in points. */
  focus(page: [number, number, number, number], max?: number): void;
  /** Back to the whole window. */
  unfocus(): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

function readPlan(slug: string): { plan: Plan; hash: string } {
  const file = join(ROOT!, ".build", "plans", `${slug}.json`);
  if (!existsSync(file)) {
    throw new Error(`no plan for "${slug}": run \`pnpm --filter @paged-media/media narrate ${slug}\` first`);
  }
  const text = readFileSync(file, "utf8");
  return { plan: JSON.parse(text) as Plan, hash: createHash("sha1").update(text).digest("hex") };
}

function editorCommit(): { commit: string; dirty: boolean } {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  return { commit: git("rev-parse", "--short", "HEAD"), dirty: git("status", "--porcelain").length > 0 };
}

/** Declare a film. The body sets up off camera, rolls, and plays the plan's
 *  scenes in order; the take is written when the body returns. */
export function film(slug: string, body: (k: Kit) => Promise<void>): void {
  test(`film · ${slug}`, async ({ page }) => {
    test.skip(!ROOT, "PAGED_MEDIA_ROOT is not set (films are recorded locally)");
    const { plan, hash } = readPlan(slug);
    const dir = join(ROOT!, ".build", "raw", slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const marksFile = join(dir, "marks.jsonl");
    writeFileSync(marksFile, "");
    const mark = (m: Mark) => appendFileSync(marksFile, `${JSON.stringify(m)}\n`);

    await dressStage(page);
    const designer = new Designer(page);
    const pointer = new Pointer(page, join(dir, "cursor.jsonl"), { x: VIEW.width / 2, y: VIEW.height / 2 });
    let capture: Capture | null = null;
    let next = 0;

    const k: Kit = {
      page,
      designer,
      pointer,
      dir,
      async setup(fn) {
        if (capture) throw new Error("setup() after roll(): the camera is already rolling");
        await fn();
      },
      async roll() {
        if (capture) throw new Error("roll() twice");
        await expect.poll(() => designer.gpuActive(), { timeout: 30_000 }).toBe(true);
        await pointer.place(pointer.position);
        capture = await startCapture(page, {
          dir,
          size: { width: VIEW.width * DPR, height: VIEW.height * DPR },
          quality: 92,
        });
        // A clapper flash: verify finds it in the frames and checks the
        // frame clock against the marks to within one frame.
        await page.evaluate(() => {
          const d = document.createElement("div");
          d.id = "film-clapper";
          d.style.cssText =
            "position:fixed;left:0;top:0;width:24px;height:24px;background:#00ff00;z-index:2147483647";
          document.body.appendChild(d);
        });
        mark({ mark: "clapper-on", wall: Date.now() });
        await sleep(250);
        await page.evaluate(() => document.getElementById("film-clapper")?.remove());
        mark({ mark: "clapper-off", wall: Date.now() });
        await sleep(300);
        // The camera must not move after this: zooms are aimed through it.
        const o = await screenPoint(page, 0, 0);
        const x = await screenPoint(page, 100, 0);
        mark({ mark: "camera", wall: Date.now(), origin: [o.x, o.y], scale: (x.x - o.x) / 100 });
        mark({ mark: "roll", wall: Date.now() });
      },
      async scene(id, actions) {
        if (!capture) throw new Error(`scene "${id}" before roll()`);
        const s = plan.scenes[next];
        if (!s || s.id !== id) {
          throw new Error(`scene "${id}" is out of order: the plan expects "${s?.id ?? "(no more scenes)"}"`);
        }
        next += 1;
        const t0 = Date.now();
        mark({ mark: "scene", id, wall: t0, speechAt: t0 + s.leadMs });
        if (actions) await actions();
        await sleep(t0 + s.leadMs + s.speechMs + s.tailMs - Date.now());
        mark({ mark: "scene-end", id, wall: Date.now() });
      },
      async cut(label, wait) {
        if (!capture) throw new Error(`cut "${label}" before roll()`);
        mark({ mark: "cut-start", label, wall: Date.now() });
        await wait();
        mark({ mark: "cut-end", label, wall: Date.now() });
      },
      hold: sleep,
      async key(combo, label, shown) {
        // A focused field would take the keystroke as input (a select jumps
        // to the option starting with it), so the shortcut goes to the page.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        if (label) {
          mark({ mark: "chip", wall: Date.now(), text: label, icon: "key", kbd: shown ?? combo.toUpperCase() });
          await sleep(180);
        }
        await page.keyboard.press(combo);
      },
      chip(text, icon) {
        mark({ mark: "chip", wall: Date.now(), text, icon });
      },
      focus(rect, max) {
        mark({ mark: "focus", wall: Date.now(), page: rect, ...(max ? { max } : {}) });
      },
      unfocus() {
        mark({ mark: "unfocus", wall: Date.now() });
      },
    };

    await body(k);

    if (!capture) throw new Error("the film never rolled");
    if (next !== plan.scenes.length) {
      throw new Error(`the take ended after ${next} of ${plan.scenes.length} scenes (next: "${plan.scenes[next].id}")`);
    }
    const gpuActive = await designer.gpuActive();
    mark({ mark: "wrap", wall: Date.now() });
    await sleep(200);
    const frames = (capture as Capture).count;
    await (capture as Capture).stop();
    writeFileSync(
      join(dir, "take.json"),
      JSON.stringify(
        {
          slug,
          recorded: new Date().toISOString(),
          editor: editorCommit(),
          plan: hash,
          view: VIEW,
          dpr: DPR,
          gpuActive,
          frames,
        },
        null,
        2,
      ),
    );
    expect(gpuActive, "the take must end on the WebGPU renderer").toBe(true);
  });
}
