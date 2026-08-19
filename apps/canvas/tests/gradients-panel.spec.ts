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

// SDK Phase 5 — Gradients panel acceptance.
//
// Validates that the collection-select primitive's
// `valueType: "colorRef"` extension generalises to the gradients
// collection. The panel mounts and the bound select carries the
// expected data attributes; gradient apply via FillColor is
// covered by the existing FrameFillColor unit tests + the
// Swatches panel's AC-SWATCH-2 (both flow through the same
// apply arm).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/gradients.idml`;

test.describe("Phase 5 — Gradients panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.gradients");
  });

  test("AC-GRAD-1 — panel mounts as a composition with a gradients select @feat:color-swatches.gradients @feat:editor-shell.panels.gradients @level:smoke", async ({
    page,
  }) => {
    await expect(page.locator('[data-gradients-panel="ready"]')).toBeVisible();
    await expect(
      page.locator(
        '[data-gradients-panel="ready"] select[data-collection="gradients"][data-value-type="colorRef"]',
      ),
    ).toBeVisible();
  });

  // Coverage campaign P3 (Tier-1 depth): the panel's PRIMARY action driven
  // through the REAL select — not a mutate() that merely mirrors what the
  // select would do (the AC-SWATCH-2 shortcut this deliberately avoids).
  test("AC-GRAD-2 — the select lists the DOCUMENT's gradients and picking one lands frameFillColor on the selection @feat:color-swatches.gradients @feat:editor-shell.panels.gradients @level:happy", async ({
    page,
  }) => {
    const select = page.locator(
      '[data-gradients-panel="ready"] select[data-collection="gradients"][data-value-type="colorRef"]',
    );
    await expect(select).toBeVisible();

    // The options derive from the loaded document, not a canned list: the
    // gradients fixture ships real <Gradient> resources.
    const gradientIds = await select
      .locator('option[value^="Gradient/"]')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(gradientIds.length).toBeGreaterThan(0);

    // Select a frame the way the app does (worker + React context), then
    // drive the panel's select itself.
    const target = await page.evaluate(async () => {
      type DebugCanvas = {
        client: {
          executeScript(src: string): Promise<{ output: string[]; error: string | null }>;
          setElementSelection(ids: unknown[], mode: string): Promise<unknown[]>;
        };
        setElementSelection?(ids: unknown[]): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
      const walk = (nodes: Node[] | undefined): Node["id"] => {
        if (!nodes) return null;
        for (const n of nodes) {
          if (n.id && (n.id.kind === "rectangle" || n.id.kind === "textFrame")) return n.id;
          const found = walk(n.children);
          if (found) return found;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("gradients fixture has no selectable frame");
      const applied = await dbg.client.setElementSelection([target], "replace");
      dbg.setElementSelection?.(applied);
      return target;
    });

    const picked = gradientIds[0];
    await select.selectOption(picked);

    // The write landed in the MODEL (elementProperties readback), not just
    // in the widget.
    await expect
      .poll(
        () =>
          page.evaluate(async (t) => {
            type DebugCanvas = {
              client: {
                elementProperties(id: unknown): Promise<{
                  entries: Array<{
                    path: string;
                    value: { type: string; value: string | number | null } | null;
                  }>;
                } | null>;
              };
            };
            const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
            const props = await dbg?.client.elementProperties(t);
            return (
              props?.entries.find((e) => e.path === "frameFillColor")?.value?.value ?? null
            );
          }, target),
        { timeout: 5_000 },
      )
      .toBe(picked);
  });
});
