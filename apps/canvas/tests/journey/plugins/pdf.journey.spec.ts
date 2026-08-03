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

// Journey: the paged.pdf plugin through the editor host.
//
// File ▸ Open PDF… host-integration smoke: the menu command's picker feeds
// the pdf importer (pdf.js reconstruction → IDML → destructive
// nativeDocument.open) and the opened document's pages actually paint.
// This also guards the command's known silent-no-op failure mode (it
// returns quietly if the importer never registered): a no-op leaves the
// blank document untouched and the pixel poll fails. PDF *fidelity* is
// covered by plugin-publish's own tests; this proves the editor wiring.

import { expect, test } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const PDF_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/sample.pdf",
);

const OPEN_PDF_CMD = "paged.file.openPdf";

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (cmd) =>
      (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (c: string) => Promise<unknown> } } };
        }
      ).__canvas.registries.commands.invoke(cmd),
    id,
  );

test.describe("journey · paged.pdf plugin", () => {
  test("a designer opens a PDF via File ▸ Open PDF… and its pages render @feat:plugin-pdf.pdf-import @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const blank = await designer.renderBytes();

    // The command's pickFiles creates + clicks a real input, so Playwright's
    // filechooser fires (same as the doc/sheet journeys). The command promise
    // resolves only after the import completed (or silently no-oped).
    const chooser = page.waitForEvent("filechooser");
    const opened = invoke(page, OPEN_PDF_CMD);
    await (await chooser).setFiles(PDF_FIXTURE);
    await opened;

    // Destructive open swaps the document; the handle refreshes. The pdf
    // lane (pdf.js + wasm mapper) is the slowest importer — poll generously.
    await expect
      .poll(async () => (await designer.handle()).pageCount, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => designer.renderDiffPixels(blank, await designer.renderBytes()), {
        timeout: 30_000,
      })
      .toBeGreaterThan(64);

    const { pageCount } = await designer.handle();
    // eslint-disable-next-line no-console
    console.log(`[journey] paged.pdf opened pages=${pageCount}`);
  });
});
