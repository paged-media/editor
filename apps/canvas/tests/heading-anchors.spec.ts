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

// ED-20 — heading-anchor badges.
//
// The engine's Tier 3 resolver reports where each heading anchor
// landed, and the page decorations drew every one as a green badge
// ("⚓ 1 — The Picture") on every document that had a heading — chrome
// the document does not wear and nobody asked for. And the worker ran
// the resolver only on load, so after the heading was edited the badge
// kept quoting the old text. The badges are a diagnostic of the
// resolver: View ▸ Show heading anchors turns them on, and the resolver
// re-runs after edits.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";
import { generatedFixture } from "./e2e/harness/fixtures";

/** navigation.idml: two headings the resolver reports as anchors. */
async function loadNavigation(page: Page): Promise<void> {
  await openCanvas(page);
  await page.setInputFiles('input[type="file"]', generatedFixture("navigation"));
  await page.waitForFunction(
    () => (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas?.ready === true,
    null,
    { timeout: 30_000 },
  );
}

/** The badges the canvas draws, by their text. */
function badges(page: Page) {
  return page.locator("svg g text").filter({ hasText: / — / });
}

async function invoke(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (cid) =>
      (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (id: string) => unknown } } };
        }
      ).__canvas.registries.commands.invoke(cid),
    id,
  );
}

test.describe("ED-20 — heading-anchor badges", () => {
  test("AC-ANCHOR-1 — a document with headings wears no badges until asked @feat:cross-references-hyperlinks.cross-references @level:edge", async ({
    page,
  }) => {
    await loadNavigation(page);
    // Give the resolver's reply time to land, as it did before.
    await page.waitForTimeout(1000);
    await expect(badges(page)).toHaveCount(0);

    await invoke(page, "paged.view.toggleHeadingAnchors");
    await expect(badges(page).filter({ hasText: "Getting Started" })).toHaveCount(1);
    await invoke(page, "paged.view.toggleHeadingAnchors");
    await expect(badges(page)).toHaveCount(0);
  });

  test("AC-ANCHOR-2 — a badge follows its heading's edits @feat:cross-references-hyperlinks.cross-references @level:edge", async ({
    page,
  }) => {
    await loadNavigation(page);
    await invoke(page, "paged.view.toggleHeadingAnchors");
    await expect(badges(page).filter({ hasText: "1 — Getting Started" })).toHaveCount(1);

    const reply = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { mutate: (m: unknown) => Promise<{ kind: string }> } };
        }
      ).__canvas;
      return (
        await c.client.mutate({
          op: "insertText",
          args: { storyId: "u311c12", offset: 0, text: "Edited " },
        })
      ).kind;
    });
    expect(reply).toBe("mutationApplied");
    await expect(badges(page).filter({ hasText: "1 — Edited Getting Started" })).toHaveCount(
      1,
      { timeout: 10_000 },
    );
  });
});
