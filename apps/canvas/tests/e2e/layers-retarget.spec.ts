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

// E2E — ADR 023: ONE Layers panel that RETARGETS. The falsifiable test.
//
// This is the whole point of the ADR, so it is a test rather than a
// claim. Before this work "Layers" existed three times (this editor's
// hand-rolled `paged.layers`, plugin-draw's `layers-panel.tsx`,
// plugin-image's `LayersSection`) and the user had to know which dock tab
// was live for the current selection. After it there is ONE tab, and its
// CONTENT changes with what you are inside:
//
//   AC-RETARGET-1  with nothing plugin-owned selected, the panel is
//                  answered by CORE and lists the document's layers;
//   AC-RETARGET-2  double-clicking a path enters paged.draw's
//                  `vectorGraphic` context and the SAME panel is now
//                  answered by media.paged.draw, listing the object
//                  stack — different rows, same panel, one tab;
//   AC-RETARGET-3  Esc pops the context and the panel returns to core.
//                  (Retargeting, not a one-way switch.)
//   AC-RETARGET-4  the panel's capability gates follow the ACTIVE
//                  provider: rename is offered over core layers and
//                  DISABLED over draw's rows, because an element has no
//                  `layerName` and draw therefore does not declare that
//                  path. This is `provides.paths` doing its job — the
//                  alternative is a rename that writes a layer op with
//                  an element id in it.
//   AC-ORDER-1     rows are drawn FRONT-FIRST. `LayerSummary.z` is the
//                  designmap index and index 0 is the BACKMOST layer, so
//                  rendering the collection verbatim (as the old panel
//                  did) put the backmost layer at the top — the opposite
//                  of InDesign and Illustrator.
//   AC-LANE-1      the CORE reorder lane: dragging a layer row emits
//                  `layerMove`, proven by the engine's own layer order
//                  moving. Layer order cannot be `reorderElement` — the
//                  wire `ElementId` has no layer variant.
//   AC-LANE-2      the PROVIDER reorder lane: inside draw's context the
//                  same drag becomes `reorderElement` on the element,
//                  proven by the engine's own frame order moving. Two
//                  ops, one panel vocabulary, no branch in between.
//   AC-NO-DISPLACE-1  entering the context does NOT take the shared panel
//                  off screen. `EditContextContribution.panelIds` raises
//                  the context's OWN panels, and this dock renders one at
//                  a time — so before the fix the retarget happened while
//                  the panel was unmounted, and all three phase-C slices
//                  re-raised the tab in their specs to work around it.
//                  The shell now withholds the raise when the entering
//                  context's providers SERVE what is on screen, and only
//                  then: with Character up instead, Stroke still raises.
//   AC-NO-DISPLACE-2  a shared panel that is genuinely NOT on screen
//                  retargets on its next mount. Resolution is pull-based,
//                  so an unmounted panel cannot error and cannot go
//                  stale — the answer to "what happens when the panel is
//                  closed / behind another tab".
//
// The panel contains no `if (pluginId === …)` and neither does the
// platform seam it reads through; `data-list-provider` is a DOM hook and
// a diagnostic, and this spec is the only thing that reads it.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

const PANEL_ID = "paged.layers";
const DRAW_PLUGIN = "media.paged.draw";

interface ElementRef {
  kind: string;
  id: string;
}

/** The panel's list element — the one that carries the answering
 *  authority. */
function list(page: Page) {
  return page.locator(`[data-schema-panel="${PANEL_ID}"] [data-list]`);
}

/** Row ids in RENDER order (top of the panel first). */
async function renderedRowIds(page: Page): Promise<string[]> {
  return list(page)
    .locator("[data-list-row]")
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-list-row") ?? ""),
    );
}

/** The engine's own layer order — index 0 is the BACKMOST layer. */
async function engineLayerIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { layers: () => Promise<{ selfId: string }[]> } };
      }
    ).__canvas;
    return (await c.client.layers()).map((l) => l.selfId);
  });
}

/** The engine's own frame order on page 0 — the ground truth an element
 *  reorder has to move, read independently of the panel. */
async function engineFrameIds(page: Page): Promise<string[]> {
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
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      children?: Array<{
        children?: Array<{ id?: { kind: string; id: string } | null }>;
      }>;
    }>;
    const page0 = tree[0]?.children?.[0];
    return (page0?.children ?? [])
      .map((n) => n.id?.id)
      .filter((id): id is string => typeof id === "string");
  });
}

async function addLayer(page: Page, name: string): Promise<void> {
  await page.evaluate(async (n) => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
      }
    ).__canvas;
    await c.client.mutate({ op: "layerInsert", args: { position: 0, name: n } });
  }, name);
}

/** First element of `kind` in document order. */
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

/** Enter paged.draw's vectorGraphic context by double-clicking a path,
 *  waiting for the shell's breadcrumb (the user-visible proof).
 *
 *  NO RE-RAISE. An earlier revision of this helper clicked the Layers tab
 *  back after entering, because `EditContextContribution.panelIds` raised
 *  paged.draw's Stroke panel into the same one-panel-at-a-time dock and
 *  took Layers off screen at the exact moment it retargets. That is now
 *  fixed in the shell rather than worked around here: a context does not
 *  displace a panel its own binding providers SERVE (draw declares
 *  `collections: ["layers"]`, the panel on screen is bound to `layers`,
 *  so the raise is withheld and Stroke opens as a background tab). If the
 *  fix regresses, every test below fails on the panel not being visible —
 *  which is the point of not papering over it here. AC-NO-DISPLACE-1
 *  asserts it directly. */
async function enterVectorGraphic(page: Page): Promise<void> {
  const path = await firstOfKind(page, "rectangle");
  expect(path).not.toBeNull();
  const at = await elementScreenCenter(page, path!);
  expect(at).not.toBeNull();
  await page.mouse.dblclick(at!.x, at!.y);
  await expect(
    page.locator(
      "[data-edit-context-breadcrumb] [data-edit-context-crumb='vectorGraphic']",
    ),
  ).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(`[data-schema-panel="${PANEL_ID}"]`)).toBeVisible();
}

test.describe("E2E layers-retarget (ADR 023 — one panel, many providers)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    // The REACT path, because the vectorGraphic entry lives in
    // ViewportCanvas's own onDoubleClick handler.
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
    await page.keyboard.press("Home");
    await page.waitForTimeout(1200);
    // The generated `geometry` fixture carries no `<Layer>` elements, so
    // seed two. Without this the CORE half of every assertion below is
    // vacuously true over an empty list — which is exactly the shape of
    // a green test that proves nothing.
    await addLayer(page, "Artwork");
    await addLayer(page, "Background");
    await expect
      .poll(() => engineLayerIds(page).then((l) => l.length), {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(2);
    await openPanel(page, PANEL_ID);
    await expect(
      page.locator(`[data-schema-panel="${PANEL_ID}"]`),
    ).toBeVisible();
  });

  test("AC-RETARGET-1/2/3 — the SAME panel is answered by core, then by paged.draw, then by core again", async ({
    page,
  }) => {
    // There is exactly ONE Layers panel REGISTERED in the whole app —
    // host panels and every loaded bundle's, in one registry. Before ADR
    // 023 phase D this found two (paged.draw contributed its own), and a
    // third is waiting in plugin-image. Asserted against the registry
    // rather than the DOM because "one panel" is a statement about panel
    // IDENTITY, not about how many nodes the dock happens to mount.
    const layersPanels = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __canvas: {
            registries: {
              panels: { list: () => { id: string; title: string }[] };
            };
          };
        }
      ).__canvas.registries.panels
        .list()
        .filter((p) => /layers/i.test(p.id) || /layers/i.test(p.title))
        .map((p) => p.id),
    );
    expect(layersPanels).toEqual([PANEL_ID]);

    // --- core answers -------------------------------------------------
    await expect(list(page)).toHaveAttribute("data-list-provider", "core");
    const coreRows = await renderedRowIds(page);
    const layerIds = await engineLayerIds(page);
    expect(layerIds.length).toBeGreaterThanOrEqual(2);
    expect(coreRows.length).toBe(layerIds.length);
    expect([...coreRows].sort()).toEqual([...layerIds].sort());

    // --- paged.draw answers -------------------------------------------
    await enterVectorGraphic(page);
    await expect(list(page)).toHaveAttribute(
      "data-list-provider",
      DRAW_PLUGIN,
      { timeout: 5_000 },
    );
    const drawRows = await renderedRowIds(page);
    // DIFFERENT content — this is what makes the retarget falsifiable
    // rather than decorative. Draw serves the OBJECT STACK the user is
    // inside, not a second copy of the document's layers.
    expect(drawRows).not.toEqual(coreRows);
    const frameIds = await engineFrameIds(page);
    expect([...drawRows].sort()).toEqual([...frameIds].sort());

    // The registry agrees about who is active, and it is borrowed from
    // the edit-context stack — no second notion of activation.
    const active = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __bindingProviders: {
            active: () => { plugin: string; contextType: string }[];
          };
        }
      ).__bindingProviders.active(),
    );
    expect(active.map((a) => [a.plugin, a.contextType])).toEqual([
      [DRAW_PLUGIN, "vectorGraphic"],
    ]);

    // --- core answers again -------------------------------------------
    await page.keyboard.press("Escape");
    await expect(list(page)).toHaveAttribute("data-list-provider", "core", {
      timeout: 5_000,
    });
    expect(await renderedRowIds(page)).toEqual(coreRows);
  });

  test("AC-NO-DISPLACE-1 — entering a context does not take the panel it SERVES off screen", async ({
    page,
  }) => {
    // The defect this closes: `panelIds` raises the entering context's OWN
    // panels, this dock renders ONE panel at a time, so the shared panel
    // went off screen at the exact moment it retargeted — the one moment
    // ADR 023 exists to produce. All three phase-C slices hit it and all
    // three worked around it by re-raising the tab in the spec.
    const STROKE_TAB = `${DRAW_PLUGIN}.panel.stroke`;
    await expect(
      page.locator(`[data-dock-tab="${PANEL_ID}"][data-active]`),
    ).toBeVisible();

    await enterVectorGraphic(page);

    // The context's own panel DID open — the emphasis is not discarded,
    // only the RAISE is withheld. It is one click away in the tab strip.
    await expect(page.locator(`[data-dock-tab="${STROKE_TAB}"]`)).toBeVisible({
      timeout: 5_000,
    });
    // …and Layers is still the panel on screen, retargeted in place.
    await expect(
      page.locator(`[data-dock-tab="${PANEL_ID}"][data-active]`),
    ).toBeVisible();
    await expect(list(page)).toHaveAttribute(
      "data-list-provider",
      DRAW_PLUGIN,
      { timeout: 5_000 },
    );

    // The withholding is TARGETED, not a blanket "never steal focus" —
    // otherwise the panel-set swap would simply be dead. With a panel on
    // screen that draw's providers answer NOTHING for (Character binds
    // `character*` paths; draw declares `layers` + `layerVisible` /
    // `layerLocked`), the same enter raises Stroke exactly as before.
    await page.keyboard.press("Escape");
    await expect(list(page)).toHaveAttribute("data-list-provider", "core", {
      timeout: 5_000,
    });
    await openPanel(page, "paged.character");
    await expect(
      page.locator('[data-dock-tab="paged.character"][data-active]'),
    ).toBeVisible();
    const path = await firstOfKind(page, "rectangle");
    const at = await elementScreenCenter(page, path!);
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(
      page.locator(
        "[data-edit-context-breadcrumb] [data-edit-context-crumb='vectorGraphic']",
      ),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator(`[data-dock-tab="${STROKE_TAB}"][data-active]`),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("AC-NO-DISPLACE-2 — a shared panel that is NOT on screen retargets on the next mount", async ({
    page,
  }) => {
    // The other half of the answer: what happens to a shared panel that is
    // genuinely not visible. Resolution through the seam is PULL-based at
    // mount, not a push to a subscriber — so an unmounted panel cannot
    // error, cannot go stale, and cannot silently show core rows the user
    // reads as a broken retarget. It resolves the instant it is mounted.
    const STROKE_TAB = `${DRAW_PLUGIN}.panel.stroke`;
    await enterVectorGraphic(page);
    await expect(list(page)).toHaveAttribute(
      "data-list-provider",
      DRAW_PLUGIN,
      { timeout: 5_000 },
    );
    const drawRows = await renderedRowIds(page);

    // Take Layers off screen entirely (the tab stays, the panel unmounts —
    // this dock renders only the active one), then bring it back.
    await page.locator(`[data-dock-tab="${STROKE_TAB}"]`).click();
    await expect(page.locator(`[data-schema-panel="${PANEL_ID}"]`)).toHaveCount(
      0,
    );
    await page.locator(`[data-dock-tab="${PANEL_ID}"]`).click();
    await expect(page.locator(`[data-schema-panel="${PANEL_ID}"]`)).toBeVisible();
    await expect(list(page)).toHaveAttribute(
      "data-list-provider",
      DRAW_PLUGIN,
      { timeout: 5_000 },
    );
    expect(await renderedRowIds(page)).toEqual(drawRows);
  });

  test("AC-RETARGET-4 — rename follows the ACTIVE provider's declared paths", async ({
    page,
  }) => {
    // Over CORE layers the rename affordance is live: core serves
    // `layerName`, and double-click opens the inline editor.
    const first = list(page).locator("[data-list-row]").first();
    await first.locator("[data-list-row-select]").dblclick();
    await expect(list(page).locator("[data-list-rename]")).toBeVisible();
    await page.keyboard.press("Escape");

    // Inside draw's context the panel DISABLES rename, because
    // paged.draw does not declare `layerName` — an element has no name
    // property in core, so the honest answer is a blank control, not a
    // layer op carrying an element id. `absent`, not fall-through.
    await enterVectorGraphic(page);
    await expect(list(page)).toHaveAttribute(
      "data-list-provider",
      DRAW_PLUGIN,
      { timeout: 5_000 },
    );
    const drawRow = list(page).locator("[data-list-row]").first();
    await drawRow.locator("[data-list-row-select]").dblclick();
    await expect(list(page).locator("[data-list-rename]")).toHaveCount(0);
  });

  test("AC-ORDER-1 — rows are drawn FRONT-FIRST, the opposite of the engine's order", async ({
    page,
  }) => {
    const engine = await engineLayerIds(page);
    expect(engine.length).toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => renderedRowIds(page).then((r) => r.length), {
        timeout: 10_000,
      })
      .toBe(engine.length);
    // `layers[0]` is the BACKMOST layer, so the panel must draw it LAST.
    expect(await renderedRowIds(page)).toEqual([...engine].reverse());
  });

  test("AC-LANE-1 — the CORE lane: dragging a layer row emits layerMove", async ({
    page,
  }) => {
    const before = await engineLayerIds(page);
    expect(before.length).toBeGreaterThanOrEqual(2);
    const rows = await renderedRowIds(page);
    expect(rows.length).toBe(before.length);

    // Drag the TOP row (the frontmost layer) onto the BOTTOM row (the
    // backmost). Because the widget keeps SOURCE sibling indices while
    // drawing front-first, the command needs no arithmetic: the drop
    // resolves to engine index 0.
    await list(page)
      .locator(`[data-list-row="${rows[0]}"]`)
      .dragTo(list(page).locator(`[data-list-row="${rows[rows.length - 1]}"]`));

    await expect
      .poll(() => engineLayerIds(page), { timeout: 10_000 })
      .not.toEqual(before);
    const after = await engineLayerIds(page);
    // The frontmost layer became the backmost — i.e. `layerMove` with
    // newIndex 0, which is what dropping the top row on the bottom one
    // means. `reorderElement` could not have done this: the wire
    // `ElementId` has no layer variant.
    expect(after[0]).toBe(before[before.length - 1]);
  });

  test("AC-LANE-2 — the PROVIDER lane: the same drag becomes reorderElement", async ({
    page,
  }) => {
    await enterVectorGraphic(page);
    await expect(list(page)).toHaveAttribute(
      "data-list-provider",
      DRAW_PLUGIN,
      { timeout: 5_000 },
    );
    const before = await engineFrameIds(page);
    expect(before.length).toBeGreaterThanOrEqual(2);
    const layersBefore = await engineLayerIds(page);
    const rows = await renderedRowIds(page);
    expect(rows.length).toBe(before.length);

    await list(page)
      .locator(`[data-list-row="${rows[0]}"]`)
      .dragTo(list(page).locator(`[data-list-row="${rows[rows.length - 1]}"]`));

    // The ENGINE's frame order moved — so the panel's `layerMove` was
    // translated into `reorderElement` inside the provider's own realm.
    // The panel sent one op; the engine received a different one; the
    // panel never learned that.
    await expect
      .poll(() => engineFrameIds(page), { timeout: 10_000 })
      .not.toEqual(before);
    const after = await engineFrameIds(page);
    expect(after[0]).toBe(before[before.length - 1]);
    // …and the document's LAYERS did not move. The panel sent
    // `layerMove`; if it had reached core the layer order would have
    // changed instead. It did not, because the provider claimed it.
    expect(await engineLayerIds(page)).toEqual(layersBefore);
  });
});
