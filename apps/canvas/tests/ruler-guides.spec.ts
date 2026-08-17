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

// Plan-2 §8.3 — ruler guides acceptance.
//
// Loading an IDML with `<Guide>` elements surfaces them on the
// DocumentHandle so the overlay can render them and the snap pass
// treats them as targets. Verifies the wire round-trip end-to-end:
// parser → model → channel → main thread.
//
// Fixture: `corpus/generated/layout.idml` — license-clear, runs in
// lean CI. Its first body spread carries exactly 2 vertical `<Guide>`
// elements (the asymmetric-3col column boundaries at x=219.4253 and
// x=393.8507, PageIndex 0). The exact count is fixture-pinned — if
// paged-gen's layout sample changes, update the assertion to match.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const FIXTURE = `${REPO_ROOT}/corpus/generated/layout.idml`;

interface RulerGuideWire {
  pageId: string;
  orientation: "vertical" | "horizontal";
  location: number;
}

interface DocumentHandleWithGuides {
  pageIds: string[];
  rulerGuides?: RulerGuideWire[];
}

interface CanvasGlobal {
  client: {
    loadDocument: (
      bytes: Uint8Array,
    ) => Promise<DocumentHandleWithGuides>;
  };
}

test.describe("Plan-2 §8.3 — ruler guides", () => {
  test("DocumentHandle surfaces every Guide element from the IDML @feat:layout-model.guides @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    // Load the IDML directly through the channel and inspect the
    // returned handle in-place — avoids relying on the React state
    // path that the test driver's `loadIdml` doesn't run.
    const handle = await page.evaluate(
      async ({ pack }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const url = `/@fs${pack}`;
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        return c.client.loadDocument(bytes);
      },
      { pack: FIXTURE },
    );
    expect(handle.pageIds.length).toBeGreaterThan(0);

    const guides = handle.rulerGuides ?? [];
    // layout.idml is generated deterministically: exactly 2 vertical
    // guides on the first body page (the asymmetric-3col column
    // boundaries). Pin the count — a drop to 0 is the regression
    // this spec exists to catch, and a silent growth would mean the
    // fixture changed under us.
    expect(
      guides.length,
      "layout.idml ships exactly 2 ruler guides; the wire surface should expose them",
    ).toBe(2);
    // Each guide should carry a recognised orientation + a page id
    // present in the document's page list. For this fixture both are
    // vertical, at the generated column-boundary locations.
    const pageIds = new Set(handle.pageIds);
    for (const g of guides) {
      expect(g.orientation).toBe("vertical");
      expect(pageIds.has(g.pageId)).toBe(true);
      expect(Number.isFinite(g.location)).toBe(true);
    }
    const locations = guides.map((g) => g.location).sort((a, b) => a - b);
    expect(locations[0]).toBeCloseTo(219.4253, 3);
    expect(locations[1]).toBeCloseTo(393.8507, 3);
  });
});
