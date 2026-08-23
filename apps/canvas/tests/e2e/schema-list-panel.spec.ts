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

// E2E — B-01 list widget + G3 applyEntity in the schema-panel lane,
// through the REAL editor (the consumer-proof spec for the schema
// v1.1 collection tier).
//
// The demo panel (src/panels/schema-list-demo-panel.tsx) registers a
// SCHEMA — pure data — whose `paged.list` row binds
// `documentCollection:swatches`. This spec drives it end-to-end:
//
//   AC-LIST-1  the list renders one row per REAL swatch-collection
//              entry (label from `name`, id from `selfId`) — including
//              a swatch created mid-session (the collection is live);
//   AC-LIST-2  clicking a row publishes the selection binding
//              (`demo.selectedSwatch`): the row shows selected AND the
//              gated readout row appears (the B-01 lookup gate driven
//              by the list's publish-back);
//   AC-LIST-3  the "Fill" action (G3 applyEntity) applies the row's
//              swatch id to the element selection's `frameFillColor`
//              as a ColorRef through the standard setElementProperty
//              channel;
//   AC-LIST-4  the "Stroke" action dispatches the registered command
//              with the ROW ID as payload — proven by the handler's
//              observable effect (`frameStrokeColor` = the row id).
//   AC-LIST-5  (schema v1.2) the 500-row limit is a WINDOW, not a cap:
//              over a document with more swatches than that, the leaf
//              renders 500 rows plus a "Show N more" control that adds
//              the rest. Row 501 is one click away, not unreachable —
//              which is what makes shipping without virtualization
//              honest rather than a silent truncation.
//
// Document: the in-test minimal rect+polygon IDML (no corpus
// dependency), same as draw-schema-panel.spec.ts.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { buildRectAndPolygonIdmlBase64 } from "./harness/build-min-idml";

const PANEL_ID = "paged.schema-list-demo";
const DEMO_SWATCH_NAME = "Demo Red";

interface ElementRef {
  kind: string;
  id: string;
}

interface SwatchRow {
  selfId: string;
  name: string;
  kind: string;
}

interface WireValue {
  type: string;
  value: unknown;
}

interface CanvasGlobal {
  ready: boolean;
  client: {
    loadDocument: (
      bytes: Uint8Array,
    ) => Promise<{ pageCount: number; pageIds: string[] }>;
    setElementSelection: (
      ids: ElementRef[],
      mode: string,
    ) => Promise<ElementRef[]>;
    collection: (name: string) => Promise<SwatchRow[]>;
    mutate: (m: unknown) => Promise<unknown>;
    elementProperties: (
      id: ElementRef,
    ) => Promise<{ entries: { path: string; value: WireValue }[] } | null>;
  };
  setElementSelection: (ids: ElementRef[]) => void;
}

const RECT: ElementRef = { kind: "rectangle", id: "urect" };

async function loadMinIdml(page: Page, base64: string): Promise<void> {
  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    await c.client.loadDocument(bytes);
  }, base64);
}

/** Create the demo swatch and return its selfId + the full live
 *  collection (post-create). */
async function createDemoSwatch(
  page: Page,
): Promise<{ id: string; all: SwatchRow[] }> {
  return page.evaluate(async (name) => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    await c.client.mutate({
      op: "createSwatch",
      args: {
        spec: { name, space: "RGB", value: [255, 0, 0], model: "Process" },
      },
    });
    const all = await c.client.collection("swatches");
    const created = all.find((s) => s.name === name);
    if (!created) throw new Error("createSwatch did not land in collection");
    return { id: created.selfId, all: [...all] };
  }, DEMO_SWATCH_NAME);
}

async function select(page: Page, ref: ElementRef): Promise<void> {
  await page.evaluate(async (target) => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    const ids = await c.client.setElementSelection([target], "replace");
    c.setElementSelection(ids);
  }, ref);
}

async function propertyValue(
  page: Page,
  ref: ElementRef,
  path: string,
): Promise<WireValue | null> {
  return page.evaluate(
    async ({ target, p }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const props = await c.client.elementProperties(target);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { target: ref, p: path },
  );
}

test.describe("E2E schema-list-panel (B-01 list widget + G3 applyEntity)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadMinIdml(page, buildRectAndPolygonIdmlBase64());
    await openPanel(page, PANEL_ID);
    await expect(
      page.locator(`[data-schema-panel="${PANEL_ID}"]`),
    ).toBeVisible();
  });

  test("AC-LIST-1 — rows render live from the real swatches collection", async ({
    page,
  }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    const { id, all } = await createDemoSwatch(page);

    // One row per collection entry — the list re-fetched on the
    // createSwatch mutation (live collection, not a load-time copy).
    await expect(panel.locator("[data-list-row]")).toHaveCount(all.length);
    const demoRow = panel.locator(`[data-list-row="${id}"]`);
    await expect(demoRow).toBeVisible();
    await expect(demoRow).toContainText(DEMO_SWATCH_NAME);
    // Secondary field (`kind`) renders as the mono second line.
    await expect(
      demoRow.locator("[data-list-secondary]"),
    ).toBeVisible();
  });

  test("AC-LIST-2 — row click publishes the selection binding and flips the gate", async ({
    page,
  }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    const { id } = await createDemoSwatch(page);
    const demoRow = panel.locator(`[data-list-row="${id}"]`);

    // Before any selection: the gated readout row is absent.
    await expect(panel.locator("[data-readout]")).toHaveCount(0);

    await demoRow.locator("[data-list-row-select]").click();
    await expect(demoRow).toHaveAttribute("data-selected", "true");
    // The readout row is gated `visible: { bind: "demo.selectedSwatch" }`
    // — its appearance proves the list PUBLISHED the row id back
    // through the panel bindings.
    await expect(panel.locator("[data-readout]")).toBeVisible();
  });

  test("AC-LIST-3 — the Fill action (applyEntity) writes the swatch onto the selection", async ({
    page,
  }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    const { id } = await createDemoSwatch(page);
    const demoRow = panel.locator(`[data-list-row="${id}"]`);
    const fill = demoRow.locator('[data-list-action="apply:frameFillColor"]');

    // Honest no-write-path: without an element selection the
    // applyEntity button is disabled.
    await expect(fill).toBeDisabled();

    await select(page, RECT);
    await expect(fill).toBeEnabled();
    await fill.click();

    // The write landed through setElementProperty as a ColorRef.
    await expect
      .poll(() =>
        propertyValue(page, RECT, "frameFillColor").then((v) => v?.value),
      )
      .toBe(id);
  });

  test("AC-LIST-4 — the Stroke action dispatches the command with the row id payload", async ({
    page,
  }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    const { id } = await createDemoSwatch(page);
    const demoRow = panel.locator(`[data-list-row="${id}"]`);

    await select(page, RECT);
    await demoRow
      .locator(`[data-list-action="paged.demo.applySwatchStroke"]`)
      .click();

    // The registered command received the ROW ID as payload and its
    // handler applied it to the stroke — observable on the element.
    await expect
      .poll(() =>
        propertyValue(page, RECT, "frameStrokeColor").then((v) => v?.value),
      )
      .toBe(id);
  });

  test("AC-LIST-5 — past 500 rows the list windows and offers the rest", async ({
    page,
  }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    // Real swatches in a real document, minted in ONE batch (one undo
    // step) — not a fabricated row array, because the window has to
    // hold up against the collection lane the panels actually read.
    const total = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const before = await c.client.collection("swatches");
      const wanted = 540 - before.length;
      const ops = Array.from({ length: wanted }, (_v, i) => ({
        op: "createSwatch",
        args: {
          spec: {
            name: `Bulk ${i}`,
            space: "RGB",
            value: [i % 256, 0, 0],
            model: "Process",
          },
        },
      }));
      await c.client.mutate({ op: "batch", args: { ops } });
      const after = await c.client.collection("swatches");
      return after.length;
    });
    expect(total).toBeGreaterThan(500);

    // The window renders 500; the remainder is OFFERED, never dropped.
    await expect(panel.locator("[data-list-row]")).toHaveCount(500);
    const more = panel.locator("[data-list-more]");
    await expect(more).toBeVisible();
    await expect(more).toHaveAttribute("data-list-overflow", String(total));
    await expect(more).toContainText(`500 of ${total}`);

    await more.click();
    await expect(panel.locator("[data-list-row]")).toHaveCount(total);
    await expect(panel.locator("[data-list-more]")).toHaveCount(0);
  });
});
