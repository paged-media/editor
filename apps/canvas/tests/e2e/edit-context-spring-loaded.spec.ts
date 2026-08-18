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

// E2E — spring-loaded tool overrides must NOT exit a modal edit
// context (the K-1 `toolIds: []` class; audit 17082026).
//
// The ADR-024 leave-by-tool rule ("picking a tool the context does not
// own commits the context") once watched `effectiveTool`. A
// spring-loaded hold — Space → momentary Hand, and the bare Meta
// keydown that begins EVERY Cmd chord → momentary Direct Selection —
// pushes a transient OVERRIDE onto the tool stack, so for a context
// declaring `toolIds: []` the Meta-down of Cmd-Z read as "left by
// tool" and COMMITTED the session before the `z` even arrived; the
// undo then hit the document stack. The fix: the rule watches the
// deliberate `toolState.base`, never the override-inclusive effective
// tool. This spec pins that against regression.
//
// WHY A SYNTHETIC CONTEXT, not the sheet fixture path: the published
// @paged-media/sheet canary this tree consumes (0.1.0-canary.5)
// declares NO `toolIds` — its frame gets `toolIds: null`, for which
// the leave-by-tool rule is inert BY DESIGN (null = "declared
// nothing"), so the sheet path could never fail even with the bug
// present (a vacuous pin). The class under test is `toolIds: []` — an
// explicit "no canvas tool applies here". We register a minimal
// context of exactly that class through the `__canvas.registries`
// test handle and enter it through the REAL double-click resolution
// (object type → edit context), then drive the REAL keyboard path.
// The existing toolIds specs are restrictionOf mirrors — structurally
// blind to the override lane; this spec asserts through the live
// spring-load machinery, with the rail's active slot as the witness
// that the override actually engaged (the exact precondition under
// which the old code committed the context).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

const CONTEXT_TYPE = "e2eSpringLoad";

interface ElementRef {
  kind: string;
  id: string;
}

/** First element of `kind` in document order (worker tree walk). */
async function firstOfKind(
  page: Page,
  kind: string,
): Promise<ElementRef | null> {
  return page.evaluate(async (k) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string; id: string } | null;
      children?: unknown[];
    }>;
    let found: { kind: string; id: string } | null = null;
    const visit = (node: {
      id?: { kind: string; id: string } | null;
      children?: unknown[];
    }) => {
      if (found) return;
      if (node.id && node.id.kind === k) {
        found = node.id;
        return;
      }
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return found;
  }, kind);
}

/** Screen point at the centre of an element's transformed page-0 bounds. */
async function elementScreenCenter(
  page: Page,
  ref: ElementRef,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async (id) => {
    let best: HTMLCanvasElement | null = null;
    let bestArea = 0;
    for (const cv of Array.from(document.querySelectorAll("canvas"))) {
      const r = cv.getBoundingClientRect();
      if (r.width * r.height > bestArea) {
        bestArea = r.width * r.height;
        best = cv;
      }
    }
    const wrap = (best?.parentElement ?? best)!.getBoundingClientRect();
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            camera: { read: () => { scale: number; tx: number; ty: number } };
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{
                bounds: [number, number, number, number];
                itemTransform?:
                  [number, number, number, number, number, number] | null;
              }>
            >;
          };
        };
      }
    ).__canvas;
    const items = await c.client.elementGeometry([id]);
    const item = items[0];
    if (!item) return null;
    const [top, left, bottom, right] = item.bounds;
    const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const px = a * cx + cc * cy + tx;
    const py = b * cx + d * cy + ty;
    const cam = c.client.camera.read();
    return {
      x: wrap.left + px * cam.scale + cam.tx,
      y: wrap.top + py * cam.scale + cam.ty,
    };
  }, ref);
}

/** The active edit-context type via the debugContext oracle (a second
 *  witness beside the breadcrumb DOM). */
async function activeContextType(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const c = (
      globalThis as unknown as {
        __canvas?: {
          debugContext?: () => {
            editContext?: { type?: string } | null;
          };
        };
      }
    ).__canvas;
    return c?.debugContext?.().editContext?.type ?? null;
  });
}

async function fitHome(page: Page): Promise<void> {
  await page.keyboard.press("Home");
  await page.waitForTimeout(1200);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __canvas: {
                  client: { camera: { read: () => { scale: number } } };
                };
              }
            ).__canvas.client.camera.read().scale,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0.2);
}

/** Register the minimal `toolIds: []` context + an object type that
 *  routes a rectangle double-click into it (object types are consulted
 *  BEFORE kind-matched contexts, so this wins over paged.draw's
 *  vectorGraphic claim without touching any bundle). */
async function registerSpringLoadContext(page: Page): Promise<void> {
  await page.evaluate((type) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            editContexts: { register: (c: unknown) => unknown };
            objectTypes: { register: (c: unknown) => unknown };
          };
        };
      }
    ).__canvas;
    c.registries.editContexts.register({
      type,
      entry: "doubleClick",
      // THE CLASS UNDER TEST — an explicit empty declaration: "no
      // canvas tool edits this content". NOT the same as omitting it
      // (null = unrestricted, the leave-by-tool rule is inert).
      toolIds: [],
      panelIds: [],
    });
    c.registries.objectTypes.register({
      type,
      matches: (cand: { kind?: string }) => cand.kind === "rectangle",
      editContextType: type,
      bakedFallback: "rectangle",
    });
  }, CONTEXT_TYPE);
}

/** Double-click the geometry fixture's first rectangle and wait for
 *  the synthetic context's breadcrumb. */
async function enterContext(page: Page): Promise<void> {
  const rect = await firstOfKind(page, "rectangle");
  expect(rect, "geometry fixture has a rectangle").not.toBeNull();
  const at = await elementScreenCenter(page, rect!);
  expect(at, "rectangle resolves to a screen point").not.toBeNull();
  await page.mouse.dblclick(at!.x, at!.y);
  await expect(
    page.locator(
      `[data-edit-context-breadcrumb] [data-edit-context-crumb="${CONTEXT_TYPE}"]`,
    ),
  ).toBeVisible({ timeout: 5_000 });
  expect(await activeContextType(page)).toBe(CONTEXT_TYPE);
}

test.describe("E2E edit-context spring-load (K-1 toolIds:[] × override lane)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (globalThis as unknown as { __canvas: { ready: boolean } })
                .__canvas.ready,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await fitHome(page);
    await registerSpringLoadContext(page);
  });

  test("AC-SPRING-1 — a Cmd/Meta chord does not exit a toolIds:[] context @feat:plugin-platform.modal-edit-session @level:edge", async ({
    page,
  }) => {
    await enterContext(page);
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");

    // Bare Meta down — the first half of EVERY Cmd chord. The spring
    // hook pushes the momentary Direct Selection override; the rail's
    // active slot moving to directSelect is the WITNESS the override
    // engaged (the exact stimulus the old effectiveTool-watching rule
    // misread as "left by tool").
    await page.keyboard.down("Meta");
    await expect(
      page.locator(
        '[data-tool-rail="ready"] [data-tool="paged.tool.directSelect"]',
      ),
    ).toHaveAttribute("data-active", "true", { timeout: 5_000 });
    // Mid-hold the context must still be active.
    await expect(breadcrumb).toBeVisible();
    expect(await activeContextType(page)).toBe(CONTEXT_TYPE);
    await page.keyboard.up("Meta");

    // Released: override popped, context STILL active.
    await expect(
      page.locator(
        '[data-tool-rail="ready"] [data-tool="paged.tool.directSelect"]',
      ),
    ).toHaveAttribute("data-active", "false", { timeout: 5_000 });
    await expect(breadcrumb).toBeVisible();
    expect(await activeContextType(page)).toBe(CONTEXT_TYPE);

    // The full chord that surfaced the defect (Cmd-Z): the context has
    // no onUndo, so the chord falls through to the app — either way it
    // must NOT commit/exit the context.
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    await expect(breadcrumb).toBeVisible();
    expect(await activeContextType(page)).toBe(CONTEXT_TYPE);

    // Esc still exits — the context is live, not wedged.
    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0, { timeout: 5_000 });
  });

  test("AC-SPRING-2 — a Space hold (hand spring-load) does not exit a toolIds:[] context @feat:plugin-platform.modal-edit-session @level:edge", async ({
    page,
  }) => {
    await enterContext(page);
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");

    // Space down → momentary Hand. The hand slot lighting up is the
    // witness the override engaged while held.
    await page.keyboard.down("Space");
    await expect(
      page.locator('[data-tool-rail="ready"] [data-tool="paged.tool.hand"]'),
    ).toHaveAttribute("data-active", "true", { timeout: 5_000 });
    await expect(breadcrumb).toBeVisible();
    expect(await activeContextType(page)).toBe(CONTEXT_TYPE);
    await page.keyboard.up("Space");

    // Released: back to the base tool, context STILL active.
    await expect(
      page.locator('[data-tool-rail="ready"] [data-tool="paged.tool.hand"]'),
    ).toHaveAttribute("data-active", "false", { timeout: 5_000 });
    await expect(breadcrumb).toBeVisible();
    expect(await activeContextType(page)).toBe(CONTEXT_TYPE);

    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0, { timeout: 5_000 });
  });
});
