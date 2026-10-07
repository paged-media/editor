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

// ADR 323 §12.8 — LIST and STRUCT values through the one PropertyField.
//
// A list of records (a gradient's stops, paged.draw's appearance stacks)
// renders as an item editor: each item's fields as their own widgets, plus
// add / remove / reorder. Every edit is ONE list edit the SDK lowers to a
// `set` of the whole value (plugin-sdk `editValue`) = ONE batch = ONE undo
// step, read back through `__canvas.objects` (the shared registry).
//
//   · a core path: `gradient:<id>` `stops` in the Gradient Options panel;
//   · a plugin path: `plugin:media.paged.draw/appearance/<item>` `fills`
//     and `strokes` in Object Options ▸ Appearance.

import { expect, test, type Locator, type Page } from "@playwright/test";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadIdml, openCanvas, openPanel } from "./fidelity/canvas-driver";
import { Designer } from "./journey/driver/designer";
import { objGet, objQuery, undoOnce } from "./e2e/harness/objects";

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixture = (name: string) => `${ROOT}/corpus/idml/generated/${name}.idml`;

type Stop = { stopColor: string; locationPct: number; midpointPct?: number | null };

const list = (scope: Locator, path: string) => scope.locator(`[data-property-list="${path}"]`).first();
const item = (l: Locator, index: number) => l.locator(`[data-list-item="${index}"]`);

async function typeNumber(scope: Locator, value: string) {
  const input = scope.locator("input").first();
  await input.click();
  await input.press("ControlOrMeta+a");
  await input.pressSequentially(value);
  await input.press("Enter");
}

async function swatchIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as {
      __canvas: { client: { collection(n: string): Promise<Array<{ selfId: string }>> } };
    }).__canvas.client;
    return (await c.collection("swatches")).map((s) => s.selfId);
  });
}

test.describe("ADR 323 §12.8 — list and struct values in PropertyField", () => {
  test.beforeEach(() => {
    test.setTimeout(120_000);
  });

  test("OM-VAL-1 — Gradient Options lists the stops; add, edit, reorder and remove a stop, each ONE undo step @feat:color-swatches.gradients @feat:editor-shell.panels.gradients @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, fixture("swatches"));
    const swatches = await swatchIds(page);
    const colors = swatches.filter((s) => s.startsWith("Color/") && !/\/(Black|Paper|Registration|None)$/.test(s));
    expect(colors.length, "the swatches fixture carries colours").toBeGreaterThan(1);
    const gradient = await page.evaluate(async (stops) => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: {
            mutate(m: unknown): Promise<unknown>;
            collection(n: string): Promise<Array<{ selfId: string; name?: string }>>;
          };
        };
      }).__canvas.client;
      const before = new Set((await c.collection("gradients")).map((g) => g.selfId));
      await c.mutate({
        op: "createGradient",
        args: {
          spec: {
            name: "OM Ramp",
            kind: "Linear",
            stops: [
              { stopColor: stops[0], locationPct: 0, midpointPct: 50 },
              { stopColor: stops[1], locationPct: 100 },
            ],
          },
        },
      });
      return (await c.collection("gradients")).find((g) => !before.has(g.selfId))?.selfId ?? "";
    }, [colors[0]!, colors[1]!]);
    expect(gradient, "created a gradient").not.toBe("");

    await openPanel(page, "paged.gradient-options");
    const panel = page.locator('[data-object-options-panel="gradient"]');
    await expect(panel).toBeVisible();
    const address = (await panel.getAttribute("data-options-target"))!;
    expect(address).toMatch(/^gradient:/);
    // Pick the one this test made (a blank document may carry others).
    await panel.locator(`[data-options-picker="gradient"]`).selectOption(`gradient:${gradient}`);
    const target = `gradient:${gradient}`;
    await expect(panel).toHaveAttribute("data-options-target", target);

    const before = (await objGet(page, target, "stops")) as Stop[];
    expect(before).toHaveLength(2);
    const stops = list(panel, "stops");
    await expect(stops).toHaveAttribute("data-list-length", "2");
    await expect(item(stops, 0).locator("[data-list-item-title]")).toHaveText(before[0]!.stopColor);
    await expect(item(stops, 0).locator('[data-struct-field="locationPct"]')).toBeVisible();

    // ADD — the panel's new item (Black at 100 %) appended: one set.
    await stops.locator("[data-list-add]").click();
    await expect.poll(async () => ((await objGet(page, target, "stops")) as Stop[]).length).toBe(3);
    const added = ((await objGet(page, target, "stops")) as Stop[])[2]!;
    expect(added.stopColor).toBe("Color/Black");
    expect(added.locationPct).toBe(100);
    await undoOnce(page);
    await expect.poll(() => objGet(page, target, "stops")).toEqual(before);

    // EDIT one field of one item — the other stop and fields stay.
    await typeNumber(item(stops, 0).locator('[data-struct-field="locationPct"]'), "25");
    await expect
      .poll(async () => ((await objGet(page, target, "stops")) as Stop[])[0]!.locationPct)
      .toBe(25);
    const edited = (await objGet(page, target, "stops")) as Stop[];
    expect(edited[0]!.stopColor).toBe(before[0]!.stopColor);
    expect(edited[1]).toEqual(before[1]);
    await undoOnce(page);
    await expect.poll(() => objGet(page, target, "stops")).toEqual(before);

    // REORDER — the second stop moves up.
    await item(stops, 1).locator("[data-list-move-up]").click();
    await expect
      .poll(async () => ((await objGet(page, target, "stops")) as Stop[]).map((s) => s.stopColor))
      .toEqual([before[1]!.stopColor, before[0]!.stopColor]);
    await undoOnce(page);
    await expect.poll(() => objGet(page, target, "stops")).toEqual(before);

    // REMOVE — and back in one undo.
    await item(stops, 1).locator("[data-list-remove]").click();
    await expect.poll(async () => ((await objGet(page, target, "stops")) as Stop[]).length).toBe(1);
    await undoOnce(page);
    await expect.poll(() => objGet(page, target, "stops")).toEqual(before);
  });

  test("OM-VAL-2 — Object Options ▸ Appearance: paged.draw's fill and stroke stacks are list rows; add a layer, edit it, reorder, remove — each ONE undo step @feat:plugin-draw.appearance @feat:plugin-draw.appearance-panel @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const D = "media.paged.draw";
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const pathId = await designer.drawPath([
      [180, 420],
      [320, 420],
      [250, 500],
    ]);
    expect(pathId, "authored a path").not.toBe("");
    await designer.selectElement("polygon", pathId);
    const appearance = `plugin:${D}/appearance/polygon:${pathId}`;
    expect(await objQuery(page, `polygon:${pathId} > plugin:${D}/appearance`)).toEqual([appearance]);
    const fillsBefore = ((await objGet(page, appearance, "fills")) as unknown[] | null) ?? [];

    await openPanel(page, "paged.object-options");
    const section = page.locator('[data-options-section="Appearance"]');
    if (!(await section.isVisible())) {
      await page.getByRole("button", { name: "Appearance" }).first().click();
    }
    const fills = list(section, "fills");
    await expect(fills).toHaveAttribute("data-list-length", String(fillsBefore.length), { timeout: 20_000 });

    // ADD a fill layer (the panel's new item), then a second.
    await fills.locator("[data-list-add]").click();
    await expect
      .poll(async () => ((await objGet(page, appearance, "fills")) as unknown[]).length)
      .toBe(fillsBefore.length + 1);
    await fills.locator("[data-list-add]").click();
    await expect
      .poll(async () => ((await objGet(page, appearance, "fills")) as unknown[]).length)
      .toBe(fillsBefore.length + 2);
    const two = (await objGet(page, appearance, "fills")) as Array<{ tint: number; opacity: number }>;

    // EDIT the opacity of the bottom layer (value index 0).
    const bottom = item(fills, fillsBefore.length);
    await typeNumber(bottom.locator('[data-struct-field="opacity"]'), "40");
    await expect
      .poll(async () => ((await objGet(page, appearance, "fills")) as Array<{ opacity: number }>)[fillsBefore.length]!.opacity)
      .toBe(40);
    await undoOnce(page);
    await expect.poll(() => objGet(page, appearance, "fills")).toEqual(two);

    // The stack lists TOP first: the first rendered item is the last value.
    const rendered = await fills.locator("[data-list-item]").evaluateAll((els) =>
      els.map((e) => Number(e.getAttribute("data-list-item"))),
    );
    expect(rendered[0]).toBe(fillsBefore.length + 1);

    // REMOVE the top layer: one step back.
    await item(fills, fillsBefore.length + 1).locator("[data-list-remove]").click();
    await expect
      .poll(async () => ((await objGet(page, appearance, "fills")) as unknown[]).length)
      .toBe(fillsBefore.length + 1);
    await undoOnce(page);
    await expect.poll(() => objGet(page, appearance, "fills")).toEqual(two);

    // The stroke stack renders its own fields (weight, not tint).
    const strokes = list(section, "strokes");
    await strokes.locator("[data-list-add]").click();
    await expect
      .poll(async () => ((await objGet(page, appearance, "strokes")) as unknown[] | null)?.length ?? 0)
      .toBeGreaterThan(0);
    await expect(strokes.locator('[data-struct-field="weight"]').first()).toBeVisible();
    await expect(strokes.locator('[data-struct-field="tint"]')).toHaveCount(0);
  });

  test("OM-VAL-3 — clearing a nullable enum (a paragraph's Start paragraph back to its style) is ONE write of null, one undo @feat:editor-shell.panels.paragraph @feat:round-tripping.undo-redo @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, fixture("text"));
    const r = await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: { executeScript(s: string): Promise<{ output: string[] }> };
          objects: {
            set(a: string, p: string, v: unknown): Promise<{ applied: boolean; reason?: string }>;
            get(a: string, p: string): Promise<{ kind: string; value?: unknown }>;
          };
        };
      }).__canvas;
      const stories = JSON.parse((await c.client.executeScript("paged.stories()")).output.join("")) as Array<{
        selfId?: string;
        id?: string;
      }>;
      const a = `storyRange:${stories[0]!.selfId ?? stories[0]!.id}@0..3`;
      const original = await c.objects.get(a, "paragraphStartParagraph");
      const set = await c.objects.set(a, "paragraphStartParagraph", "NextPage");
      const afterSet = await c.objects.get(a, "paragraphStartParagraph");
      const cleared = await c.objects.set(a, "paragraphStartParagraph", null);
      const afterClear = await c.objects.get(a, "paragraphStartParagraph");
      return { a, original, set, afterSet, cleared, afterClear };
    });
    expect(r.set.applied, r.set.reason).toBe(true);
    expect(r.afterSet).toEqual({ kind: "value", value: "NextPage" });
    expect(r.cleared.applied, r.cleared.reason).toBe(true);
    expect(r.afterClear, "the style's value again").toEqual(r.original);
    await undoOnce(page);
    await expect.poll(() => objGet(page, r.a, "paragraphStartParagraph")).toBe("NextPage");
  });
});
