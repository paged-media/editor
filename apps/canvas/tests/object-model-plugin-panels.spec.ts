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

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "./fidelity/canvas-driver";
import { Designer } from "./journey/driver/designer";
import { insertWebFrameWith } from "./journey/plugins/web-kit";
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

    test("PP-WEB-1 — webFrame.media set through its property field lands via host.objects; ONE undo step @feat:plugin-web.object-model @feat:editor-shell.plugin-bundles @feat:round-tripping.undo-redo @level:happy", async ({
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

    test("PP-WEB-2 — a CSS variable picked in the list, its value edited through PropertyField; ONE undo step @feat:plugin-web.object-model @feat:round-tripping.undo-redo @level:happy", async ({
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

    test("PP-WEB-3 — Bind to data… on a web frame field opens with a durable selector that selects that web frame @feat:plugin-web.object-model @feat:data.bind.authoring @level:happy", async ({
      page,
    }) => {
      const field = pluginField(page, PANEL, "media").locator('[data-property-field="media"]');
      const { selector } = await bindToData(page, field, "media");
      expect(selector).toMatch(/ > plugin:media\.paged\.web\/webFrame$/);
      expect(selector).not.toContain(frameAddress.split("/").pop()!);
      expect(await objQuery(page, selector)).toEqual([frameAddress]);
    });
  });
});
