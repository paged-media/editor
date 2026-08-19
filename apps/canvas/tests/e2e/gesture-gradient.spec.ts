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

// Gesture tier — the two gradient-axis drags (coverage campaign P3):
//
//   GR-01  Gradient Annotator (paged.draw tool): a drag across a
//          gradient-filled selection re-aims the gradient axis —
//          pointer-up commits frameGradientFillAngle +
//          frameGradientFillLength as ONE batch (one undo step).
//   GF-01  Gradient Feather (built-in tool): a drag across a filled
//          selection applies a linear opacity feather along the drag
//          axis (whole-struct frameGradientFeather write); a plain
//          click clears it.
//
// Both are pointer-driven through the REAL rail slots on the loaded
// document, model-verified via elementProperties readback, and undone
// to the exact prior value.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  activateTool,
  awaitGeometryMirror,
  dragMouse,
  loadViaReactPath,
  screenPoint,
} from "./harness/viewport";
import { undo } from "./harness/gesture";
import { selectElements } from "./harness/ui";
import { elementPageRectPt, type ElementRef } from "./harness/fixtures";

async function readProp(
  page: Page,
  ref: ElementRef,
  path: string,
): Promise<{ type: string; value: unknown } | null> {
  return page.evaluate(
    async ({ id, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{
                  path: string;
                  value?: { type: string; value: unknown } | null;
                }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { id: ref, p: path },
  );
}

/** First rectangle whose fill names a Gradient resource. */
async function firstGradientFilledRect(page: Page): Promise<ElementRef | null> {
  const refs = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript(src: string): Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const treeJson = await c.client
      .executeScript("paged.tree()")
      .then((r) => r.output[0] ?? "[]");
    type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
    const out: Array<{ kind: string; id: string }> = [];
    const walk = (nodes: Node[] | undefined) => {
      for (const n of nodes ?? []) {
        if (n.id?.kind === "rectangle") out.push(n.id);
        walk(n.children);
      }
    };
    walk(JSON.parse(treeJson) as Node[]);
    return out.slice(0, 20);
  });
  for (const ref of refs) {
    const fill = await readProp(page, ref, "frameFillColor");
    if (
      fill?.type === "colorRef" &&
      typeof fill.value === "string" &&
      fill.value.startsWith("Gradient/")
    ) {
      return ref;
    }
  }
  return null;
}

test.beforeEach(async ({ page }) => {
  await openCanvas(page);
  await loadViaReactPath(page, "gradients");
});

test("GR-01 — dragging the Gradient Annotator re-aims the selection's gradient axis; ONE undo restores it @feat:color-swatches.gradients @level:gesture", async ({
  page,
}) => {
  const ref = await firstGradientFilledRect(page);
  expect(ref, "gradients fixture has a gradient-filled rectangle").not.toBeNull();

  await selectElements(page, [ref!]);
  await awaitGeometryMirror(page, 1);

  const angleBefore = await readProp(page, ref!, "frameGradientFillAngle");
  const rect = (await elementPageRectPt(page, ref!))!;
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;

  await activateTool(page, "gradientAnnotator");
  // A deliberately oblique axis (≈34°) — no fixture ships one, so the
  // write cannot be a no-op.
  const from = await screenPoint(page, cx - 40, cy - 27);
  const to = await screenPoint(page, cx + 40, cy + 27);
  await dragMouse(page, from, to);

  await expect
    .poll(async () => {
      const v = await readProp(page, ref!, "frameGradientFillAngle");
      return JSON.stringify(v);
    })
    .not.toBe(JSON.stringify(angleBefore));

  // One batch = one undo step back to the exact prior axis.
  await undo(page);
  await expect
    .poll(async () =>
      JSON.stringify(await readProp(page, ref!, "frameGradientFillAngle")),
    )
    .toBe(JSON.stringify(angleBefore));
});

test("GF-01 — dragging the Gradient Feather applies a feather along the drag axis; a plain click clears it @feat:effects-transparency.gradient-feather @level:gesture", async ({
  page,
}) => {
  const ref = await firstGradientFilledRect(page);
  expect(ref, "gradients fixture has a filled rectangle").not.toBeNull();

  await selectElements(page, [ref!]);
  await awaitGeometryMirror(page, 1);

  const before = await readProp(page, ref!, "frameGradientFeather");
  const rect = (await elementPageRectPt(page, ref!))!;
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;

  await activateTool(page, "gradientFeather");
  const from = await screenPoint(page, rect.left + 8, cy);
  const to = await screenPoint(page, rect.right - 8, cy);
  await dragMouse(page, from, to);

  // The whole-struct write landed (non-null and different from before).
  await expect
    .poll(async () =>
      JSON.stringify(await readProp(page, ref!, "frameGradientFeather")),
    )
    .not.toBe(JSON.stringify(before));
  const applied = await readProp(page, ref!, "frameGradientFeather");
  expect(applied, "feather struct present after the drag").not.toBeNull();

  // InDesign's explicit affordance: a plain (zero-length) click clears
  // the feather from the selection.
  const at = await screenPoint(page, cx, cy);
  await page.mouse.click(at.x, at.y);
  await expect
    .poll(async () => {
      const v = await readProp(page, ref!, "frameGradientFeather");
      return v === null || v.value === null;
    })
    .toBe(true);

  // Undo the clear, then the apply — back to the exact prior state.
  await undo(page, 2);
  await expect
    .poll(async () =>
      JSON.stringify(await readProp(page, ref!, "frameGradientFeather")),
    )
    .toBe(JSON.stringify(before));
});
