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

// Site mode (`?site=1`, website ADR 855): paged.media embeds the editor and
// hands it its pages as documents over postMessage. This drives the real
// bridge from a parent page on an allowed origin (localhost, dev build): the
// editor announces itself, opens the document it is handed, docks the Site
// panel, and asks the parent to navigate when the panel is used.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/text.idml`;

const PARENT = `<!doctype html><meta charset="utf-8"><title>parent</title>
<body style="margin:0">
<iframe id="f" src="/?site=1" allow="cross-origin-isolated" style="width:1600px;height:1000px;border:0"></iframe>
<script>
  window.__events = [];
  const f = document.getElementById("f");
  addEventListener("message", async (e) => {
    if (e.source !== f.contentWindow) return;
    window.__events.push(e.data);
    if (e.data.type === "paged:ready") {
      f.contentWindow.postMessage({ type: "paged:site", manifest: {
        routes: { "/core/": { title: "paged core", pages: [{ id: "hero", title: "Core" }], product: null } },
        nav: [{ route: "/core/", title: "paged core", group: "Platform" }, { route: "/sdk/", title: "plugin SDK", group: "Platform" }],
      } }, location.origin);
      const bytes = await (await fetch("/__site-fixture.idml")).arrayBuffer();
      f.contentWindow.postMessage({ type: "paged:open", route: "/core/", page: 0, name: "paged.media — core", bytes, fonts: [] }, location.origin, [bytes]);
    }
  });
</script>`;

test.describe("site mode — the editor as paged.media's shell", () => {
  test("opens the page it is handed, docks the Site panel, and asks the parent to navigate", async ({ page }) => {
    await page.route("**/__site-parent.html", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" },
        body: PARENT,
      }),
    );
    await page.route("**/__site-fixture.idml", (route) =>
      route.fulfill({ status: 200, contentType: "application/octet-stream", body: readFileSync(FIXTURE) }),
    );
    await page.goto("/__site-parent.html");

    const events = () => page.evaluate(() => (window as unknown as { __events: Array<{ type: string }> }).__events);
    await expect.poll(async () => (await events()).map((e) => e.type), { timeout: 60_000 }).toContain("paged:ready");
    await expect
      .poll(async () => (await events()).find((e) => e.type === "paged:opened") as { pageCount?: number } | undefined, { timeout: 60_000 })
      .toMatchObject({ type: "paged:opened", route: "/core/" });

    const frame = page.frameLocator("#f");
    const panel = frame.getByTestId("site-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("paged core");

    await panel.getByRole("button", { name: "plugin SDK" }).click();
    await expect
      .poll(async () => (await events()).find((e) => e.type === "paged:navigate"))
      .toMatchObject({ type: "paged:navigate", route: "/sdk/" });

    await panel.getByRole("button", { name: "Read as web page" }).click();
    await expect
      .poll(async () => (await events()).filter((e) => e.type === "paged:navigate").length)
      .toBe(2);
  });
});
