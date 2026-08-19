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

// W2.12 — Anchored Object panel acceptance. The panel is LIVE on the
// W1.16 AnchoredObjectSetting surface (protocol v35): selecting a
// frame anchored into a text story surfaces ten `anchored*`
// PropertyEntries, which the panel reads back into the position
// controls. A non-anchored (or empty) selection states it honestly —
// no fake enable. The op-level round-trip lives in
// e2e/anchored-ops.spec.ts; this proves detection + read-back + the
// honest non-anchored state render.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/anchored.idml`;

// The anchored.idml fixture's anchored TextFrame (carries an
// `<AnchoredObjectSetting AnchoredPosition="InlinePosition" …>`).
const ANCHORED_FRAME = "ucbd39a";

interface ElementIdShape {
  kind: string;
  id: string;
}

async function selectFrame(page: Page, kind: string, id: string) {
  await page.evaluate(
    async ({ kind, id }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              setElementSelection: (
                ids: ElementIdShape[],
                mode: string,
              ) => Promise<ElementIdShape[]>;
            };
            setElementSelection: (ids: ElementIdShape[]) => void;
          };
        }
      ).__canvas;
      const ids = await c.client.setElementSelection([{ kind, id }], "replace");
      c.setElementSelection(ids);
    },
    { kind, id } as { kind: string; id: string },
  );
}

/** Find a page-level (non-anchored) text frame id from the scene
 *  tree — anything that is NOT the anchored fixture frame. */
async function firstNonAnchoredFrame(
  page: Page,
): Promise<ElementIdShape | null> {
  return page.evaluate(async (anchoredId) => {
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
    const treeJson = await c.client
      .executeScript("paged.tree()")
      .then((r) => r.output[0] ?? "[]");
    const tree = JSON.parse(treeJson) as Array<Record<string, unknown>>;
    let found: ElementIdShape | null = null;
    const walk = (n: Record<string, unknown>) => {
      const id = n.id as ElementIdShape | null | undefined;
      if (
        !found &&
        id &&
        id.id !== anchoredId &&
        (id.kind === "textFrame" || id.kind === "rectangle")
      ) {
        found = id;
      }
      (n.children as Array<Record<string, unknown>> | undefined)?.forEach(walk);
    };
    tree.forEach(walk);
    return found;
  }, ANCHORED_FRAME);
}

test.describe("W2.12 — Anchored Object panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.anchored");
  });

  test("AC-ANCH-1 — empty selection states honestly (no fake enable) @feat:anchored-inline-objects.anchored-frames @feat:editor-shell.panels.anchored @level:edge", async ({
    page,
  }) => {
    const root = page.locator('[data-anchored-panel="ready"]');
    await expect(root).toBeVisible();
    await expect(root.locator("[data-anchored-status]")).toHaveAttribute(
      "data-anchored-status",
      "none",
    );
    // No live position controls render without an anchored selection.
    await expect(root.locator("[data-anchored-select]")).toHaveCount(0);
    await expect(root.locator("[data-anchored-empty]")).toBeVisible();
  });

  test("AC-ANCH-2 — a non-anchored frame is reported as not anchored @feat:anchored-inline-objects.anchored-frames @feat:editor-shell.panels.anchored @level:happy", async ({
    page,
  }) => {
    const ref = await firstNonAnchoredFrame(page);
    expect(ref, "fixture has a page-level frame").toBeTruthy();
    await selectFrame(page, ref!.kind, ref!.id);
    const root = page.locator('[data-anchored-panel="ready"]');
    await expect(root.locator("[data-anchored-status]")).toHaveAttribute(
      "data-anchored-status",
      "not-anchored",
    );
    await expect(root.locator("[data-anchored-select]")).toHaveCount(0);
  });

  test("AC-ANCH-3 — an anchored frame reads back its live position values @feat:anchored-inline-objects.anchored-frames @feat:editor-shell.panels.anchored @level:happy", async ({
    page,
  }) => {
    await selectFrame(page, "textFrame", ANCHORED_FRAME);
    const root = page.locator('[data-anchored-panel="ready"]');
    await expect(root.locator("[data-anchored-status]")).toHaveAttribute(
      "data-anchored-status",
      "anchored",
    );
    // The fixture's AnchoredPosition="InlinePosition" reflects on the
    // mode select.
    await expect(
      root.locator('[data-anchored-select="position"]'),
    ).toHaveValue("InlinePosition");
    // SpineRelative="true" → the spine-relative toggle is on.
    await expect(
      root.locator('[data-anchored-toggle="spine-relative"]'),
    ).toHaveAttribute("aria-checked", "true");
    // LockPosition="false" → the lock toggle is off.
    await expect(
      root.locator('[data-anchored-toggle="lock-position"]'),
    ).toHaveAttribute("aria-checked", "false");
    // In inline mode the custom-position controls are disabled
    // (honest — they only apply in Custom/Anchored mode).
    await expect(
      root.locator('[data-anchored-select="v-reference"]'),
    ).toBeDisabled();
    await expect(root.locator("[data-anchored-custom-hint]")).toBeVisible();
  });

  test("AC-ANCH-4 — switching to Custom enables the offset + reference controls @feat:anchored-inline-objects.anchored-frames @feat:editor-shell.panels.anchored @level:happy", async ({
    page,
  }) => {
    await selectFrame(page, "textFrame", ANCHORED_FRAME);
    const root = page.locator('[data-anchored-panel="ready"]');
    const mode = root.locator('[data-anchored-select="position"]');
    await mode.selectOption("Anchored");
    // The binding re-reads after the commit; the mode reflects.
    await expect(mode).toHaveValue("Anchored");
    // Custom controls light up.
    await expect(
      root.locator('[data-anchored-select="v-reference"]'),
    ).toBeEnabled();
    await expect(
      root.locator('[data-anchored-num="x-offset"] input'),
    ).toBeEnabled();
    await expect(root.locator("[data-anchored-custom-hint]")).toHaveCount(0);
  });
});
