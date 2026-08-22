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

// `itemLayer` — moving an EXISTING page item onto another layer.
//
// Protocol 62 closed gap C-35. Before it, layer membership was a
// BIRTH-only property: the seven Layer* mutations managed the layer LIST
// and nothing at all wrote which layer an item was on, so `layers-z.idml`
// was the only document in the repo with items on more than one layer,
// and a Layers panel could show the tree but never let you drag a row
// into it.
//
// WHY THIS SPEC EXISTS, and what writing it found: the registry row
// `layers.item-assignment` claimed `editor.script: shipped` and state's
// coverage gate refused the claim for having no linked test. The test
// written to satisfy it FAILED — `paged.set(id, "itemLayer", …)` returns
// `false` and writes nothing, because protocol 62 taught the catalog to
// parse the path and the mutate layer to apply it and never taught
// `js_value_to_wire` that it is string-valued. Fixed in core
// (paged-script), but the editor consumes PUBLISHED wasm, so the script
// path stays broken here until a 0.62.x ships. The row now says so.
//
// The wire path was always fine, and is what these tests assert.
//
// It deliberately does NOT assert the Layers panel, because the panel
// still has no affordance for this: it renders layers and no items, so
// there is nothing to drag and nowhere to drop. That row is `planned`
// for `editor.panel` and this spec must not be read as covering it.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadFixture, type ElementRef, type LoadedFixture } from "./harness/fixtures";
import { mutate, script } from "./harness/ui";

async function openPanel(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (panelId) =>
      (
        globalThis as unknown as { __canvas: { openPanel: (i: string) => void } }
      ).__canvas.openPanel(panelId),
    id,
  );
}

function refStr(ref: ElementRef): string {
  return `${ref.kind}:${ref.id}`;
}

async function readItemLayer(page: Page, ref: ElementRef): Promise<string | null> {
  return page.evaluate(async (id) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementProperties: (
              id: unknown,
            ) => Promise<{ entries: Array<{ path: string; value: unknown }> } | null>;
          };
        };
      }
    ).__canvas;
    const props = await c.client.elementProperties(id);
    const entry = props?.entries.find((e) => e.path === "itemLayer");
    const v = entry?.value as { value?: string } | undefined;
    return v?.value ?? null;
  }, ref);
}

/** Layer ids from the WIRE collection read (`client.layers()`).
 *
 *  Deliberately not `paged.layers()`, whose `selfId` comes back
 *  namespaced as `Layer/u0` while `itemLayer` expects the bare IDML
 *  Self (`u0`). Feeding the prefixed form through `paged.set` is
 *  ACCEPTED — no error, no refusal — and then reads back as the empty
 *  string, so the write silently lands nowhere. The wire read is the
 *  same source the showcase's layers page uses.
 *
 *  Worth stating plainly because it is a trap for the next caller: two
 *  read surfaces over one collection disagree about the shape of an id
 *  that a third surface consumes, and only one combination works. */
async function layerIds(page: Page): Promise<string[]> {
  const layers = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: { client: { layers: () => Promise<Array<{ selfId: string }>> } };
        }
      ).__canvas.client.layers(),
  );
  return layers.map((l) => l.selfId);
}

test.describe("itemLayer — protocol 62 layer assignment", () => {
  let fx: LoadedFixture;
  let rect: ElementRef;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    rect = fx.frames.find((f) => f.ref.kind === "rectangle")!.ref;
  });

  test("AC-ITEMLAYER-1 — paged.set moves an existing item onto another layer @feat:layers.item-assignment @feat:scripting.property-readwrite @level:happy", async ({
    page,
  }) => {
    // A second layer to move onto. `layerInsert` positions from the BACK.
    const before = await layerIds(page);
    await mutate(page, { op: "layerInsert", args: { position: 0, name: "Sweep target" } });
    const after = await layerIds(page);
    expect(after.length, "layerInsert added no layer").toBeGreaterThan(before.length);
    const target = after.find((id) => !before.includes(id))!;

    await mutate(page, {
      op: "setElementProperty",
      args: { elementId: rect, path: "itemLayer", value: { type: "text", value: target } },
    });

    expect(
      await readItemLayer(page, rect),
      "itemLayer did not take: the write was accepted and the read surface disagrees",
    ).toBe(target);
  });

  test("AC-ITEMLAYER-2 — the empty string clears an item back to the default layer @feat:layers.item-assignment @level:edge", async ({
    page,
  }) => {
    const before = await layerIds(page);
    await mutate(page, { op: "layerInsert", args: { position: 0, name: "Temporary" } });
    const target = (await layerIds(page)).find((id) => !before.includes(id))!;

    await mutate(page, {
      op: "setElementProperty",
      args: { elementId: rect, path: "itemLayer", value: { type: "text", value: target } },
    });
    expect(await readItemLayer(page, rect)).toBe(target);

    // Clearing is the empty string, not null — the wire's Value is Text,
    // so "no layer" has to be expressible as a Text value.
    await mutate(page, {
      op: "setElementProperty",
      args: { elementId: rect, path: "itemLayer", value: { type: "text", value: "" } },
    });
    const cleared = await readItemLayer(page, rect);
    expect(cleared === null || cleared === "").toBe(true);
  });

  test("AC-ITEMLAYER-4 — the Layers panel moves the selection to a layer @feat:layers.item-assignment @feat:editor-shell.panels.layers @level:happy", async ({
    page,
  }) => {
    // C-35's affordance. The panel is a schema list bound to the
    // `layers` collection through the provider seam, so item ROWS under
    // each layer would mean synthesising a row set in this panel and
    // taking the read back out of that seam. A per-layer "move the
    // selection here" is the verb a designer reaches for anyway.
    const before = await layerIds(page);
    await mutate(page, { op: "layerInsert", args: { position: 0, name: "Destination" } });
    const target = (await layerIds(page)).find((id) => !before.includes(id))!;

    await page.evaluate(
      (el) =>
        (
          globalThis as unknown as {
            __canvas: { setElementSelection: (ids: unknown[], mode: string) => void };
          }
        ).__canvas.setElementSelection([el], "replace"),
      rect,
    );

    await openPanel(page, "paged.layers");
    const row = page.locator(`[data-list-row="${target}"]`);
    await expect(row).toBeVisible();
    // The action's DOM key is the command id — `schema-panel-renderer`
    // uses `a.action.command` as the key, not the label.
    const move = row.locator('[data-list-action="paged.layers.assignSelection"]');
    await expect(move).toBeEnabled();
    await move.click();

    await expect
      .poll(() => readItemLayer(page, rect), { timeout: 8_000 })
      .toBe(target);
  });

  test("AC-ITEMLAYER-5 — the layer toggles show the row's own state @feat:editor-shell.panels.layers @feat:layers.ops @level:happy", async ({
    page,
  }) => {
    // B2 — the schema list tier had no per-row state, so these toggles
    // worked and showed nothing: a row read `Layer 1 [Hide/show]
    // [Lock/unlock]` whether the layer was visible or hidden, and a
    // locked layer was indistinguishable from an unlocked one until a
    // click failed. Fixed in the WIDGET tier (schema type -> renderer ->
    // leaf) rather than this panel, so every list panel gains it.
    await mutate(page, { op: "layerInsert", args: { position: 0, name: "Stateful" } });
    await openPanel(page, "paged.layers");

    const before = await layerIds(page);
    const target = before[0];
    const row = page.locator(`[data-list-row="${target}"]`);
    await expect(row).toBeVisible();

    const visToggle = row.locator(
      '[data-list-action="paged.layers.toggleVisible"]',
    );
    // A visible layer offers to Hide it, and says its state in the DOM
    // so this asserts the decision rather than the label text.
    await expect(visToggle).toHaveAttribute("data-row-state", "on");
    await expect(visToggle).toHaveText("Hide");

    await visToggle.click();
    // Hidden now: the SAME control offers to Show it.
    await expect(visToggle).toHaveAttribute("data-row-state", "off", {
      timeout: 8_000,
    });
    await expect(visToggle).toHaveText("Show");
  });

  test("AC-ITEMLAYER-3 — KNOWN DEFECT: paged.set refuses itemLayer on the published wasm @feat:layers.item-assignment @feat:scripting.property-readwrite @level:edge", async ({
    page,
  }) => {
    // Characterisation, not endorsement. `paged.set` returns "false" and
    // writes nothing: the path parses (it is in the introspect catalog)
    // and then `js_value_to_wire` has no arm making it string-valued.
    // Fixed in core at a806321; the editor pins PUBLISHED canvas-wasm,
    // so this stays true here until a 0.62.x release.
    //
    // FLIP THIS when the editor's canvas-wasm pin includes the fix: the
    // expectation becomes "true" and the readback becomes `target`, and
    // the registry row's editor.script stage goes back to shipped.
    const before = await layerIds(page);
    await mutate(page, { op: "layerInsert", args: { position: 0, name: "Script target" } });
    const target = (await layerIds(page)).find((id) => !before.includes(id))!;

    const out = await script(
      page,
      `paged.set(${JSON.stringify(refStr(rect))}, "itemLayer", ${JSON.stringify(target)});`,
    );
    expect(out[0], "paged.set(itemLayer) unexpectedly succeeded — flip this test").toBe("false");
    expect(await readItemLayer(page, rect)).not.toBe(target);
  });
});
