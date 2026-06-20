// Demo capture — records the showcase flows as rrweb sessions (DOM chrome from
// rrweb + WebGPU document frames from the editor frame-tap) for the docs live
// demos. Run: `npx playwright test --project=demo-capture`. Each flow writes
// tests/demo/out/<id>.rrweb.json; CI uploads them as release assets, docs pull.
//
// Flows are authored here (not the assertion-heavy journey specs) so they're
// paced + narrated for viewing. Add a flow + a manifest entry to publish one.
// NOTE: fast-channel actions (drawRectangle/applyFill) change the document via
// frames with no cursor; for cursor-visible GESTURE demos, drive with real
// pointer input (see the master journeys) — a follow-up refinement.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

import { Designer } from "../journey/driver/designer";
import { screenPoint, dragMouse, activateTool } from "../e2e/harness/viewport";
import { startCapture, step, finishCapture } from "./capture";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");
const manifest = JSON.parse(readFileSync(join(HERE, "showcase.manifest.json"), "utf8")) as {
  canvasSelector: string;
  fps?: number;
  demos: Array<{ id: string; title?: string; description?: string }>;
};
const CANVAS_SELECTOR = manifest.canvasSelector;
const FPS = manifest.fps ?? 24;

type PWPage = import("@playwright/test").Page;

/** A paced beat so the replay has watchable duration per step. */
async function beat(page: PWPage, ms = 900): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Glide the real cursor to a document point (cursor-visible, no click). */
async function cursorTo(page: PWPage, ptX: number, ptY: number): Promise<void> {
  const p = await screenPoint(page, ptX, ptY);
  await page.mouse.move(p.x, p.y, { steps: 12 });
}

/** REAL pointer translate: select tool, then body-drag the element from one
 *  document point to another — the cursor follows and the frame moves. */
async function moveByDrag(
  page: PWPage,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await activateTool(page, "select");
  const a = await screenPoint(page, from.x, from.y);
  const b = await screenPoint(page, to.x, to.y);
  await dragMouse(page, a, b, { steps: 16, settleMs: 160 });
}

type Flow = (designer: Designer, page: PWPage, say: (label: string) => Promise<void>) => Promise<void>;

const flows: Record<string, Flow> = {
  "new-document": async (designer, page, say) => {
    await say("New blank Letter document");
    await designer.newDocument();
    await beat(page);
  },

  gradient: async (designer, page, say) => {
    await say("Create two brand swatches");
    const red = await designer.createSwatch("Red", [220, 30, 30]);
    const blue = await designer.createSwatch("Blue", [30, 60, 220]);
    await beat(page);
    await say("Build a linear gradient");
    const grad = await designer.createGradient("Sunset", [red, blue]);
    await beat(page);
    await say("Draw a frame (real pointer drag)");
    await cursorTo(page, 90, 120);
    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 460, y1: 320 });
    await beat(page, 500);
    await say("Fill it with the gradient");
    await designer.selectElement("rectangle", id);
    await designer.applyFill("rectangle", id, grad);
    await beat(page);
  },

  "draw-fill": async (designer, page, say) => {
    await say("Draw a rectangle (real pointer drag)");
    await cursorTo(page, 120, 140);
    const id = await designer.drawRectangle({ x0: 120, y0: 140, x1: 420, y1: 320 });
    await beat(page, 500);
    await say("Apply a solid fill");
    await designer.selectElement("rectangle", id);
    await designer.applyFill("rectangle", id, "Color/Black");
    await beat(page, 600);
    await say("Move it across the page (real pointer drag)");
    // Drag from inside the frame to a new spot — cursor-visible translate.
    await moveByDrag(page, { x: 270, y: 230 }, { x: 470, y: 380 });
    await beat(page);
  },
};

mkdirSync(OUT_DIR, { recursive: true });

for (const demo of manifest.demos) {
  const flow = flows[demo.id];
  // Only flows authored above are captured; the rest of the manifest is the
  // backlog of journeys to turn into demo flows. (Don't use top-level
  // test.skip here — at file scope it would skip the WHOLE suite.)
  if (!flow) continue;

  test(`capture · ${demo.id}`, async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    await startCapture(page, { canvasSelector: CANVAS_SELECTOR, fps: FPS });
    await flow(designer, page, (label) => step(page, label));
    const session = await finishCapture(page);

    writeFileSync(
      join(OUT_DIR, `${demo.id}.rrweb.json`),
      JSON.stringify({ meta: { id: demo.id, title: demo.title, description: demo.description }, ...session }),
    );
  });
}
