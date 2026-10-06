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

// Journey: a REMOTE data source, consented, refreshes on an interval.
//
// A local HTTP server stands in for a data origin. The editor reaches only
// the data origins its build lists (`PAGED_DATA_ORIGINS`, editor ADR 218), and
// only after the user consents (D-03):
//
//   · ADD — the Sources panel adds http://localhost:<port>/people.csv as a
//     remote source: nothing is fetched (the server counts requests).
//   · CONSENT — Request consent opens the editor's consent dialog; Allow.
//   · LOAD — Load fetches it once; bind `name`, Lower: the first record.
//   · INTERVAL — the source's refresh policy is set to every 15 s; the
//     server's CSV changes; the next poll sees new content and re-runs the
//     queries; Refresh fields writes the new value.
//
// Run with PAGED_DATA_ORIGINS=http://localhost:5297 in the environment the
// dev server starts in; without that origin listed the journey skips (and
// says why), since the page policy would refuse the fetch by design.

import { createServer, type Server } from "node:http";

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";
import { skipWithoutDuckDB } from "./data-duckdb-gate";
import { dataFields } from "./data-engine";

const PORT = 5297;
const ORIGIN = `http://localhost:${PORT}`;
const URL_ = `${ORIGIN}/people.csv`;
const NAME = `localhost_${PORT}_people`;
const SOURCES_PANEL = "media.paged.data.panel.sources";
const BINDINGS_PANEL = "media.paged.data.panel.bindings";
const LISTED = (process.env.PAGED_DATA_ORIGINS ?? "").split(/[\s,]+/).includes(ORIGIN);

let body = "name,role\nAda Lovelace,Author\nGrace Hopper,Engineer\n";
let requests = 0;
let server: Server | null = null;

test.beforeAll(async () => {
  if (!LISTED) return;
  server = createServer((req, res) => {
    // A data origin a cross-origin-isolated page may read: CORS + CORP.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (req.url?.startsWith("/people.csv")) {
      requests += 1;
      res.writeHead(200, { "Content-Type": "text/csv" }).end(body);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server!.listen(PORT, "localhost", ok));
});

test.afterAll(async () => {
  await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
});

const values = async (page: Page) => (await dataFields(page)).map((f) => f.value);

test.describe("journey · paged.data live remote source", () => {
  test("a consented remote source refreshes on its interval @feat:data.source.adapters @feat:data.security.gates @level:happy", async ({
    page,
  }) => {
    test.skip(!LISTED, `PAGED_DATA_ORIGINS must list ${ORIGIN} for the dev server (editor ADR 218)`);
    test.setTimeout(180_000);
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. ADD — a descriptor, nothing fetched ───────────────────────────
    await designer.runCommand("media.paged.data.command.importData");
    await openPanel(page, SOURCES_PANEL);
    await page.getByPlaceholder("https://example.com/data.csv").fill(URL_);
    await page.getByRole("button", { name: "Add remote" }).click();
    const item = page.locator("li[data-consent]").filter({ hasText: NAME });
    await expect(item).toHaveAttribute("data-consent", "required", { timeout: 10_000 });
    expect(requests, "defining a remote source fetches nothing").toBe(0);

    // ── 2. CONSENT — the editor's dialog, Allow ──────────────────────────
    await item.getByRole("button", { name: "Request consent" }).click();
    const dialog = page.getByTestId("consent-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.locator(`[data-testid="consent-origin"][data-origin="${ORIGIN}"]`)).toBeVisible();
    // The build lists the origin, so the dialog does not warn it stays blocked.
    await expect(dialog.locator(`[data-testid="consent-origin-blocked"][data-origin="${ORIGIN}"]`)).toHaveCount(0);
    await dialog.locator(`[data-testid="consent-origin"][data-origin="${ORIGIN}"]`).check();
    await dialog.getByTestId("consent-allow").click();
    await expect(item).toHaveAttribute("data-consent", "granted", { timeout: 10_000 });
    expect(requests, "consent alone fetches nothing").toBe(0);

    // ── 3. LOAD + BIND + LOWER ────────────────────────────────────────────
    await item.getByRole("button", { name: "Load" }).click();
    try {
      await expect(item).toHaveAttribute("data-status", "loaded", { timeout: 45_000 });
    } catch {
      const got = (await item.getAttribute("data-status").catch(() => null)) ?? "unknown";
      skipWithoutDuckDB(got, `the live-source journey needs the remote load (status "${got}")`);
    }
    expect(requests).toBe(1);
    await openPanel(page, BINDINGS_PANEL);
    await page.locator("[data-data-bind-field]").fill("name");
    await page.locator("[data-data-bind-add]").click();
    await expect(page.locator("[data-data-bind-msg]")).toContainText("variable binding");
    await page.getByRole("button", { name: /lower to document/i }).click();
    await expect.poll(() => values(page), { timeout: 20_000 }).toEqual(["Ada Lovelace"]);

    // ── 4. INTERVAL — the server's data changes; the poll picks it up ─────
    await openPanel(page, SOURCES_PANEL);
    await item.locator(`[data-data-refresh-policy="${NAME}"] select`).selectOption("interval");
    await item.locator(`[data-data-refresh-policy="${NAME}"] input[type="number"]`).fill("15");
    await expect(item.locator(`[data-data-refresh-policy="${NAME}"]`)).toContainText("polling", { timeout: 10_000 });
    body = "name,role\nAda King,Countess\nGrace Hopper,Engineer\n";
    const before = requests;
    await expect.poll(() => requests, { timeout: 45_000, intervals: [1_000] }).toBeGreaterThan(before);
    // The poll re-runs the queries once it has the new content; Refresh
    // fields then writes the new value (asked until the re-run has landed).
    await openPanel(page, BINDINGS_PANEL);
    const refreshFields = page.getByRole("button", { name: /refresh fields/i });
    await expect
      .poll(
        async () => {
          await refreshFields.click();
          return values(page);
        },
        { timeout: 30_000, intervals: [1_000] },
      )
      .toEqual(["Ada King"]);
  });
});
