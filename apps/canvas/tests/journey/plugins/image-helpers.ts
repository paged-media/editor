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

// Shared steps for the paged.image command and retouch-tool journeys.
//
// The older image journeys each carry their own copy of `sourceReadout`
// and `ingest`; these two newer files drive ~25 commands and tools between
// them and need the same steps with one difference the designer driver
// cannot give them: the IMAGE CONTENT. `designer.importImage` always
// synthesizes the same smooth diagonal gradient, and a 3×3 median, a blur
// brush or a spot heal on a smooth gradient changes so few pixels beyond
// the snapshot differ's tolerance that a render assertion would measure a
// confident zero. So the image is chosen per step: noise for the
// neighbourhood filters, flat blocks for the bucket and the toning tools,
// a red pupil for red eye, one dark blemish for the spot healing brush.
//
// Geometry: a square image in the 270×200 pt FRAME is fitted to the frame's
// height and centred, so it spans x 125–325 pt, y 120–320 pt, and the
// image centre sits at the frame centre (225, 220).

import { expect, type Page } from "@playwright/test";

import { screenPoint } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

export const ADJ_PANEL = "media.paged.image.panel.adjustments";

/** The frame every journey here draws, in document pt. Gestures stay well
 *  inside it. */
export const FRAME = { x0: 90, y0: 120, x1: 360, y1: 320 } as const;

export type Fill = "gradient" | "noise" | "blocks" | "red-eye" | "blemish";

/** The panel's Source row: "<name> <w>×<h>", or "none". */
export async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "Source row not found";
  });
}

/** The session's status line — the plugin's own account of the last thing
 *  it did, including the GPU-only refusals on the CPU lane. */
export async function statusText(page: Page): Promise<string> {
  const el = page.locator("[data-image-status]");
  return (await el.count()) ? ((await el.first().textContent()) ?? "") : "";
}

/** Undo depth from the journal readout ("History: N undo / M redo"). */
export async function undoDepth(page: Page): Promise<number> {
  const el = page.locator("[data-image-history-readout]");
  if ((await el.count()) === 0) return 0;
  const m = ((await el.first().textContent()) ?? "").match(/History:\s*(\d+)\s*undo/);
  return m ? Number(m[1]) : 0;
}

/**
 * Draw a frame, select it, and run a synthesized PNG through the K-2 raster
 * importer — which binds the selected frame, so the frame-fit tools resolve.
 * Returns the frame id and a render of the page taken BEFORE the import
 * (the empty frame), which {@link compositeBaseline} needs.
 */
export async function ingest(
  designer: Designer,
  page: Page,
  name: string,
  fill: Fill,
  width = 96,
  height = 96,
): Promise<{ frame: string; empty: Uint8Array | null }> {
  await designer.open();
  await designer.newDocument();
  const frame = await designer.drawRectangle(FRAME);
  expect(frame, "drew a target frame").not.toBe("");
  await designer.selectElement("rectangle", frame);
  const empty = (await designer.gpuActive()) ? await designer.renderBytes() : null;

  const importer = await page.evaluate(
    async ({ name, fill, width, height }) => {
      const cv = new OffscreenCanvas(width, height);
      const ctx = cv.getContext("2d");
      if (!ctx) return "no 2d context to synthesize a PNG";
      if (fill === "gradient" || fill === "blemish") {
        const g = ctx.createLinearGradient(0, 0, width, height);
        g.addColorStop(0, "#1830ff");
        g.addColorStop(0.5, "#20c040");
        g.addColorStop(1, "#ff3018");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
        if (fill === "blemish") {
          // One dark spot dead centre — what the spot healing brush is for.
          ctx.fillStyle = "#101010";
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, width * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fill === "noise") {
        // Seeded, so every run diffs the same pixels.
        const img = ctx.createImageData(width, height);
        let s = 0x2545f491;
        for (let i = 0; i < img.data.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            img.data[i + c] = s >>> 24;
          }
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      } else if (fill === "blocks") {
        // Four flat mid-tone quadrants: room for dodge AND burn, colour for
        // the sponge, and flat regions the bucket floods completely.
        const w2 = width / 2;
        const h2 = height / 2;
        for (const [x, y, c] of [
          [0, 0, "#3c78c8"],
          [w2, 0, "#c8a03c"],
          [0, h2, "#50a050"],
          [w2, h2, "#a05090"],
        ] as const) {
          ctx.fillStyle = c;
          ctx.fillRect(x, y, w2, h2);
        }
      } else {
        // A red pupil in a dark iris on grey skin.
        ctx.fillStyle = "#909090";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#302020";
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, width * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e01818";
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, width * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      const blob = await cv.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              importers?: {
                resolve(
                  n: string,
                  m: string,
                ): {
                  id?: string;
                  import(f: { name: string; bytes: Uint8Array; mimeType: string }): Promise<unknown>;
                } | null;
              };
            };
          };
        }
      ).__canvas.registries.importers;
      if (!reg) return "host serves no importer registry";
      const imp = reg.resolve(name, "image/png");
      if (!imp) return "no importer resolved for image/png";
      await imp.import({ name, bytes, mimeType: "image/png" });
      return imp.id ?? "imported";
    },
    { name, fill, width, height },
  );
  expect(importer, "the raster importer resolved + ran").toContain(
    "media.paged.image.importer.raster",
  );
  await designer.openPanel(ADJ_PANEL);
  await expect
    .poll(() => sourceReadout(page), { timeout: 20_000 })
    .toBe(`${name} ${width}×${height}`);
  return { frame, empty };
}

/** Two consecutive snapshots that agree — a render no composite is still
 *  landing on. A baseline taken mid-push would let the push itself pass
 *  the next step's "the render changed". */
export async function settledRender(
  designer: Designer,
  page: Page,
): Promise<Uint8Array> {
  let a = await designer.renderBytes();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400);
    const b = await designer.renderBytes();
    if ((await designer.renderDiffPixels(a, b)) === 0) return b;
    a = b;
  }
  return a;
}

/**
 * GPU lane only: composite the ingested image into its frame and return a
 * settled render of it. The diff against the EMPTY frame is the proof that
 * the baseline holds the image — without it, the first effect's composite
 * would be the change every later assertion measures.
 */
export async function compositeBaseline(
  designer: Designer,
  page: Page,
  empty: Uint8Array | null,
): Promise<Uint8Array> {
  expect(empty, "the empty-frame render was taken on the GPU lane").not.toBeNull();
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  if ((await apply.count()) > 0 && (await apply.first().isEnabled())) {
    await apply.first().click();
  }
  await designer.expectRenderChangesFrom(empty!, { timeout: 30_000 });
  return settledRender(designer, page);
}

/** Arm a bundle tool through its contributed activation command (the
 *  host's built-in `designer.activate` does not reach a bundle tool). */
export async function armTool(designer: Designer, id: string): Promise<void> {
  await designer.runCommand(`paged.tool.activate.${id}`);
}

/**
 * Drag along `pathPt` (document pt). Converts through `screenPoint`, the
 * same space `drawRectangle` takes, and hovers first: every frame-fit tool
 * resolves its fit asynchronously in `onActivate`, and a press issued
 * before it lands is dropped silently.
 */
export async function dragPt(
  page: Page,
  pathPt: Array<[number, number]>,
  opts: { alt?: boolean } = {},
): Promise<void> {
  const path = await Promise.all(pathPt.map(([x, y]) => screenPoint(page, x, y)));
  await page.mouse.move(path[0].x, path[0].y);
  await page.waitForTimeout(750);
  if (opts.alt) await page.keyboard.down("Alt");
  await page.mouse.down();
  for (const pt of path.slice(1)) {
    await page.mouse.move(pt.x, pt.y, { steps: 4 });
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up("Alt");
}

/** A click at one document-pt point, with the same hover-settle. */
export async function clickPt(page: Page, x: number, y: number): Promise<void> {
  const p = await screenPoint(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(750);
  await page.mouse.down();
  await page.mouse.up();
}

/**
 * Put a known line in the status bar that no tool or command under test
 * can produce, so the NEXT status assertion cannot be satisfied by an
 * identical line an earlier step left behind (React does not re-render an
 * unchanged string, so "the line is X" says nothing about who wrote it).
 * Fill-with-pattern before any pattern is defined is a pure refusal: it
 * touches no pixel and no selection.
 */
export async function primeStatus(designer: Designer, page: Page): Promise<void> {
  await designer.runCommand("media.paged.image.command.fillPattern");
  await expect
    .poll(() => statusText(page), { timeout: 10_000 })
    .toContain("No pattern defined");
}
