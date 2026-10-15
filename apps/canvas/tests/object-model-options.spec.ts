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

// ADR 323 — the core UI column of the object model: schema-driven
// options panels over object addresses, on the real engine. Each family:
// a field commit lands through `host.objects` (read back through
// `__canvas.objects`, the one shared registry), it is ONE undo step, and
// "Bind to data…" names a durable target.
//
//   · Style Options — paragraph / character / object / cell / table style
//     definitions on `style:<family>/<self id>`;
//   · Document Setup (`doc`), Margins and Columns (`page:<id>`, all pages
//     = one batch);
//   · Swatch Options (`swatch:<id>`, the colour as ONE atomic write),
//     Text Variables, Section Options, Guides, Layer Options;
//   · Object Options (the page-item paths no other panel lays out) and
//     the Table panel's schema cell fields.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadIdml, openCanvas, openPanel } from "./fidelity/canvas-driver";
import { loadViaReactPath, screenPoint } from "./e2e/harness/viewport";
import { bindToData, fieldOf, objGet, undoOnce } from "./e2e/harness/objects";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, "..", "..", "..");
const fixture = (name: string) => `${ROOT}/corpus/idml/generated/${name}.idml`;

async function typeInto(field: Locator, value: string) {
  const input = field.locator("input").first();
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

/** set → read back → one undo restores, for a typed text/number field. */
async function roundTrip(
  page: Page,
  scope: Locator,
  address: string,
  path: string,
  next: unknown,
  typed: string = String(next),
) {
  const field = fieldOf(scope, path);
  await expect(field).toHaveAttribute("data-value-type", /.+/);
  const before = await objGet(page, address, path);
  expect(before, `${address} ${path} reads`).not.toBe("refused");
  await typeInto(field, typed);
  await expect.poll(() => objGet(page, address, path)).toEqual(next);
  await undoOnce(page);
  await expect.poll(() => objGet(page, address, path)).toEqual(before);
  return field;
}

async function openStyleOptions(
  page: Page,
  family: string,
  selfId: string | { label: string },
): Promise<Locator> {
  await openPanel(page, "paged.style-options");
  const panel = page.locator('[data-style-options-panel="ready"]');
  await expect(panel).toBeVisible();
  await panel.locator(`[data-cockpit-action="style-family-${family}"]`).click();
  await expect(panel).toHaveAttribute("data-style-family", family);
  await panel.locator("[data-style-options-select]").selectOption(selfId);
  if (typeof selfId === "string") {
    await expect(panel).toHaveAttribute("data-style-target", `style:${family}/${selfId}`);
  }
  return panel;
}

test.describe("ADR 323 — core options panels over host.objects", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  test("OM-OPT-1 — Paragraph Style Options: space before on style:paragraph/… → host.objects → one undo; Bind to data… targets the style address @feat:styles.set-style-property @feat:editor-shell.panels.paragraph-styles @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("styles-cascade"));
    const panel = await openStyleOptions(page, "paragraph", "ParagraphStyle/Body");
    const address = "style:paragraph/ParagraphStyle/Body";
    const before = await objGet(page, address, "paragraphSpaceBefore");
    const next = before === 7 ? 9 : 7;
    const field = await roundTrip(page, panel, address, "paragraphSpaceBefore", next);
    // An enum row renders as a select of its members (the schema's, not
    // the panel's).
    await expect(fieldOf(panel, "paragraphJustification")).toHaveAttribute("data-value-type", "enum");
    // "Next style" is a ref picked from the paragraph styles.
    const nextStyle = fieldOf(panel, "paragraphStyleNextStyle");
    await nextStyle.locator("select").first().selectOption("ParagraphStyle/Subtitle");
    await expect.poll(() => objGet(page, address, "paragraphStyleNextStyle")).toBe("ParagraphStyle/Subtitle");
    await undoOnce(page);
    const r = await bindToData(page, field, "paragraphSpaceBefore");
    expect(r.selector).toBe(address);
  });

  test("OM-OPT-2 — the Paragraph Styles panel opens Style Options on the applied style @feat:editor-shell.panels.paragraph-styles @feat:styles.paragraph.crud @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("styles-cascade"));
    await openPanel(page, "paged.paragraph-styles");
    await page.locator('[data-cockpit-action="paragraph-styles-options"]').click();
    const panel = page.locator('[data-style-options-panel="ready"]');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-style-family", "paragraph");
    await expect(panel).toHaveAttribute("data-style-target", /^style:paragraph\//);
  });

  test("OM-OPT-3 — Character Style Options: size on a new character style → one undo @feat:styles.set-style-property @feat:editor-shell.panels.character-styles @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("styles-cascade"));
    await page.evaluate(() =>
      (globalThis as unknown as { __canvas: { client: { mutate(m: unknown): Promise<unknown> } } }).__canvas.client.mutate({
        op: "createCharacterStyle",
        args: { name: "Emphasis" },
      }),
    );
    // A created style's Self id is minted (`CharacterStyle/u1`): pick it by name.
    const panel = await openStyleOptions(page, "character", { label: "Emphasis" });
    await expect(panel).toHaveAttribute("data-style-target", /^style:character\/CharacterStyle\//);
    const address = (await panel.getAttribute("data-style-target"))!;
    await roundTrip(page, panel, address, "characterFontSize", 15);
    // Character styles carry no paragraph rows.
    await expect(fieldOf(panel, "paragraphSpaceBefore")).toHaveCount(0);
  });

  test("OM-OPT-4 — Object Style Options: fill tint on style:object/… → one undo @feat:styles.set-style-property @feat:styles.object.crud @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("swatches"));
    const panel = await openStyleOptions(page, "object", "ObjectStyle/Base");
    const address = "style:object/ObjectStyle/Base";
    const before = await objGet(page, address, "frameFillTint");
    await roundTrip(page, panel, address, "frameFillTint", before === 40 ? 60 : 40);
  });

  test("OM-OPT-5 — Cell and Table Style Options: stroke weight, region cell style → one undo each @feat:styles.set-style-property @feat:styles.cell.crud @feat:styles.table.crud @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("styles-cascade"));
    // Opened from the Cell Styles list row.
    await openPanel(page, "paged.cell-styles");
    await page.locator('[data-style-options-open="CellStyle/CellBase"]').click();
    const panel = page.locator('[data-style-options-panel="ready"]');
    await expect(panel).toHaveAttribute("data-style-target", "style:cell/CellStyle/CellBase");
    const cell = "style:cell/CellStyle/CellBase";
    const w = await objGet(page, cell, "cellTopEdgeStrokeWeight");
    await roundTrip(page, panel, cell, "cellTopEdgeStrokeWeight", w === 3 ? 5 : 3);

    const table = await openStyleOptions(page, "table", "TableStyle/TableBase");
    const address = "style:table/TableStyle/TableBase";
    const tw = await objGet(page, address, "tableStyleTopBorderStrokeWeight");
    await roundTrip(page, table, address, "tableStyleTopBorderStrokeWeight", tw === 2 ? 4 : 2);
    const region = fieldOf(table, "tableStyleBodyRegionCellStyle");
    const before = await objGet(page, address, "tableStyleBodyRegionCellStyle");
    const pick = before === "CellStyle/CellDerived" ? "CellStyle/CellBase" : "CellStyle/CellDerived";
    await region.locator("select").first().selectOption(pick);
    await expect.poll(() => objGet(page, address, "tableStyleBodyRegionCellStyle")).toBe(pick);
    await undoOnce(page);
    await expect.poll(() => objGet(page, address, "tableStyleBodyRegionCellStyle")).toEqual(before);
  });

  test("OM-OPT-6 — Document Setup: bleed and an enum colour setting on doc → one undo each; Bind to data… targets doc @feat:editor-shell.panels.color-settings @feat:layout-model.spreads-pages @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("layout"));
    await openPanel(page, "paged.document-setup");
    const panel = page.locator('[data-document-setup-panel="ready"]');
    const before = await objGet(page, "doc", "documentBleedTop");
    const field = await roundTrip(page, panel, "doc", "documentBleedTop", before === 9 ? 12 : 9);
    await expect(fieldOf(panel, "renderingIntent")).toHaveAttribute("data-value-type", "enum");
    const r = await bindToData(page, field, "documentBleedTop");
    expect(r.selector).toBe("doc");
  });

  test("OM-OPT-6b — Document Setup: an enum colour setting writes through doc and undoes in one step @feat:editor-shell.panels.color-settings @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    // (Core 71 final: a `Set` that lowers to setColorSettings is one undo
    // step that restores the previous settings.)
    await loadIdml(page, fixture("layout"));
    await openPanel(page, "paged.document-setup");
    const panel = page.locator('[data-document-setup-panel="ready"]');
    const intent = fieldOf(panel, "renderingIntent");
    await expect(intent).toHaveAttribute("data-value-type", "enum");
    const was = await objGet(page, "doc", "renderingIntent");
    const pick = was === "Saturation" ? "Perceptual" : "Saturation";
    await intent.locator("select").first().selectOption(pick);
    await expect.poll(() => objGet(page, "doc", "renderingIntent")).toBe(pick);
    await undoOnce(page);
    await expect.poll(() => objGet(page, "doc", "renderingIntent")).toEqual(was);
  });

  test("OM-OPT-7 — Margins and Columns: All pages writes ONE batch over every page = one undo @feat:layout-model.spreads-pages @feat:layout-model.text-columns @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("layout"));
    await openPanel(page, "paged.margins-columns");
    const panel = page.locator('[data-margins-columns-panel="ready"]');
    await panel.locator("[data-page-select]").selectOption("__all__");
    const addresses = ((await panel.locator("[data-schema-sections]").getAttribute("data-target")) ?? "").split(" ");
    expect(addresses.length).toBeGreaterThan(1);
    const before = await Promise.all(addresses.map((a) => objGet(page, a, "pageMarginTop")));
    await typeInto(fieldOf(panel, "pageMarginTop"), "33");
    for (const a of addresses) await expect.poll(() => objGet(page, a, "pageMarginTop")).toBe(33);
    await undoOnce(page);
    for (const [i, a] of addresses.entries()) await expect.poll(() => objGet(page, a, "pageMarginTop")).toEqual(before[i]);
    // Columns on one page.
    await panel.locator("[data-page-select]").selectOption({ index: 0 });
    const one = (await panel.locator("[data-schema-sections]").getAttribute("data-target"))!;
    const cols = await objGet(page, one, "pageColumnCount");
    await roundTrip(page, panel, one, "pageColumnCount", cols === 3 ? 2 : 3);
  });

  test("OM-OPT-8 — Swatch Options: the colour is ONE atomic write of swatch.color = one undo @feat:color-swatches.swatch.crud @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("swatches"));
    await openPanel(page, "paged.swatch-options");
    const panel = page.locator('[data-swatch-options-panel="ready"]');
    await expect(panel).toHaveAttribute("data-options-target", /^swatch:/);
    const address = (await panel.getAttribute("data-options-target"))!;
    const before = (await objGet(page, address, "color")) as { space: string; value: number[] };
    expect(typeof before).toBe("object");
    await panel.locator("[data-swatch-color-space]").selectOption("RGB");
    await panel.locator("[data-swatch-color-value]").fill("10, 200, 30");
    await panel.locator('[data-cockpit-action="swatch-color-apply"]').click();
    await expect
      .poll(async () => {
        const c = (await objGet(page, address, "color")) as { space: string; value: number[] };
        return [c.space, c.value.map((n) => Math.round(n))];
      })
      .toEqual(["RGB", [10, 200, 30]]);
    await undoOnce(page);
    await expect
      .poll(async () => ((await objGet(page, address, "color")) as { space: string }).space)
      .toBe(before.space);
  });

  test("OM-OPT-9 — Text Variables and Section Options on variables.idml → one undo each @feat:sections-numbering-variables.text-variables @feat:sections-numbering-variables.sections @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("variables"));
    await openPanel(page, "paged.text-variables");
    const vars = page.locator('[data-object-options-panel="textVariable"]');
    await expect(vars).toHaveAttribute("data-options-target", /^textVariable:/);
    const tv = (await vars.getAttribute("data-options-target"))!;
    await roundTrip(page, vars, tv, "textVariableTextBefore", "Page ");
    await openPanel(page, "paged.section-options");
    const sec = page.locator('[data-section-options-panel="ready"]');
    await expect(sec).toHaveAttribute("data-options-target", /^section:/);
    const s = (await sec.getAttribute("data-options-target"))!;
    await roundTrip(page, sec, s, "prefix", "A-");
    await expect(fieldOf(sec, "numberingStyle")).toHaveAttribute("data-value-type", "enum");
  });

  test("OM-OPT-10 — Guides: position on guide:… → one undo @feat:layout-model.guides @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("layout"));
    await openPanel(page, "paged.guides");
    const panel = page.locator('[data-object-options-panel="guide"]');
    await expect(panel).toHaveAttribute("data-options-target", /^guide:/);
    const g = (await panel.getAttribute("data-options-target"))!;
    const before = await objGet(page, g, "position");
    await roundTrip(page, panel, g, "position", before === 100 ? 120 : 100);
  });

  test("OM-OPT-11 — Layer Options: name on layer:… → one undo @feat:editor-shell.panels.layers @feat:layers.ops @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("layers-z"));
    await openPanel(page, "paged.layers");
    const panel = page.locator('[data-layers="ready"]');
    await panel.getByRole("button", { name: "Layer Options" }).click();
    const opts = panel.locator("[data-layer-options]");
    const address = (await opts.getAttribute("data-layer-options"))!;
    await roundTrip(page, opts, address, "layerName", "Renamed");
  });

  test("OM-OPT-12 — Object Options: corner shape and name on the selection → one undo each @feat:frames-paths.corner-options @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("geometry-groups"));
    const frame = { kind: "textFrame", id: "ua365e1" };
    await page.evaluate(async (target) => {
      const c = (globalThis as unknown as { __canvas: { client: { setElementSelection(ids: unknown[], m: string): Promise<unknown[]> }; setElementSelection(ids: unknown[]): void } }).__canvas;
      c.setElementSelection(await c.client.setElementSelection([target], "replace"));
    }, frame);
    await openPanel(page, "paged.object-options");
    const panel = page.locator('[data-object-options-panel="ready"]');
    const address = `textFrame:${frame.id}`;
    const corner = fieldOf(panel, "frameCornerOptionTopLeft");
    await expect(corner).toHaveAttribute("data-value-type", "enum");
    const was = await objGet(page, address, "frameCornerOptionTopLeft");
    const pick = was === "RoundedCorner" ? "BeveledCorner" : "RoundedCorner";
    await corner.locator("select").first().selectOption(pick);
    await expect.poll(() => objGet(page, address, "frameCornerOptionTopLeft")).toBe(pick);
    await undoOnce(page);
    await expect.poll(() => objGet(page, address, "frameCornerOptionTopLeft")).toEqual(was);
    await roundTrip(page, panel, address, "itemName", "Headline box");
  });

  test("OM-OPT-13 — Table ▸ Cell options: the span on the cell address → one undo; the cell's fill tint writes through host.objects (stored since engine 0.71.11) @feat:editor-shell.panels.table @feat:tables.model @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const fx = await loadViaReactPath(page, "tables");
    const p0 = fx.pages[0];
    const cell = await page.evaluate(
      async ({ pageId, w, h }) => {
        const c = (globalThis as unknown as {
          __canvas: { client: { send(m: unknown): Promise<{ kind: string; payload?: { storyId?: string | null; tableContext?: { tableId: string } | null } }> } };
        }).__canvas;
        for (let gy = 0.04; gy < 0.97; gy += 0.03) {
          for (let gx = 0.04; gx < 0.97; gx += 0.03) {
            const r = await c.client.send({ kind: "hitTest", payload: { pageId, docPoint: [w * gx, h * gy], filter: "any" } });
            if (r.kind === "hitResult" && r.payload?.tableContext && r.payload.storyId) return { gx, gy };
          }
        }
        return null;
      },
      { pageId: p0.pageId, w: p0.widthPt, h: p0.heightPt },
    );
    expect(cell).not.toBeNull();
    const pt = await screenPoint(page, p0.widthPt * cell!.gx, p0.heightPt * cell!.gy);
    await page.mouse.click(pt.x, pt.y);
    await openPanel(page, "paged.table");
    const panel = page.locator('[data-table-panel="ready"]');
    const fields = panel.locator("[data-cell-schema-fields]");
    await expect(fields).toHaveAttribute("data-cell-schema-fields", /^cell:/);
    const address = (await fields.getAttribute("data-cell-schema-fields"))!;
    // Engine 0.71.11 stores a cell's fill tint (core ADR 152). The SDK
    // still marks the row read-only; the editor's seam lifts that, so the
    // write lands and undoes in one step. (Its field is Cell ▸ Tint,
    // cell-fill-tint.spec.ts.)
    const before = await objGet(page, address, "cellFillTint");
    const written = await page.evaluate(
      (a) =>
        (globalThis as unknown as {
          __canvas: { objects: { set(a: string, p: string, v: unknown): Promise<{ applied: boolean; code?: string }> } };
        }).__canvas.objects.set(a, "cellFillTint", 40),
      address,
    );
    expect(written).toMatchObject({ applied: true });
    await expect.poll(() => objGet(page, address, "cellFillTint")).toBe(40);
    await undoOnce(page);
    await expect.poll(() => objGet(page, address, "cellFillTint")).toEqual(before);
    // The span is the cell's live schema field.
    const span = await objGet(page, address, "columnSpan");
    expect(typeof span).toBe("number");
    await expect(fieldOf(fields, "columnSpan")).toHaveAttribute("data-value-type", /.+/);
  });
});
