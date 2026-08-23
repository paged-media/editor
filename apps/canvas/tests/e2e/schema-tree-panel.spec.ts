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

// E2E — schema v1.2: TREE ROWS + DRAG-REORDER + INLINE RENAME through
// the REAL editor (the consumer-proof spec for ADR 023 phase B).
//
// The demo panel (src/panels/schema-tree-demo-panel.tsx) declares two
// lists as pure SCHEMA data, and this spec drives them end to end:
//
//   AC-TREE-1  the Structure list renders the REAL scene outline as a
//              tree — spread at depth 0, page at depth 1, frames at
//              depth 2 — with a disclosure control only on rows that
//              have children;
//   AC-TREE-2  collapsing a row hides its whole subtree and expanding
//              restores it (which is also what keeps the render window
//              meaningful over a deep tree);
//   AC-TREE-3  dragging a frame row onto its SIBLING emits the
//              engine's `reorderElement` with the absolute `{ index }`
//              form — proven by the engine's own `sceneTree()` order
//              changing, not by the panel's local state;
//   AC-TREE-4  dragging a frame row onto a row with a DIFFERENT parent
//              is REFUSED — `reorderElement` reorders within one
//              sibling list and cannot reparent, so the widget does
//              not quietly reinterpret the drop as a same-parent move;
//   AC-REN-1   double-clicking a layer row opens the inline editor
//              seeded with the current name; Enter commits through the
//              declared command, which lands as `layerSetName`;
//   AC-REN-2   Escape cancels — nothing is written;
//   AC-MOVE-1  dragging a layer row dispatches the declared reorder
//              COMMAND with sibling indices, which lands as
//              `layerMove` (a layer is not an element, so its order is
//              not `reorderElement` — the command lane is the point).
//
// Document: the in-test minimal rect+polygon IDML (no corpus
// dependency), same as schema-list-panel.spec.ts.

import { expect, test, type Locator, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { buildRectAndPolygonIdmlBase64 } from "./harness/build-min-idml";

const PANEL_ID = "paged.schema-tree-demo";

interface ElementRef {
  kind: string;
  id: string;
}

interface SceneTreeNode {
  id: ElementRef | null;
  kind: string;
  label: string;
  children?: SceneTreeNode[];
}

interface LayerRow {
  selfId: string;
  name: string | null;
  parentId?: string | null;
}

interface CanvasGlobal {
  client: {
    loadDocument: (
      bytes: Uint8Array,
    ) => Promise<{ pageCount: number; pageIds: string[] }>;
    sceneTree: () => Promise<SceneTreeNode[]>;
    layers: () => Promise<LayerRow[]>;
    mutate: (m: unknown) => Promise<{ kind: string }>;
  };
}

async function loadMinIdml(page: Page, base64: string): Promise<void> {
  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    await c.client.loadDocument(bytes);
  }, base64);
}

/** The engine's own frame order under the first page — the ground
 *  truth a reorder has to move, independent of the panel. */
async function frameOrder(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    const roots = await c.client.sceneTree();
    const frames = roots[0]?.children?.[0]?.children ?? [];
    return frames.map((f) => String(f.id?.id ?? f.label));
  });
}

async function layers(page: Page): Promise<LayerRow[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    return c.client.layers();
  });
}

/** The minimal in-test IDML carries NO `<Layer>` elements at all, so
 *  the layer rows are created here rather than assumed. `layerInsert`
 *  is the same op the editor's own Layers panel dispatches. */
async function addLayer(page: Page, name: string): Promise<void> {
  await page.evaluate(async (layerName) => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    await c.client.mutate({
      op: "layerInsert",
      args: { position: 0, name: layerName },
    });
  }, name);
}

/** The panel's rendered row ids, top to bottom. */
async function renderedRowIds(list: Locator): Promise<string[]> {
  return list.locator("[data-list-row]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-list-row") ?? ""),
  );
}

test.describe("E2E schema-tree-panel (v1.2 tree rows / drag-reorder / inline rename)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadMinIdml(page, buildRectAndPolygonIdmlBase64());
    await openPanel(page, PANEL_ID);
    await expect(
      page.locator(`[data-schema-panel="${PANEL_ID}"]`),
    ).toBeVisible();
  });

  test("AC-TREE-1 — the scene outline renders as a tree with real depths", async ({
    page,
  }) => {
    const structure = page.locator('[data-schema-section="Structure"]');
    const order = await frameOrder(page);
    expect(order.length).toBeGreaterThanOrEqual(2);

    // Spread → Page → frames. The spread/page rows carry synthetic ids
    // (they address no element); the frames carry their self ids.
    const rows = structure.locator("[data-list-row]");
    await expect(rows).toHaveCount(2 + order.length);
    await expect(rows.nth(0)).toHaveAttribute("data-list-depth", "0");
    await expect(rows.nth(1)).toHaveAttribute("data-list-depth", "1");
    for (let i = 0; i < order.length; i++) {
      await expect(
        structure.locator(`[data-list-row="${order[i]}"]`),
      ).toHaveAttribute("data-list-depth", "2");
    }

    // A disclosure control exists on every row, but it is only ENABLED
    // where there are children — a leaf row never offers a twisty that
    // does nothing.
    await expect(
      structure.locator("[data-list-twisty]").nth(0),
    ).toHaveAttribute("data-expanded", "true");
    const leafTwisty = structure
      .locator(`[data-list-row="${order[0]}"] [data-list-twisty]`)
      .first();
    await expect(leafTwisty).toBeDisabled();
  });

  test("AC-TREE-2 — collapsing a row hides its subtree, expanding restores it", async ({
    page,
  }) => {
    const structure = page.locator('[data-schema-section="Structure"]');
    const order = await frameOrder(page);
    const full = 2 + order.length;
    await expect(structure.locator("[data-list-row]")).toHaveCount(full);

    // Collapse the PAGE row (index 1) — its frames go, the spread and
    // the page itself stay.
    const pageTwisty = structure
      .locator("[data-list-row]")
      .nth(1)
      .locator("[data-list-twisty]");
    await pageTwisty.click();
    await expect(structure.locator("[data-list-row]")).toHaveCount(2);
    await expect(pageTwisty).toHaveAttribute("data-expanded", "false");

    // Collapse the SPREAD row too — only it survives.
    const spreadTwisty = structure
      .locator("[data-list-row]")
      .nth(0)
      .locator("[data-list-twisty]");
    await spreadTwisty.click();
    await expect(structure.locator("[data-list-row]")).toHaveCount(1);

    await spreadTwisty.click();
    await expect(structure.locator("[data-list-row]")).toHaveCount(2);
    await structure
      .locator("[data-list-row]")
      .nth(1)
      .locator("[data-list-twisty]")
      .click();
    await expect(structure.locator("[data-list-row]")).toHaveCount(full);
  });

  test("AC-TREE-2b — `defaultExpanded: false` starts collapsed and still opens", async ({
    page,
  }) => {
    const collapsed = page.locator('[data-schema-section="Collapsed"]');
    // Only the root is on screen — the opt-out a deep tree needs, and
    // the reason a large tree never has to fight the render window.
    await expect(collapsed.locator("[data-list-row]")).toHaveCount(1);
    await expect(collapsed.locator("[data-list-row]").nth(0)).toHaveAttribute(
      "data-list-depth",
      "0",
    );
    // Rows are not draggable here — this list declares no reorder.
    await expect(collapsed.locator("[data-list-row]").nth(0)).toHaveAttribute(
      "draggable",
      "false",
    );

    await collapsed.locator("[data-list-twisty]").nth(0).click();
    await expect(collapsed.locator("[data-list-row]")).toHaveCount(2);
    await collapsed.locator("[data-list-row]").nth(1).locator("[data-list-twisty]").click();
    const order = await frameOrder(page);
    await expect(collapsed.locator("[data-list-row]")).toHaveCount(
      2 + order.length,
    );
  });

  test("AC-TREE-3 — a sibling drop emits reorderElement and the engine order moves", async ({
    page,
  }) => {
    const structure = page.locator('[data-schema-section="Structure"]');
    const before = await frameOrder(page);
    expect(before.length).toBeGreaterThanOrEqual(2);

    // Drag the LAST frame onto the FIRST — `{ index: 0 }`, the
    // backmost slot.
    const source = structure.locator(
      `[data-list-row="${before[before.length - 1]}"]`,
    );
    const target = structure.locator(`[data-list-row="${before[0]}"]`);
    await source.dragTo(target);

    const expected = [
      before[before.length - 1],
      ...before.slice(0, before.length - 1),
    ];
    await expect.poll(() => frameOrder(page)).toEqual(expected);
    // And the panel re-rendered from the engine, not from local state.
    await expect
      .poll(() => renderedRowIds(structure).then((ids) => ids.slice(2)))
      .toEqual(expected);
  });

  test("AC-TREE-4 — a cross-parent drop is refused, not reinterpreted", async ({
    page,
  }) => {
    const structure = page.locator('[data-schema-section="Structure"]');
    const before = await frameOrder(page);

    // A frame's parent is the PAGE row; drop it on the SPREAD row.
    const source = structure.locator(`[data-list-row="${before[0]}"]`);
    const spreadRow = structure.locator("[data-list-row]").nth(0);
    await source.dragTo(spreadRow);

    // Nothing moved — and nothing was silently rewritten into a
    // same-parent move either.
    await expect.poll(() => frameOrder(page)).toEqual(before);
  });

  test("AC-REN-1 — double-click renames a layer through the declared command", async ({
    page,
  }) => {
    const section = page.locator('[data-schema-section="Layers"]');
    await addLayer(page, "Demo layer");
    await expect.poll(() => layers(page).then((l) => l.length)).toBe(1);
    const before = await layers(page);
    const target = before[0];

    const row = section.locator(`[data-list-row="${target.selfId}"]`);
    await expect(row).toBeVisible();
    await row.locator("[data-list-row-select]").dblclick();

    const input = row.locator(`[data-list-rename="${target.selfId}"]`);
    await expect(input).toBeVisible();
    // Seeded from the row's current name — not blank, not the id.
    await expect(input).toHaveValue(target.name ?? "");

    await input.fill("Renamed by schema");
    await input.press("Enter");

    await expect
      .poll(() =>
        layers(page).then(
          (rows) => rows.find((l) => l.selfId === target.selfId)?.name ?? null,
        ),
      )
      .toBe("Renamed by schema");
    await expect(row).toContainText("Renamed by schema");
  });

  test("AC-REN-2 — Escape cancels the rename without writing", async ({
    page,
  }) => {
    const section = page.locator('[data-schema-section="Layers"]');
    await addLayer(page, "Demo layer");
    await expect.poll(() => layers(page).then((l) => l.length)).toBe(1);
    const before = await layers(page);
    const target = before[0];

    const row = section.locator(`[data-list-row="${target.selfId}"]`);
    await row.locator("[data-list-row-select]").dblclick();
    const input = row.locator(`[data-list-rename="${target.selfId}"]`);
    await input.fill("Never committed");
    await input.press("Escape");

    await expect(input).toHaveCount(0);
    const after = await layers(page);
    expect(after.find((l) => l.selfId === target.selfId)?.name ?? null).toBe(
      target.name ?? null,
    );
  });

  test("AC-MOVE-1 — a layer drag dispatches the reorder COMMAND (layerMove)", async ({
    page,
  }) => {
    const section = page.locator('[data-schema-section="Layers"]');
    // A layer is not an element, so this list declares a command
    // reorder. Two layers are needed for a drag to mean anything.
    await addLayer(page, "Lower layer");
    await addLayer(page, "Upper layer");
    await expect.poll(() => layers(page).then((l) => l.length)).toBe(2);

    const before = await layers(page);
    const rowIds = await renderedRowIds(section);
    expect(rowIds.length).toBe(before.length);

    // Drag the last row onto the first.
    await section
      .locator(`[data-list-row="${rowIds[rowIds.length - 1]}"]`)
      .dragTo(section.locator(`[data-list-row="${rowIds[0]}"]`));

    const expected = [
      rowIds[rowIds.length - 1],
      ...rowIds.slice(0, rowIds.length - 1),
    ];
    await expect.poll(() => renderedRowIds(section)).toEqual(expected);
  });
});
