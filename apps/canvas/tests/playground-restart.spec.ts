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

// ED-12 — the playground's Restart stops the statement already running.
//
// The session aborts a run between statements (a token checked at each
// statement's gate), so a statement that was mid-flight when Restart was
// pressed ran to its end: in the developers film, draw-live's Pathfinder
// result landed in the NEXT document. A stale run's calls into paged.*,
// editor.* and demo.* now throw the session's stop signal, so the
// statement ends where it stood.
//
// Found on the way: the session held the `window.__canvas` object of the
// moment it was created, and the shell republishes that object on every
// render — so after a script's own File ▸ New, `editor.pageIds()` still
// named the previous document's pages. The playground now hands the
// session a live handle.

import { expect, test } from "@playwright/test";

import { Designer } from "./journey/driver/designer";
import { treeCount } from "./e2e/harness/viewport";

const SCRIPT = `await editor.runCommand("paged.file.new");
await (async () => {
  globalThis.__restartProbe = "waiting";
  await new Promise((r) => setTimeout(r, 1500));
  const pageId = editor.pageIds()[0];
  await editor.mutate({ op: "insertTextFrame", args: { pageId, bounds: [100, 100, 200, 300] } });
  globalThis.__restartProbe = "landed";
})();
await demo.wait(10);
`;

test.describe("ED-12 — playground restart", () => {
  test("AC-PLAYGROUND-RESTART-1 — Restart stops a statement mid-flight; its write never lands @level:edge", async ({
    page,
  }) => {
    await page.route("**/scripts/restart-probe.js", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: SCRIPT }),
    );
    const designer = new Designer(page);
    await designer.open({ search: "?script=restart-probe" });
    await expect(page.locator("[data-playground-play]")).toBeVisible({ timeout: 15_000 });

    await page.locator("[data-playground-play]").click();
    await expect
      .poll(() => page.evaluate(() => (globalThis as { __restartProbe?: string }).__restartProbe ?? null), {
        timeout: 15_000,
      })
      .toBe("waiting");
    await page.locator("[data-playground-restart]").click();

    // Well past the statement's own wait: had it run on, it would have
    // written by now.
    await page.waitForTimeout(2500);
    expect(
      await page.evaluate(() => (globalThis as { __restartProbe?: string }).__restartProbe),
    ).toBe("waiting");
    expect(await treeCount(page, "textFrame")).toBe(0);
  });

  test("AC-PLAYGROUND-RESTART-2 — a run nobody stops still writes through the guarded globals @level:happy", async ({
    page,
  }) => {
    await page.route("**/scripts/plain-run.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `await editor.runCommand("paged.file.new");
const pageId = editor.pageIds()[0];
const reply = await editor.mutate({ op: "insertTextFrame", args: { pageId, bounds: [100, 100, 200, 300] } });
await editor.select([reply.payload.createdId], "replace");
await paged.run("paged.pages().length");
globalThis.__plainRun = "done";
`,
      }),
    );
    const designer = new Designer(page);
    await designer.open({ search: "?script=plain-run" });
    await expect(page.locator("[data-playground-play]")).toBeVisible({ timeout: 15_000 });
    await page.locator("[data-playground-play]").click();
    await expect
      .poll(() => page.evaluate(() => (globalThis as { __plainRun?: string }).__plainRun ?? null), {
        timeout: 15_000,
      })
      .toBe("done");
    expect(await treeCount(page, "textFrame")).toBe(1);
    expect((await designer.elementSelection()).length).toBe(1);
  });
});
