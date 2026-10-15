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

// The Effects rows engine 0.71.8 added (core ADR 135), each set through
// the editor's own control and read back from the ENGINE (`RequestGet`,
// past the object model), then undone in one step:
//
//   · the transparency targets — Stroke, Fill and Text each with their
//     own opacity and blend mode (Effects panel ▸ target list); an
//     opacity edit must change the render;
//   · a group's Isolate blending and Knockout group;
//   · the drop shadow's blend mode, spread, noise, "object knocks out
//     shadow" and "use global light";
//   · the document's global light, from Object ▸ Effects ▸ Global light…
//     (command `paged.effects.globalLight`).

import { expect, test, type Locator, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";
import { loadFixture, type ElementRef, type PageInfo } from "./e2e/harness/fixtures";
import { mutate, selectElements } from "./e2e/harness/ui";
import { fieldOf, undoOnce } from "./e2e/harness/objects";
import { engineGet, expectRenderChange, pageRender } from "./e2e/harness/engine";

const addr = (r: ElementRef) => `${r.kind}:${r.id}`;

async function setProp(page: Page, ref: ElementRef, path: string, value: unknown) {
  await mutate(page, { op: "setElementProperty", args: { elementId: ref, path, value } });
}

async function commitNumber(field: Locator, value: number) {
  const input = field.locator("input").first();
  await input.click();
  await input.fill(String(value));
  await input.press("Enter");
}

async function effectsPanel(page: Page): Promise<Locator> {
  await openPanel(page, "paged.effects");
  const panel = page.locator('[data-effects-panel="ready"]');
  await expect(panel).toBeVisible();
  return panel;
}

interface TargetCase {
  target: "stroke" | "fill" | "content";
  label: string;
  opacity: string;
  blend: string;
  fixture: "geometry" | "text";
  kind: "rectangle" | "textFrame";
}

const TARGETS: TargetCase[] = [
  { target: "stroke", label: "Stroke", opacity: "frameStrokeOpacity", blend: "frameStrokeBlendMode", fixture: "geometry", kind: "rectangle" },
  { target: "fill", label: "Fill", opacity: "frameFillOpacity", blend: "frameFillBlendMode", fixture: "geometry", kind: "rectangle" },
  { target: "content", label: "Text", opacity: "frameContentOpacity", blend: "frameContentBlendMode", fixture: "text", kind: "textFrame" },
];

/** Load the case's fixture and select a frame whose target paints: a
 *  rectangle gets a black fill and an 8 pt black stroke, a text frame
 *  keeps its text. */
async function selectTargetFrame(page: Page, c: TargetCase): Promise<{ ref: ElementRef; page0: PageInfo }> {
  const fx = await loadFixture(page, c.fixture);
  const ref = (c.kind === "rectangle" ? fx.firstRectangle : fx.firstTextFrame) as ElementRef;
  expect(ref, `${c.fixture} has a ${c.kind}`).not.toBeNull();
  if (c.kind === "rectangle") {
    await setProp(page, ref, "frameFillColor", { type: "colorRef", value: "Color/Black" });
    await setProp(page, ref, "frameStrokeColor", { type: "colorRef", value: "Color/Black" });
    await setProp(page, ref, "frameStrokeWeight", { type: "length", value: 8 });
  }
  await selectElements(page, [ref]);
  return { ref, page0: fx.pages[0] };
}

test.describe("Effects ▸ transparency targets (engine 0.71.8)", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  for (const c of TARGETS) {
    test(`EFX-TARGET-${c.target}-opacity — the ${c.label} target's opacity: set in the Effects panel → engine ${c.opacity}, the render changes, one undo @feat:editor-shell.panels.effects @feat:effects-transparency.opacity @feat:round-tripping.undo-redo @level:happy`, async ({
      page,
    }) => {
      const { ref, page0 } = await selectTargetFrame(page, c);
      const panel = await effectsPanel(page);
      await panel.locator(`[data-effects-target="${c.target}"]`).click();
      await expect(panel).toHaveAttribute("data-effects-target-active", c.target);
      const field = fieldOf(panel, c.opacity);
      await expect(field).toHaveAttribute("data-binding-state", "value");
      const before = await engineGet(page, addr(ref), c.opacity);
      const objectBefore = await engineGet(page, addr(ref), "frameOpacity");
      const render = await pageRender(page, page0);
      await commitNumber(field, 40);
      await expect.poll(() => engineGet(page, addr(ref), c.opacity)).toBe(40);
      await expectRenderChange(page, page0, render);
      // The target list shows the new setting.
      await expect(panel.locator(`[data-effects-target-summary="${c.target}"]`)).toHaveText(/40%/);
      // Only this target changed: the object's own opacity is untouched.
      expect(await engineGet(page, addr(ref), "frameOpacity")).toEqual(objectBefore);
      await undoOnce(page);
      await expect.poll(() => engineGet(page, addr(ref), c.opacity)).toEqual(before);
    });

    test(`EFX-TARGET-${c.target}-blend — the ${c.label} target's blend mode: set in the Effects panel → engine ${c.blend}, one undo @feat:editor-shell.panels.effects @feat:effects-transparency.blend-modes @feat:round-tripping.undo-redo @level:happy`, async ({
      page,
    }) => {
      const { ref } = await selectTargetFrame(page, c);
      const panel = await effectsPanel(page);
      await panel.locator(`[data-effects-target="${c.target}"]`).click();
      const field = fieldOf(panel, c.blend);
      await expect(field).toHaveAttribute("data-binding-state", "value");
      const before = await engineGet(page, addr(ref), c.blend);
      const objectBefore = await engineGet(page, addr(ref), "frameBlendMode");
      await field.locator("select").selectOption("Multiply");
      await expect.poll(() => engineGet(page, addr(ref), c.blend)).toBe("Multiply");
      await expect(panel.locator(`[data-effects-target-summary="${c.target}"]`)).toHaveText(/Multiply/);
      expect(await engineGet(page, addr(ref), "frameBlendMode")).toEqual(objectBefore);
      await undoOnce(page);
      await expect.poll(() => engineGet(page, addr(ref), c.blend)).toEqual(before);
    });
  }

  test("EFX-TARGET-labels — a text frame's content target reads Text, a graphic frame's Graphic; Object is the default target @feat:editor-shell.panels.effects @level:smoke", async ({
    page,
  }) => {
    const fx = await loadFixture(page, "geometry");
    await selectElements(page, [fx.firstRectangle as ElementRef]);
    const panel = await effectsPanel(page);
    await expect(panel).toHaveAttribute("data-effects-target-active", "object");
    await expect(panel.locator('[data-effects-target="content"]')).toContainText("Graphic");
    await selectElements(page, [fx.firstTextFrame as ElementRef]);
    await expect(panel.locator('[data-effects-target="content"]')).toContainText("Text");
  });
});

test.describe("Effects ▸ group options (engine 0.71.8)", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  for (const [path, label] of [
    ["groupIsolateBlending", "Isolate blending"],
    ["groupKnockout", "Knockout group"],
  ] as const) {
    test(`EFX-GROUP-${path} — ${label} on a group: toggled in the Effects panel → engine ${path}, one undo @feat:editor-shell.panels.effects @feat:effects-transparency.transparency-groups @feat:round-tripping.undo-redo @level:happy`, async ({
      page,
    }) => {
      const fx = await loadFixture(page, "geometry-groups");
      const group = fx.firstGroup as ElementRef;
      expect(group, "geometry-groups has a group").not.toBeNull();
      await selectElements(page, [group]);
      const panel = await effectsPanel(page);
      // A group has only the Object target.
      await expect(panel.locator("[data-effects-target]")).toHaveCount(1);
      const field = fieldOf(panel, path);
      const toggle = field.locator('[role="switch"]');
      await expect(toggle).toBeEnabled();
      expect(await engineGet(page, addr(group), path)).toBe(false);
      await toggle.click();
      await expect.poll(() => engineGet(page, addr(group), path)).toBe(true);
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await undoOnce(page);
      await expect.poll(() => engineGet(page, addr(group), path)).toBe(false);
    });
  }

  test("EFX-GROUP-frame — on a frame the group options are disabled (a frame carries neither) @feat:editor-shell.panels.effects @feat:effects-transparency.transparency-groups @level:edge", async ({
    page,
  }) => {
    const fx = await loadFixture(page, "geometry-groups");
    await selectElements(page, [fx.firstRectangle as ElementRef]);
    const panel = await effectsPanel(page);
    await expect(panel.locator("[data-effects-target]")).toHaveCount(4);
    for (const path of ["groupIsolateBlending", "groupKnockout"]) {
      await expect(fieldOf(panel, path).locator('[role="switch"]')).toBeDisabled();
    }
  });
});

interface ShadowCase {
  path: string;
  label: string;
  set: (field: Locator) => Promise<void>;
  expected: unknown;
}

const SHADOW: ShadowCase[] = [
  {
    path: "frameDropShadowBlendMode",
    label: "blend mode",
    set: (f) => f.locator("select").selectOption("Normal").then(() => undefined),
    expected: "Normal",
  },
  { path: "frameDropShadowSpread", label: "spread", set: (f) => commitNumber(f, 30), expected: 30 },
  { path: "frameDropShadowNoise", label: "noise", set: (f) => commitNumber(f, 20), expected: 20 },
  {
    path: "frameDropShadowKnockedOut",
    label: "object knocks out shadow",
    set: (f) => f.locator('[role="switch"]').click(),
    expected: false,
  },
  {
    path: "frameDropShadowUseGlobalLight",
    label: "use global light",
    set: (f) => f.locator('[role="switch"]').click(),
    expected: true,
  },
];

test.describe("Effects ▸ drop shadow options (engine 0.71.8)", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  for (const c of SHADOW) {
    test(`EFX-SHADOW-${c.path} — the drop shadow's ${c.label}: set in its disclosure → engine ${c.path}, one undo @feat:editor-shell.panels.effects @feat:effects-transparency.drop-shadow @feat:round-tripping.undo-redo @level:happy`, async ({
      page,
    }) => {
      const fx = await loadFixture(page, "geometry");
      const rect = fx.firstRectangle as ElementRef;
      await selectElements(page, [rect]);
      const panel = await effectsPanel(page);
      await fieldOf(panel, "frameDropShadow").locator('[role="switch"]').click();
      await expect.poll(() => engineGet(page, addr(rect), "frameDropShadow")).toBe(true);
      const fields = panel.locator('[data-effect-fields="Drop shadow"]');
      const field = fieldOf(fields, c.path);
      await expect(field).toHaveAttribute("data-binding-state", "value");
      const before = await engineGet(page, addr(rect), c.path);
      expect(before).not.toEqual(c.expected);
      await c.set(field);
      await expect.poll(() => engineGet(page, addr(rect), c.path)).toEqual(c.expected);
      await undoOnce(page);
      await expect.poll(() => engineGet(page, addr(rect), c.path)).toEqual(before);
      // The shadow itself is still on: the undo took exactly one step.
      expect(await engineGet(page, addr(rect), "frameDropShadow")).toBe(true);
    });
  }
});

async function openGlobalLight(page: Page): Promise<Locator> {
  await page.locator('[data-menu-trigger="Object"]').click();
  await page.locator('[data-menu-submenu="Effects"]').click();
  await page.getByRole("menuitem", { name: "Global light…" }).click();
  const dialog = page.locator("[data-global-light-dialog]");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("Object ▸ Effects ▸ Global light… (engine 0.71.8)", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  test("EFX-GLOBAL-LIGHT-angle — the document's global light angle: set in the dialog → engine doc.documentGlobalLightAngle; a shadow that uses the global light moves; one undo @feat:editor-shell.panels.effects @feat:effects-transparency.drop-shadow @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const fx = await loadFixture(page, "geometry");
    const rect = fx.firstRectangle as ElementRef;
    // A visible shadow that follows the global light.
    await setProp(page, rect, "frameFillColor", { type: "colorRef", value: "Color/Black" });
    await setProp(page, rect, "frameDropShadow", { type: "bool", value: true });
    await setProp(page, rect, "frameDropShadowUseGlobalLight", { type: "bool", value: true });
    await setProp(page, rect, "frameDropShadowXOffset", { type: "length", value: 9 });
    await setProp(page, rect, "frameDropShadowYOffset", { type: "length", value: 9 });
    const before = await engineGet(page, "doc", "documentGlobalLightAngle");
    const render = await pageRender(page, fx.pages[0]);
    const dialog = await openGlobalLight(page);
    await commitNumber(fieldOf(dialog, "documentGlobalLightAngle"), 300);
    await expect.poll(() => engineGet(page, "doc", "documentGlobalLightAngle")).toBe(300);
    await expectRenderChange(page, fx.pages[0], render);
    await dialog.locator("[data-global-light-done]").click();
    await expect(dialog).toHaveCount(0);
    await undoOnce(page);
    await expect.poll(() => engineGet(page, "doc", "documentGlobalLightAngle")).toEqual(before);
  });

  test("EFX-GLOBAL-LIGHT-altitude — the document's global light altitude: set in the dialog → engine doc.documentGlobalLightAltitude, one undo @feat:editor-shell.panels.effects @feat:effects-transparency.bevel-emboss @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadFixture(page, "geometry");
    const before = await engineGet(page, "doc", "documentGlobalLightAltitude");
    const dialog = await openGlobalLight(page);
    await commitNumber(fieldOf(dialog, "documentGlobalLightAltitude"), 55);
    await expect.poll(() => engineGet(page, "doc", "documentGlobalLightAltitude")).toBe(55);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await undoOnce(page);
    await expect.poll(() => engineGet(page, "doc", "documentGlobalLightAltitude")).toEqual(before);
  });
});
