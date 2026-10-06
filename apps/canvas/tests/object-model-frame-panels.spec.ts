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

// ADR 323 (Wave 6) — the FRAME panels on the object model, end to end on
// the real engine: Color, Effects, Object/Transform, Attributes, Frame
// fitting. For each: a write through the panel's own control → the value
// read back through `host.objects` (`__canvas.objects`, the shared
// registry) → ONE undo restores it. Attributes proves the multi-selection
// rule (two frames, one batch, one undo step). "Bind to data…" is opened
// on a schema-driven field (Color ▸ Fill, a collection select) and on a
// bespoke one (Effects ▸ Opacity) of this family.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";
import { loadFixture, type ElementRef } from "./e2e/harness/fixtures";
import { mutate, selectElements } from "./e2e/harness/ui";
import { bindDryRun, fieldOf, objGet, undoOnce } from "./e2e/harness/objects";

const addr = (r: ElementRef) => `${r.kind}:${r.id}`;

async function firstSwatch(page: Page, not: unknown): Promise<string> {
  // A colour the frame does not already carry: mint one (the geometry
  // fixture holds little beyond the reserved swatches).
  await mutate(page, {
    op: "createSwatch",
    args: { spec: { name: "OM test", space: "CMYK", value: [0, 100, 100, 0], model: "Process" } },
  });
  const id = await page.evaluate(async (avoid) => {
    const c = (globalThis as unknown as {
      __canvas: { client: { collection(n: string): Promise<Array<{ selfId: string }>> } };
    }).__canvas;
    const sw = await c.client.collection("swatches");
    return sw.find((s) => !/none|paper|registration/i.test(s.selfId) && s.selfId !== avoid)?.selfId ?? null;
  }, not);
  expect(id).not.toBeNull();
  return id as string;
}

async function commitNumber(page: Page, input: ReturnType<Page["locator"]>, value: number) {
  await input.click();
  await input.fill(String(value));
  await input.press("Enter");
}

test.describe("ADR 323 — frame panels write through host.objects", () => {
  let rect: ElementRef;
  let frames: ElementRef[];

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const fx = await loadFixture(page, "geometry");
    frames = fx.frames.filter((f) => f.pageIndex === 0).map((f) => f.ref);
    rect = fx.firstRectangle ?? frames[0];
    await selectElements(page, [rect]);
  });

  test("OM-FRAME-1 — Color ▸ Fill (schema field over the swatch collection): set → host.objects → one undo; Bind to data… @feat:editor-shell.panels.color @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.color");
    const field = fieldOf(page.locator('[data-color-panel="ready"]'), "frameFillColor");
    await expect(field).toHaveAttribute("data-value-type", "color");
    const before = await objGet(page, addr(rect), "frameFillColor");
    const swatch = await firstSwatch(page, before);
    await field.locator("select").selectOption(swatch);
    await expect.poll(() => objGet(page, addr(rect), "frameFillColor")).toBe(swatch);
    await undoOnce(page);
    await expect.poll(() => objGet(page, addr(rect), "frameFillColor")).toEqual(before);
    await bindDryRun(page, field, "frameFillColor");
  });

  test("OM-FRAME-2 — Effects ▸ Opacity and the Drop shadow pill (bespoke widgets in an ObjectFieldFrame): set → host.objects → one undo; Bind to data… @feat:editor-shell.panels.effects @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.effects");
    const panel = page.locator('[data-effects-panel="ready"]');
    const opacity = fieldOf(panel, "frameOpacity");
    await expect(opacity).toHaveAttribute("data-binding-state", "value");
    const before = await objGet(page, addr(rect), "frameOpacity");
    const next = before === 40 ? 60 : 40;
    await commitNumber(page, opacity.locator('input[aria-label="opacity"]'), next);
    await expect.poll(() => objGet(page, addr(rect), "frameOpacity")).toBe(next);
    await undoOnce(page);
    await expect.poll(() => objGet(page, addr(rect), "frameOpacity")).toEqual(before);

    const shadowBefore = await objGet(page, addr(rect), "frameDropShadow");
    await fieldOf(panel, "frameDropShadow").locator('[role="switch"]').click();
    await expect.poll(() => objGet(page, addr(rect), "frameDropShadow")).toBe(shadowBefore !== true);
    await undoOnce(page);
    await expect.poll(() => objGet(page, addr(rect), "frameDropShadow")).toEqual(shadowBefore);

    await bindDryRun(page, opacity, "frameOpacity");
  });

  test("OM-FRAME-3 — Object/Transform ▸ W (custom resize over frameBounds): set → host.objects → one undo @feat:editor-shell.panels.object-transform @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.object-transform");
    const panel = page.locator('[data-object-transform-panel="ready"]');
    const size = fieldOf(panel, "frameBounds");
    await expect(size).toHaveAttribute("data-binding-state", "value");
    const before = (await objGet(page, addr(rect), "frameBounds")) as number[];
    const width = before[3] - before[1];
    await commitNumber(page, size.locator('input[aria-label="width"]'), Math.round(width + 12));
    await expect
      .poll(async () => {
        const b = (await objGet(page, addr(rect), "frameBounds")) as number[];
        return Math.round(b[3] - b[1]);
      })
      .toBe(Math.round(width + 12));
    await undoOnce(page);
    await expect.poll(() => objGet(page, addr(rect), "frameBounds")).toEqual(before);
  });

  test("OM-FRAME-4 — Attributes ▸ Nonprinting over a MULTI-selection: one batch, one undo step @feat:editor-shell.panels.attributes @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const two = frames.slice(0, 2);
    expect(two.length).toBe(2);
    await selectElements(page, two);
    await openPanel(page, "paged.attributes");
    const field = fieldOf(page.locator('[data-attributes-panel="ready"]'), "frameNonprinting");
    await expect(field).toHaveAttribute("data-value-type", "bool");
    const before = await Promise.all(two.map((r) => objGet(page, addr(r), "frameNonprinting")));
    await field.locator('[role="switch"]').click();
    for (const r of two) {
      await expect.poll(() => objGet(page, addr(r), "frameNonprinting")).toBe(true);
    }
    // ONE undo restores BOTH frames: the commit was one batch.
    await undoOnce(page);
    for (const [i, r] of two.entries()) {
      await expect.poll(() => objGet(page, addr(r), "frameNonprinting")).toEqual(before[i]);
    }
  });

  test("OM-FRAME-5 — Frame fitting ▸ Auto-fit (schema field): set → host.objects → one undo @feat:editor-shell.panels.frame-fitting @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.frame-fitting");
    const field = fieldOf(page.locator('[data-frame-fitting-panel="ready"]'), "frameAutoFit");
    await expect(field).toHaveAttribute("data-value-type", "bool");
    const before = await objGet(page, addr(rect), "frameAutoFit");
    await field.locator('[role="switch"]').click();
    await expect.poll(() => objGet(page, addr(rect), "frameAutoFit")).toBe(before !== true);
    await undoOnce(page);
    await expect.poll(() => objGet(page, addr(rect), "frameAutoFit")).toEqual(before);
  });
});
