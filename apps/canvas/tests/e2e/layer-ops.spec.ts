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

// E2E op suite — layers. Generated fixtures expose no document layer
// (client.layers() is empty), so these prove the layer ops land in
// the MODEL against a scratch layer: insert grows the layer list,
// set-name/visible/locked/printable flip the summary, each undoable
// with no collateral repaint (an empty layer paints nothing). The
// render proof — toggling a populated layer hides its frames — needs
// a real document and lives in real-doc-smoke.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadFixture, type LoadedFixture } from "./harness/fixtures";
import { dumpDoc } from "./harness/model-dump";
import { opSandwich } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

interface LayerSummary {
  selfId: string;
  name: string | null;
  visible: boolean;
  locked: boolean;
  printable: boolean;
}

async function layers(page: Page): Promise<LayerSummary[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { layers: () => Promise<LayerSummary[]> } };
      }
    ).__canvas;
    return c.client.layers();
  });
}

/** Insert a scratch layer, return its id (setup for set-* probes). */
async function insertScratchLayer(page: Page, name: string): Promise<string> {
  await mutate(page, { op: "layerInsert", args: { position: 0, name } });
  const ls = await layers(page);
  return ls[0].selfId;
}

test.describe("E2E layer ops", () => {
  let fx: LoadedFixture;
  let pageInfo: { pageId: string; widthPt: number };

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    pageInfo = fx.pages[0];
  });

  test("AC-E2E-LAYER-1 — layerInsert grows the layer list; undo removes it @feat:layers.ops @level:happy", async ({
    page,
  }) => {
    const before = (await layers(page)).length;
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      noRenderChange: true,
      dumpModel: () => dumpDoc(page, []),
      apply: async () => {
        await mutate(page, {
          op: "layerInsert",
          args: { position: 0, name: "e2e layer" },
        });
      },
      expectModel: async () => {
        const ls = await layers(page);
        expect(ls.length).toBe(before + 1);
        expect(ls.some((l) => l.name === "e2e layer")).toBe(true);
      },
    });
  });

  test("AC-E2E-LAYER-2 — layerSetName renames the layer; undo restores @feat:layers.ops @level:happy", async ({
    page,
  }) => {
    const id = await insertScratchLayer(page, "e2e original");
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      noRenderChange: true,
      dumpModel: () => dumpDoc(page, []),
      apply: async () => {
        await mutate(page, {
          op: "layerSetName",
          args: { layerId: id, name: "e2e renamed" },
        });
      },
      expectModel: async () => {
        expect((await layers(page)).find((l) => l.selfId === id)?.name).toBe(
          "e2e renamed",
        );
      },
    });
  });

  test("AC-E2E-LAYER-3 — layerSetVisible / layerSetLocked / layerSetPrintable flip the summary @feat:layers.ops @level:happy", async ({
    page,
  }) => {
    const id = await insertScratchLayer(page, "e2e flags");
    for (const [op, key] of [
      ["layerSetVisible", "visible"],
      ["layerSetLocked", "locked"],
      ["layerSetPrintable", "printable"],
    ] as const) {
      const arg = key === "visible" ? "visible" : key;
      const value = key === "locked"; // lock→true, visible→false, printable→false
      await opSandwich(page, {
        pageId: pageInfo.pageId,
        pageWidthPt: pageInfo.widthPt,
        noRenderChange: true,
        dumpModel: () => dumpDoc(page, []),
        apply: async () => {
          await mutate(page, { op, args: { layerId: id, [arg]: value } });
        },
        expectModel: async () => {
          const l = (await layers(page)).find((x) => x.selfId === id)!;
          expect(l[key]).toBe(value);
        },
      });
    }
  });
});
