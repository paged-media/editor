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

// E2E — the W3.2 EDIT-CONTEXT registry (closes plugin-draw B-02 +
// plugin-web W-03) through the REAL editor on :5180. Both first-party
// bundles arrive via loadBundle in main.tsx (draw + web), so this suite
// proves the double-click ROUTING the registry adds:
//
//   AC-EDITCTX-1  double-click a POLYGON enters the paged.draw
//                 vectorGraphic edit context — the breadcrumb shows
//                 "Vector graphic", and Esc pops it back out (B-02);
//   AC-EDITCTX-2  insert a webFrame, double-click it → the paged.web
//                 webFrame object type routes to its source edit context
//                 (the source panel is raised), NOT group descent (W-03).
//
// The breadcrumb (`[data-edit-context-breadcrumb]`) is the user-visible
// proof the context is active; it renders ONLY while a context is on the
// stack (the default surface is unchanged).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

const SOURCE_PANEL = "media.paged.web.panel.source";
const INSERT_COMMAND = "media.paged.web.command.insertWebFrame";

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
                  | [number, number, number, number, number, number]
                  | null;
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

async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
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
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

async function invokeCommand(page: Page, id: string): Promise<void> {
  await page.evaluate(async (commandId) => {
    await (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (id: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas.registries.commands.invoke(commandId);
  }, id);
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

test.describe("E2E edit-context (W3.2 — B-02 + W-03)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    // React path so ViewportCanvas mounts (the double-click entry lives
    // in its onDoubleClick handler).
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
  });

  test("AC-EDITCTX-1 — double-click a path element enters the vectorGraphic context; Esc pops", async ({
    page,
  }) => {
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    // No context active on a fresh load — the chrome is absent.
    await expect(breadcrumb).toHaveCount(0);

    // A path-bearing element (the geometry fixture's rectangles carry a
    // path anchor table — the Track-J fan-out paged.draw claims by kind).
    // It has NO web metadata, so the webFrame object type does NOT claim
    // it; the vectorGraphic edit context (kind-matched) does.
    const path = await firstOfKind(page, "rectangle");
    expect(path, "geometry fixture has a path element").not.toBeNull();
    const at = await elementScreenCenter(page, path!);
    expect(at, "element resolves to a screen point").not.toBeNull();

    // Double-click the path → paged.draw's vectorGraphic edit context.
    await page.mouse.dblclick(at!.x, at!.y);

    // The breadcrumb appears with the "Vector graphic" crumb (the type,
    // title-cased) — the user-visible proof the context is active.
    await expect(breadcrumb).toBeVisible({ timeout: 5_000 });
    await expect(
      breadcrumb.locator('[data-edit-context-crumb="vectorGraphic"]'),
    ).toHaveText(/Vector graphic/);

    // Tool-set restriction (the K-1 residual, now enforced): the context
    // declares its anchor tools, so a NON-context rail tool dims…
    const selectSlot = page.locator(
      '[data-tool-rail="ready"] [data-tool="paged.tool.select"]',
    );
    await expect(selectSlot).toHaveAttribute("data-context-dimmed", "true");
    // …while a context tool does not.
    await expect(
      page.locator(
        '[data-tool-rail="ready"] [data-tool="media.paged.draw.tool.addAnchor"]',
      ),
    ).not.toHaveAttribute("data-context-dimmed", "true");
    // Picking a dimmed tool is an EXIT, not a trap: it commits the
    // context and activates the tool.
    await selectSlot.click();
    await expect(breadcrumb).toHaveCount(0, { timeout: 5_000 });

    // Re-enter, then Esc pops one level → back to the default surface.
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(breadcrumb).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0, { timeout: 5_000 });
  });

  test("AC-EDITCTX-2 — double-click a webFrame raises its source edit context (object type → context)", async ({
    page,
  }) => {
    // Insert a webFrame (a rectangle with attached source metadata); it
    // is selected and the source panel opens.
    await invokeCommand(page, INSERT_COMMAND);
    const frame = await expect
      .poll(() => selectedElement(page), { timeout: 5_000 })
      .not.toBeNull()
      .then(() => selectedElement(page));
    expect(frame).not.toBeNull();

    // Close the source panel so the double-click RE-raising it is the
    // load-bearing proof (not the insert's own open).
    await page.evaluate(async (id) => {
      await (
        globalThis as unknown as {
          __canvas: {
            registries: {
              commands: { invoke: (id: string) => Promise<unknown> };
            };
          };
        }
      ).__canvas.registries.commands.invoke(`paged.panel.hide.${id}`);
    }, SOURCE_PANEL);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toHaveCount(0, { timeout: 5_000 });

    // Double-click the webFrame → the webFrame OBJECT TYPE routes to the
    // source edit context (NOT group descent); its onEnter raises the
    // source panel.
    const at = await elementScreenCenter(page, frame!);
    expect(at).not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);

    // The source panel is raised again (the context entered).
    await expect(html).toBeVisible({ timeout: 5_000 });
    // And the breadcrumb shows the webFrame context.
    await expect(
      page.locator(
        '[data-edit-context-breadcrumb] [data-edit-context-crumb="webFrame"]',
      ),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("AC-EDITCTX-3 — SELECTING a classified object surfaces its owner in the properties panel", async ({
    page,
  }) => {
    // Insert a webFrame — it is selected on insert (no double-click, no
    // context entry: this is the SELECTION-time object-type branch).
    await invokeCommand(page, INSERT_COMMAND);
    await expect
      .poll(() => selectedElement(page), { timeout: 5_000 })
      .not.toBeNull();

    // Raise the properties panel and let the async classification land:
    // the inspector shows the OWNING BUNDLE — the object-type section
    // inline-hosts the web source panel, and the header reads the
    // humanized type instead of the generic "Frame".
    await page.evaluate(async () => {
      await (
        globalThis as unknown as {
          __canvas: {
            registries: {
              commands: { invoke: (id: string) => Promise<unknown> };
            };
          };
        }
      ).__canvas.registries.commands.invoke(
        "paged.panel.show.paged.properties",
      );
    });
    const section = page.locator(
      '[data-properties-section="object-type"][data-object-type="webFrame"]',
    );
    await expect(section).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator('[data-properties-panel][data-inspector-kind="frame"]'),
    ).toBeVisible();
  });
});
