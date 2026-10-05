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

// Journey: paged.draw TRANSFORM — Reflect horizontally / vertically,
// Reflect… (typed axis, the Path Options panel's Reflect section) and
// Transform again (Draw ▸ Transform).
//
// A reflection is written as `R ∘ M` through `frameTransform`, about the
// centre of the SELECTION's page box, in one batch (one undo step). So
// the oracle is the element's own item transform read back through the
// inspector — the exact matrix, not "something moved":
//   · Reflect horizontally — the axis is vertical through the centre
//     cx: [-1, 0, 0, 1, 2·cx, 0].
//   · Reflect vertically — the axis is horizontal through cy:
//     [1, 0, 0, -1, 0, 2·cy].
//   · Transform again — repeats the LAST reflection on the current
//     selection; reflecting twice about the same axis is the identity,
//     so the matrix returns to identity and the page renders as before.
//   · Reflect… — raises the panel at its section (mutating nothing);
//     Apply with a typed axis angle writes that reflection, and is what
//     Transform again then repeats.
//
// The artwork is an asymmetric filled triangle so a reflection is
// VISIBLE (a mirrored rectangle renders identically) — the render
// oracle backs each matrix assertion with a pixel change.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;
type Ref = { kind: string; id: string };
type Affine = [number, number, number, number, number, number];

/** The element's item transform (`frameTransform`), identity when unset. */
async function transformOf(page: Page, ref: Ref): Promise<Affine> {
  return page.evaluate(async (r) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementProperties: (id: unknown) => Promise<{
              entries?: Array<{ path: string; value?: { type: string; value?: unknown } | null }>;
            } | null>;
          };
        };
      }
    ).__canvas;
    const props = await c.client.elementProperties(r).catch(() => null);
    for (const e of props?.entries ?? []) {
      if (e.path === "frameTransform" && e.value?.type === "transform" && e.value.value) {
        return e.value.value as [number, number, number, number, number, number];
      }
    }
    return [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number];
  }, ref);
}

/** The element's untransformed page box `[top, left, bottom, right]`. */
async function boundsOf(page: Page, ref: Ref): Promise<[number, number, number, number]> {
  return page.evaluate(async (r) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (
              ids: unknown[],
            ) => Promise<Array<{ bounds: [number, number, number, number] }>>;
          };
        };
      }
    ).__canvas;
    const g = await c.client.elementGeometry([r]);
    return g[0]!.bounds;
  }, ref);
}

/** Matrix equality to 1e-3 (the engine stores f32; sin(π) leaks 1e-16). */
function near(actual: Affine, expected: Affine): boolean {
  return actual.every((v, i) => Math.abs(v - expected[i]!) < 1e-3);
}

async function expectTransform(page: Page, ref: Ref, expected: Affine, what: string) {
  await expect
    .poll(async () => {
      const m = await transformOf(page, ref);
      return near(m, expected) ? "match" : JSON.stringify(m);
    }, { timeout: 8_000, message: `${what}: expected ${JSON.stringify(expected)}` })
    .toBe("match");
}

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** A filled right triangle — asymmetric about both axes. */
async function triangle(designer: Designer): Promise<Ref> {
  const id = await designer.drawPath([
    [160, 180],
    [420, 180],
    [160, 380],
    [160, 180],
  ]);
  expect(id, "drew a triangle").not.toBe("");
  await designer.applyFill("polygon", id, "Color/Black");
  return { kind: "polygon", id };
}

test.describe("journey · paged.draw transform", () => {
  test("a designer reflects horizontally and vertically, then repeats it with Transform again @feat:geometry-coordinates.item-transform @feat:plugin-draw.pro-path-toolset @feat:plugin-platform.command-registration @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    const ref = await triangle(designer);
    await designer.selectElement(ref.kind, ref.id);
    expect(near(await transformOf(page, ref), IDENTITY), "starts untransformed").toBe(true);
    const [top, left, bottom, right] = await boundsOf(page, ref);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    await designer.expectRenderChangesFrom(blankA);
    const original = await designer.renderBytes();

    // ── 1. TRANSFORM AGAIN WITH NOTHING TO REPEAT — an honest no-op. ──
    await designer.runCommand("media.paged.draw.command.transformAgain");
    await page.waitForTimeout(300);
    expect(near(await transformOf(page, ref), IDENTITY), "nothing to repeat yet").toBe(true);

    // ── 2. REFLECT HORIZONTALLY — mirror left ↔ right about cx. ──
    await designer.runCommand("media.paged.draw.command.reflectHorizontal");
    await expectTransform(page, ref, [-1, 0, 0, 1, 2 * cx, 0], "reflect horizontally");
    // The page box is unchanged — the mirror is about the box's own centre.
    const [t2, l2, b2, r2] = await boundsOf(page, ref);
    expect(Math.abs(l2 - left) + Math.abs(r2 - right) + Math.abs(t2 - top) + Math.abs(b2 - bottom)).toBeLessThan(0.01);
    await designer.expectRenderChangesFrom(original);

    // ── 3. TRANSFORM AGAIN — repeats the horizontal mirror; twice about
    //    the same axis is the identity, and the page renders as before. ──
    await designer.runCommand("media.paged.draw.command.transformAgain");
    await expectTransform(page, ref, IDENTITY, "transform again (horizontal ∘ horizontal)");
    await expect
      .poll(async () => designer.renderDiffPixels(original, await designer.renderBytes()), {
        timeout: 8_000,
      })
      .toBeLessThanOrEqual(16);

    // ── 4. REFLECT VERTICALLY — mirror top ↔ bottom about cy. ──
    await designer.runCommand("media.paged.draw.command.reflectVertical");
    await expectTransform(page, ref, [1, 0, 0, -1, 0, 2 * cy], "reflect vertically");
    await designer.expectRenderChangesFrom(original);

    // ── 5. TRANSFORM AGAIN now repeats the VERTICAL one (the memory is
    //    the last transform, not the first). ──
    await designer.runCommand("media.paged.draw.command.transformAgain");
    await expectTransform(page, ref, IDENTITY, "transform again (vertical ∘ vertical)");

    // ── 6. UNDO — each reflect is ONE step: undoing the repeat puts the
    //    vertical mirror back, exactly. ──
    await designer.runCommand("paged.editor.undo");
    await expectTransform(page, ref, [1, 0, 0, -1, 0, 2 * cy], "undo of transform again");
  });

  test("a designer reflects across a typed axis in the Reflect… options panel @feat:geometry-coordinates.item-transform @feat:plugin-draw.pro-path-toolset @feat:plugin-platform.panel-registration @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const ref = await triangle(designer);
    await designer.selectElement(ref.kind, ref.id);
    const [top, left, bottom, right] = await boundsOf(page, ref);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const original = await designer.renderBytes();

    // ── 1. THE "…" COMMAND RAISES THE PANEL AT REFLECT — no write. ──
    await designer.runCommand("media.paged.draw.command.reflectOptions");
    const panel = page.locator('[data-draw-pathopts-panel="reflect"]');
    await expect(panel, "the Path Options panel opened at Reflect").toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.locator('[data-draw-pathopts-section="reflect"][data-draw-pathopts-open="true"]'),
    ).toBeVisible();
    const apply = page.locator('[data-draw-pathopts-apply="reflect"]');
    await expect(apply, "the button names the selection it will reflect").toHaveText(
      "Reflect 1 object",
    );
    expect(near(await transformOf(page, ref), IDENTITY), "opening the panel wrote nothing").toBe(
      true,
    );

    // ── 2. TYPE AN AXIS — 0° is the horizontal axis (top ↔ bottom) —
    //    and Apply. ──
    await page.locator('[data-draw-pathopts-field="reflect.angleDeg"]').fill("0");
    await apply.click();
    await expectTransform(page, ref, [1, 0, 0, -1, 0, 2 * cy], "Reflect… at 0°");
    await designer.expectRenderChangesFrom(original);

    // ── 3. TRANSFORM AGAIN repeats what the PANEL applied. ──
    await designer.runCommand("media.paged.draw.command.transformAgain");
    await expectTransform(page, ref, IDENTITY, "transform again after Reflect…");

    // ── 4. A 90° axis is the horizontal mirror — the typed angle, not a
    //    fixed one, drives the matrix. ──
    await page.locator('[data-draw-pathopts-field="reflect.angleDeg"]').fill("90");
    await apply.click();
    await expectTransform(page, ref, [-1, 0, 0, 1, 2 * cx, 0], "Reflect… at 90°");

    // ── 5. REFLECT ▸ COPY — the engine carries `duplicateElements`
    //    (protocol 65+), so the Copy box enables; Apply leaves the
    //    untouched clone above and reflects the source back. ──
    const copy = page.locator('[data-draw-pathopts-toggle="reflect.copy"]');
    await expect(copy, "Copy is offered on this engine").toBeEnabled({ timeout: 8_000 });
    await copy.check();
    const polysBefore = await designer.count("polygon");
    await apply.click();
    await expect
      .poll(() => designer.count("polygon"), { timeout: 8_000 })
      .toBe(polysBefore + 1);
    await expectTransform(page, ref, IDENTITY, "Reflect ▸ Copy reflects the source");

    // ── 6. UNDO — the copy and the reflection are ONE step. ──
    await designer.runCommand("paged.editor.undo");
    await expect
      .poll(() => designer.count("polygon"), { timeout: 8_000 })
      .toBe(polysBefore);
    await expectTransform(page, ref, [-1, 0, 0, 1, 2 * cx, 0], "undo of Reflect ▸ Copy");
  });
});
