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

// E2E — paged.draw's v1 declarative SCHEMA panel (plugin-sdk W3.1,
// closes plugin-draw B-01) through the REAL editor.
//
// The bundle registers its stroke panel as a `SchemaPanelContribution`
// (pure data, NO React across the boundary) via
// `host.contribute.schemaPanel`. The editor injects its
// `SchemaPanelRenderer` into `createBundleHost`, so the panel renders
// from the CATALOG (the same primitive leaves the editor's own panels
// use) with row enablement + section visibility driven by the bundle's
// PUBLISHED bindings (`host.bindings`) — a derived bound value, NOT a
// `visibleWhen` conditional (the B-01 resolution).
//
// The document is built IN-TEST (no generated-corpus dependency): a
// rectangle (bounds-based, no path anchors) + an open polygon (a real
// path), mirroring plugin-draw's F1 conformance fixture.
//
// Coverage:
//   AC-SCHEMA-1  the schema panel mounts from the catalog: the stroke
//                weight row + cap toggle render (widget ids, not bundle
//                React);
//   AC-SCHEMA-2  the dash SECTION's visibility flips with the selection
//                binding: hidden for the rectangle (no path anchors →
//                dashControlsVisible=false), shown for the polygon (a
//                path → true). The binding flip is the load-bearing
//                proof of the B-01 mechanism.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { buildRectAndPolygonIdmlBase64 } from "./harness/build-min-idml";

const PANEL_ID = "media.paged.draw.panel.stroke";

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

  test("AC-SCHEMA-1 — the stroke panel mounts from the catalog schema", async ({
    page,
  }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    await expect(panel).toBeVisible();
    // The weight row renders through the numeric-scrub catalog leaf
    // (the same primitive the editor's own panels use) — a NumberInput.
    await expect(panel.locator("input").first()).toBeVisible();
    // The cap toggle renders through the toggle-group leaf.
    await expect(panel.locator("[data-toggle-group]").first()).toBeVisible();
  });

  test("AC-SCHEMA-2 — the dash section visibility flips with the selection binding", async ({
    page,
  }) => {
    const panel = page.locator(`[data-schema-panel="${PANEL_ID}"]`);
    const dashSection = panel.locator('[data-schema-section="Dashes"]');

    // The rectangle is bounds-based — no path-anchor table, so the
    // bundle publishes dashControlsVisible=false and the host hides the
    // dash section.
    await select(page, RECT);
    await expect(dashSection).toHaveCount(0);

    // The polygon IS a path (exposes a path-anchor table) — the bundle
    // publishes dashControlsVisible=true and the host SHOWS the section.
    // The binding-driven gate flips with NO schema change.
    await select(page, POLY);
    await expect(dashSection).toBeVisible({ timeout: 5_000 });

    // And back: re-selecting the rectangle hides it again (the gate is
    // reactive, not one-shot).
    await select(page, RECT);
    await expect(dashSection).toHaveCount(0);
  });
});
