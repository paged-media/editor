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

// E2E — paged.draw's declarative SCHEMA panel through the REAL editor.
//
// INTENT (unchanged): a plugin panel declared as pure data (a
// `SchemaPanelContribution`, NO React across the boundary) renders from
// the host CATALOG, and what it shows is driven by the selection and the
// bundle's published state, not by a static schema.
//
// WHICH PANEL. This spec drove "Vector stroke"
// (`media.paged.draw.panel.stroke`), whose dash section a published
// binding gated (hidden for a rectangle, shown for a path — B-01). The
// draw build from ux/panels-2026-10 (a0947ef) retired that panel: its rows
// were core frame properties and now live in the host Stroke panel
// (driven in journey/plugins/draw-panels.journey.spec.ts). The schema
// panel draw still contributes is "Draw settings"
// (`media.paged.draw.panel.properties`), the panel its vectorGraphic
// context raises, so the spec drives that one.
//
// The document is built IN-TEST (no generated-corpus dependency): a
// rectangle (bounds-based, no path anchors) + an open polygon (a real
// path), mirroring plugin-draw's F1 conformance fixture.
//
// Coverage:
//   AC-SCHEMA-1  the schema panel mounts from the catalog: its sections
//                render through the host's schema renderer
//                (`data-schema-section`), and with a path selected its
//                rows are host PropertyFields over plugin kinds
//                (`data-plugin-property-field`, `data-property-kind`),
//                not bundle React;
//   AC-SCHEMA-2  the Path rows follow the selection: nothing selected →
//                no rows; the rectangle has no anchor table → an empty
//                points list; the polygon → its three points; back to
//                the rectangle → empty again (reactive, not one-shot).
//                The same rectangle-vs-path flip the dash gate proved,
//                with NO schema change.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { buildRectAndPolygonIdmlBase64 } from "./harness/build-min-idml";

const PANEL_ID = "media.paged.draw.panel.properties";

interface ElementRef {
  kind: string;
  id: string;
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
  };
  // The React SelectionContext setter — the catalog value bindings read
  // the React context; the panel's binding driver listens to
  // host.selection.onDidChange (the worker echo). Drive both, like the
  // element-scope panel specs do.
  setElementSelection: (ids: ElementRef[]) => void;
}

/** Load the in-test minimal IDML through the worker client. */
async function loadMinIdml(page: Page, base64: string): Promise<void> {
  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    await c.client.loadDocument(bytes);
  }, base64);
}

async function select(page: Page, ref: ElementRef): Promise<void> {
  await page.evaluate(async (target) => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    const ids = await c.client.setElementSelection([target], "replace");
    c.setElementSelection(ids);
  }, ref);
}

const RECT: ElementRef = { kind: "rectangle", id: "urect" };
const POLY: ElementRef = { kind: "polygon", id: "upoly" };

test.describe("E2E draw-schema-panel (the W3.1 declarative panel)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadMinIdml(page, buildRectAndPolygonIdmlBase64());
    await openPanel(page, PANEL_ID);
  });

  test("AC-SCHEMA-1 — Draw settings mounts from the catalog schema", async ({
    page,
  }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    await expect(panel).toBeVisible();
    // Sections come from the host's schema renderer.
    await expect(panel.locator('[data-schema-section="Selected object"]')).toBeVisible();
    await expect(panel.locator('[data-schema-section="Path"]')).toBeVisible();
    // With a path selected, its rows are host PropertyFields over draw's
    // object kinds — the type comes from the kind's schema row.
    await select(page, POLY);
    const points = panel.locator('[data-plugin-property-field="points"]');
    await expect(points).toHaveAttribute("data-property-kind", "plugin:media.paged.draw/path", {
      timeout: 5_000,
    });
    await expect(points).toHaveAttribute("data-property-targets", "1");
    await expect(points.locator('[data-property-field="points"]')).toHaveAttribute(
      "data-value-type",
      "list",
    );
  });

  test("AC-SCHEMA-2 — the Path rows follow the selection", async ({ page }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    const pointsList = panel.locator('[data-property-list="points"]');

    // Nothing selected: the selection-scoped rows have nothing to show.
    await expect(panel.locator("[data-plugin-property-field]")).toHaveCount(0);

    // The rectangle is bounds-based — no path-anchor table, so its point
    // list is empty.
    await select(page, RECT);
    await expect(pointsList).toHaveAttribute("data-list-length", "0", { timeout: 5_000 });

    // The polygon IS a path: its three anchors appear as list items.
    await select(page, POLY);
    await expect(pointsList).toHaveAttribute("data-list-length", "3", { timeout: 5_000 });
    await expect(pointsList.locator("[data-list-item]")).toHaveCount(3);

    // And back: re-selecting the rectangle empties it again.
    await select(page, RECT);
    await expect(pointsList).toHaveAttribute("data-list-length", "0", { timeout: 5_000 });
  });
});
