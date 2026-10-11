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

// ADR 323 (Wave 4/6, object-model design §4 "Panels") — PLUGIN object
// properties in the editor UI through the SAME schema-driven PropertyField
// as core's. A plugin declares property rows (`{ field: "property",
// address, path, kind }`, plugin-api panel schema); the host renders each
// with PropertyField over `host.objects`. Per plugin family:
//
//   · setting a plugin property through its panel field lands through
//     host.objects (read back via `__canvas.objects`) and undoes in ONE step;
//   · "Bind to data…" on a plugin field resolves a DURABLE selector that
//     still selects that object (never the bare session address when the
//     object hangs off a selected frame).

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "./fidelity/canvas-driver";
import { Designer } from "./journey/driver/designer";
import { insertWebFrameWith } from "./journey/plugins/web-kit";
import { FRAME } from "./journey/plugins/image-helpers";
import { importAndLower } from "./journey/plugins/sheet-kit";
import { bindToData, objGet, objQuery, undoOnce } from "./e2e/harness/objects";

const panel = (page: Page, id: string) => page.locator(`[data-schema-panel="${id}"]`);
const pluginField = (page: Page, panelId: string, path: string, nth = 0) =>
  panel(page, panelId).locator(`[data-plugin-property-field="${path}"]`).nth(nth);

test.describe("ADR 323 — plugin object properties through PropertyField", () => {
  test.describe("paged.web", () => {
    const PANEL = "media.paged.web.panel.properties";
    let frameAddress = "";

    test.beforeEach(async ({ page }) => {
      const designer = new Designer(page);
      await designer.open();
      await designer.newDocument();
      const frame = await insertWebFrameWith(
        page,
        "<p class=a>Hello</p>",
        ":root { --accent: red; } p { color: var(--accent); }",
      );
      frameAddress = `plugin:media.paged.web/webFrame/${frame.id}`;
      await openPanel(page, PANEL);
      await expect(panel(page, PANEL)).toBeVisible();
    });

    test("PP-WEB-1 — webFrame.media set through its property field lands via host.objects; ONE undo step @feat:scripting.property-readwrite @feat:editor-shell.plugin-bundles @feat:round-tripping.undo-redo @level:happy", async ({
      page,
    }) => {
      const field = pluginField(page, PANEL, "media");
      await expect(field.locator('[data-property-field="media"]')).toHaveAttribute("data-value-type", "enum");
      expect(await objGet(page, frameAddress, "media")).toBe("print");
      await field.locator("select").selectOption("screen");
      await expect.poll(() => objGet(page, frameAddress, "media")).toBe("screen");
      await undoOnce(page);
      await expect.poll(() => objGet(page, frameAddress, "media")).toBe("print");
      await expect(field.locator("select")).toHaveValue("print");
    });

    test("PP-WEB-2 — a CSS variable picked in the list, its value edited through PropertyField; ONE undo step @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
      page,
    }) => {
      const cssVar = `plugin:media.paged.web/cssVar/${frameAddress.split("/").pop()}/--accent`;
      const hits = await objQuery(page, `${frameAddress.replace("plugin:media.paged.web/webFrame/", "frame:")} > plugin:media.paged.web/cssVar`);
      expect(hits.length).toBeGreaterThan(0);
      const address = hits.find((h) => h.endsWith("--accent")) ?? cssVar;
      expect(await objGet(page, address, "value")).toBe("red");
      const field = pluginField(page, PANEL, "value", 1);
      const input = field.locator("input").first();
      await expect(input).toHaveValue("red");
      await input.fill("blue");
      await input.press("Enter");
      await expect.poll(() => objGet(page, address, "value")).toBe("blue");
      await undoOnce(page);
      await expect.poll(() => objGet(page, address, "value")).toBe("red");
    });

    test("PP-WEB-3 — Bind to data… on a web frame field opens with a durable selector that selects that web frame @feat:scripting.property-readwrite @feat:data.bind.authoring @level:happy", async ({
      page,
    }) => {
      const field = pluginField(page, PANEL, "media").locator('[data-property-field="media"]');
      const { selector } = await bindToData(page, field, "media");
      expect(selector).toMatch(/ > plugin:media\.paged\.web\/webFrame$/);
      expect(selector).not.toContain(frameAddress.split("/").pop()!);
      expect(await objQuery(page, selector)).toEqual([frameAddress]);
    });
  });

  test.describe("paged.image", () => {
    const PANEL = "media.paged.image.panel.properties";
    const LAYER_KIND = "plugin:media.paged.image/layer";
    let layer = "";

    test.beforeEach(async ({ page }) => {
      const designer = new Designer(page);
      await designer.open();
      await designer.newDocument();
      // A rectangle holding a placed PNG (core's replaceImageBytes — no GPU
      // needed): paged.image reads it as a one-layer stack.
      const frame = await designer.drawRectangle(FRAME);
      const placed = await page.evaluate(async (id) => {
        const cv = new OffscreenCanvas(48, 48);
        const ctx = cv.getContext("2d");
        if (!ctx) return "no 2d context";
        ctx.fillStyle = "#1830ff";
        ctx.fillRect(0, 0, 48, 48);
        ctx.fillStyle = "#ff3018";
        ctx.fillRect(12, 12, 24, 24);
        const png = new Uint8Array(await (await cv.convertToBlob({ type: "image/png" })).arrayBuffer());
        const c = (globalThis as unknown as { __canvas: { client: { mutate(m: unknown): Promise<unknown> } } }).__canvas;
        await c.client.mutate({ op: "replaceImageBytes", args: { elementId: id, bytes: [...png] } });
        return "ok";
      }, frame);
      expect(placed).toBe("ok");
      await expect
        .poll(async () => (await objQuery(page, `rectangle:${frame} > ${LAYER_KIND}`)).length, { timeout: 20_000 })
        .toBeGreaterThan(0);
      layer = (await objQuery(page, `rectangle:${frame} > ${LAYER_KIND}`))[0]!;
      await designer.selectElement("rectangle", frame);
      await openPanel(page, PANEL);
      await expect(panel(page, PANEL)).toBeVisible();
      // The layer list picked the frame's (only) layer: its fields resolve.
      await expect(pluginField(page, PANEL, "blendMode")).toHaveAttribute("data-property-targets", "1", { timeout: 20_000 });
    });

    test("PP-IMG-1 — layer.blendMode set through its property field lands via host.objects; ONE undo step @feat:scripting.property-readwrite @feat:editor-shell.plugin-bundles @feat:round-tripping.undo-redo @level:happy", async ({
      page,
    }) => {
      const field = pluginField(page, PANEL, "blendMode");
      await expect(field.locator('[data-property-field="blendMode"]')).toHaveAttribute("data-value-type", "enum");
      expect(await objGet(page, layer, "blendMode")).toBe("normal");
      await field.locator("select").selectOption("multiply");
      await expect.poll(() => objGet(page, layer, "blendMode")).toBe("multiply");
      await undoOnce(page);
      await expect.poll(() => objGet(page, layer, "blendMode")).toBe("normal");
      await expect(field.locator("select")).toHaveValue("normal");
    });

    test("PP-IMG-2 — layer.opacity typed into its number field; ONE undo step @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
      page,
    }) => {
      const field = pluginField(page, PANEL, "opacity");
      await expect(field.locator('[data-property-field="opacity"]')).toHaveAttribute("data-value-type", "number");
      expect(await objGet(page, layer, "opacity")).toBe(100);
      const input = field.locator("input").first();
      await input.click();
      await input.press("ControlOrMeta+a");
      await input.pressSequentially("40");
      await input.press("Enter");
      await expect.poll(() => objGet(page, layer, "opacity")).toBe(40);
      await undoOnce(page);
      await expect.poll(() => objGet(page, layer, "opacity")).toBe(100);
    });

    test("PP-IMG-3 — Bind to data… on a layer field opens with a selector that selects that layer @feat:scripting.property-readwrite @feat:data.bind.authoring @level:happy", async ({
      page,
    }) => {
      const field = pluginField(page, PANEL, "opacity").locator('[data-property-field="opacity"]');
      const { selector } = await bindToData(page, field, "opacity");
      // Durable: through the hosting frame's Name / x-paged:oid, never the
      // layer's session address (it embeds the frame's Self id).
      expect(selector).toMatch(new RegExp(` > ${LAYER_KIND.replace(/[./]/g, "\\$&")}(:nth\\(\\d+\\))?$`));
      expect(selector).not.toContain(layer);
      expect(await objQuery(page, selector)).toEqual([layer]);
    });
  });

  test.describe("paged.doc", () => {
    const PANEL = "media.paged.doc.panel.properties";
    const DOCX = pathResolve(dirname(fileURLToPath(import.meta.url)), "e2e/harness/merge-letter.docx");
    let documentAddress = "";
    let firstField = "";

    test.beforeEach(async ({ page }) => {
      const designer = new Designer(page);
      await designer.open();
      await designer.newDocument();
      // Place the letter through the typed command (the same door the
      // panel's "Place…" button and File ▸ Place reach).
      const bytes = [...readFileSync(DOCX)];
      const placed = await page.evaluate(async (raw) => {
        const c = (globalThis as unknown as {
          __canvas: { objects: { invoke(c: string, a: unknown): Promise<unknown> } };
        }).__canvas;
        return (await c.objects.invoke("media.paged.doc.command.placeDoc", {
          bytes: new Uint8Array(raw),
          fileName: "merge-letter.docx",
        })) as { document: string };
      }, bytes);
      documentAddress = placed.document;
      const frameId = documentAddress.split("/").pop()!;
      firstField = `plugin:media.paged.doc/mergeField/${frameId}/b0/f0`;
      // Select the hosting page item (its core address names the kind).
      const core = (await objGet(page, documentAddress, "frame")) as string;
      const [kind, id] = [core.slice(0, core.indexOf(":")), core.slice(core.indexOf(":") + 1)];
      await page.evaluate(async (target) => {
        const c = (globalThis as unknown as {
          __canvas: {
            client: { setElementSelection(ids: unknown[], mode: string): Promise<unknown[]> };
            setElementSelection(ids: unknown[]): void;
          };
        }).__canvas;
        c.setElementSelection(await c.client.setElementSelection([target], "replace"));
      }, { kind, id });
      await openPanel(page, PANEL);
      await expect(panel(page, PANEL)).toBeVisible();
    });

    test("PP-DOC-1 — the selected frame's document reads through property rows (selection > docxDocument) @feat:scripting.property-readwrite @feat:editor-shell.plugin-bundles @level:happy", async ({
      page,
    }) => {
      const field = pluginField(page, PANEL, "fileName");
      await expect(field.locator('[data-property-field="fileName"]')).toHaveAttribute("data-value-type", "text");
      await expect(field.locator("input").first()).toHaveValue("merge-letter.docx");
      await expect(field).toHaveAttribute("data-property-targets", "1");
    });

    test("PP-DOC-2 — mergeField.value set through its property field lands via host.objects; ONE undo step @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
      page,
    }) => {
      expect(await objGet(page, firstField, "value")).toBe("«First Name»");
      // The merge-field list picks its first row; the value row edits it.
      const field = pluginField(page, PANEL, "value");
      const input = field.locator("input").first();
      await expect(input).toHaveValue("«First Name»");
      await input.fill("Ada");
      await input.press("Enter");
      await expect.poll(() => objGet(page, firstField, "value")).toBe("Ada");
      await undoOnce(page);
      await expect.poll(() => objGet(page, firstField, "value")).toBe("«First Name»");
      await expect(input).toHaveValue("«First Name»");
    });

    test("PP-DOC-3 — Bind to data… on a merge field opens with a selector that selects that merge field @feat:scripting.property-readwrite @feat:data.bind.authoring @level:happy", async ({
      page,
    }) => {
      const field = pluginField(page, PANEL, "value").locator('[data-property-field="value"]');
      const { selector } = await bindToData(page, field, "value");
      expect(await objQuery(page, selector)).toEqual([firstField]);
    });
  });

  test.describe("paged.draw", () => {
    const PROPS = "media.paged.draw.panel.properties";
    const D = "media.paged.draw";
    let pathAddress = "";

    test.beforeEach(async ({ page }) => {
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
      pathAddress = `polygon:${pathId}`;
    });

    test("PP-DRAW-1 — a graphic style's name set through its property field lands via host.objects; ONE undo step @feat:scripting.property-readwrite @feat:editor-shell.plugin-bundles @feat:round-tripping.undo-redo @level:happy", async ({
      page,
    }) => {
      const created = await page.evaluate(async (kind) => {
        const o = (globalThis as unknown as {
          __canvas: { objects: { batch(ops: unknown[]): Promise<{ applied: boolean; created?: string[]; reason?: string }> } };
        }).__canvas.objects;
        return o.batch([{ op: "create", kind, props: { name: "Before" } }]);
      }, `plugin:${D}/graphicStyle`);
      expect(created.applied, created.reason).toBe(true);
      const style =
        created.created?.[0] || (await objQuery(page, `plugin:${D}/graphicStyle[name="Before"]`))[0]!;
      expect(style).toMatch(/^plugin:media\.paged\.draw\/graphicStyle\//);
      expect(await objGet(page, style, "name")).toBe("Before");

      await openPanel(page, PROPS);
      await expect(panel(page, PROPS)).toBeVisible();
      const section = panel(page, PROPS).locator('[data-schema-section="Graphic style"]');
      // The list publishes the document's styles and picks the first.
      const field = section.locator('[data-plugin-property-field="name"]').first();
      const input = field.locator("input").first();
      await expect(input).toHaveValue("Before");
      await input.fill("After");
      await input.press("Enter");
      await expect.poll(() => objGet(page, style, "name")).toBe("After");
      await undoOnce(page);
      await expect.poll(() => objGet(page, style, "name")).toBe("Before");
    });

    // PP-DRAW-2 drove the weight row of draw's "Vector stroke" schema
    // panel. That panel is retired (draw a0947ef): its rows were all core
    // frame properties and now live in the host Stroke panel, and "Draw
    // settings" carries plugin kinds only. So the claim is checked where
    // the row lives now: the host Stroke panel's weight on a draw path is
    // a core property row, one write through host.objects, one undo step.
    test("PP-DRAW-2 — a draw path's stroke weight is a core property row in the host Stroke panel: one write through host.objects, ONE undo step @feat:editor-shell.panels.stroke @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
      page,
    }) => {
      await openPanel(page, "paged.stroke");
      const strokePanel = page.locator('[data-stroke-panel="ready"]');
      await expect(strokePanel).toBeVisible();
      const field = strokePanel.locator('[data-property-field="frameStrokeWeight"]').first();
      await expect(field).toHaveAttribute("data-value-type", "length");
      await expect(field).toHaveAttribute("data-binding-source", "core");
      const before = await objGet(page, pathAddress, "frameStrokeWeight");
      const next = before === 6 ? 7 : 6;
      const input = field.locator("input").first();
      await input.click();
      await input.press("ControlOrMeta+a");
      await input.pressSequentially(String(next));
      await input.press("Enter");
      await expect.poll(() => objGet(page, pathAddress, "frameStrokeWeight")).toBe(next);
      await undoOnce(page);
      await expect.poll(() => objGet(page, pathAddress, "frameStrokeWeight")).toBe(before);
    });

    test("PP-DRAW-3 — Bind to data… on the selected path's appearance field opens with a durable selector that selects that appearance @feat:scripting.property-readwrite @feat:data.bind.authoring @level:happy", async ({
      page,
    }) => {
      const appearance = `plugin:${D}/appearance/${pathAddress}`;
      expect(await objQuery(page, `${pathAddress} > plugin:${D}/appearance`)).toEqual([appearance]);
      await openPanel(page, PROPS);
      const field = pluginField(page, PROPS, "graphicStyle").locator('[data-property-field="graphicStyle"]');
      const { selector } = await bindToData(page, field, "graphicStyle");
      expect(selector).toMatch(new RegExp(` > plugin:${D.replace(/\./g, "\\.")}/appearance(:nth\\(\\d+\\))?$`));
      expect(selector).not.toContain(pathAddress.split(":")[1]!);
      expect(await objQuery(page, selector)).toEqual([appearance]);
    });
  });

  test.describe("paged.sheet", () => {
    const PANEL = "media.paged.sheet.panel.properties";
    const SHEET_KIND = "plugin:media.paged.sheet/sheet";
    let sheetAddress = "";

    // The Sheet section's `name` row (the Workbook and Named range sections
    // carry a `name` row too).
    const sheetName = (page: Page) =>
      panel(page, PANEL).locator('[data-schema-section="Sheet"] [data-plugin-property-field="name"]').first();

    test.beforeEach(async ({ page }) => {
      const designer = new Designer(page);
      await designer.open();
      await designer.newDocument();
      // A real workbook (sheet-02-formulas.xlsx) imported and placed.
      await importAndLower(page, "A1:B3");
      await expect.poll(async () => (await objQuery(page, SHEET_KIND)).length, { timeout: 15_000 }).toBeGreaterThan(0);
      sheetAddress = (await objQuery(page, SHEET_KIND))[0]!;
      await openPanel(page, PANEL);
      await expect(panel(page, PANEL)).toBeVisible();
      // The sheets list picks its first row; the Sheet rows address it.
      await expect(sheetName(page).locator('[data-property-field="name"]')).toHaveAttribute("data-value-type", "text");
    });

    test("PP-SHEET-1 — sheet.name set through its property field lands via host.objects; ONE undo step @feat:sheet.edit.ops @feat:editor-shell.plugin-bundles @feat:round-tripping.undo-redo @level:happy", async ({
      page,
    }) => {
      const before = await objGet(page, sheetAddress, "name");
      expect(typeof before).toBe("string");
      const input = sheetName(page).locator("input").first();
      await expect(input).toHaveValue(before as string);
      await input.fill("Renamed");
      await input.press("Enter");
      // The rename re-addresses the sheet (its id IS its name).
      const renamed = `${SHEET_KIND}/Renamed`;
      await expect.poll(() => objGet(page, renamed, "name")).toBe("Renamed");
      await undoOnce(page);
      await expect.poll(() => objGet(page, sheetAddress, "name")).toBe(before);
    });

    test("PP-SHEET-2 — Bind to data… on a sheet field opens with a selector that selects that sheet @feat:sheet.edit.ops @feat:data.bind.authoring @level:happy", async ({
      page,
    }) => {
      const field = sheetName(page).locator('[data-property-field="name"]');
      const { selector } = await bindToData(page, field, "name");
      expect(selector.length).toBeGreaterThan(0);
      expect(await objQuery(page, selector)).toEqual([sheetAddress]);
    });
  });
});
