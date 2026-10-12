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

// ED-10 — a face the editor SHIPS is not a missing font.
//
// The editor bundles Inter and hands its bytes to the engine as the
// default face every unresolved family falls back to — but never under
// its NAME. So a document that names Inter (every document the editor
// makes, most generated fixtures) was reported as substituting it:
// `FontSummary.isMissing`, the Missing fonts count, the substitution
// highlight, all for a face that is right there. The editor now
// registers its bundled face by name before each load, unless the
// session has registered that family itself.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";
import { generatedFixture } from "./e2e/harness/fixtures";

async function fonts(page: Page): Promise<Array<{ family: string; isMissing?: boolean }>> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<Array<{ family: string; isMissing?: boolean }>>;
          };
        };
      }
    ).__canvas;
    return c.client.collection("fonts");
  });
}

test.describe("ED-10 — the bundled face", () => {
  test("AC-FONT-BUNDLED-1 — a document naming Inter does not report it missing @feat:editor-shell.panels.fonts @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', generatedFixture("styles-cascade"));
    await page.waitForFunction(
      () => (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas?.ready === true,
      null,
      { timeout: 30_000 },
    );
    const list = await fonts(page);
    const inter = list.find((f) => f.family === "Inter");
    expect(inter, `the fixture names Inter (${list.map((f) => f.family).join(", ")})`).toBeTruthy();
    expect(inter!.isMissing, "Inter ships with the editor").toBe(false);
  });
});
