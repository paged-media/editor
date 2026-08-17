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

// plugin-doc.file-entry — the .docx/.dotx FILE ENTRY doors. The doc
// journey drives the COMMAND lane (placeDoc); what nothing asserted
// until now is the IMPORTER lane: `media.paged.doc.importer.docx` in
// the File▸Open importer-registry UNION (K-2/S-06 — the same union
// FileDrop consults), and the actual File▸Open command routing a picked
// .docx through it instead of the default IDML loader. Both are the
// registry row's named gap ("no test feeds it a .docx" through
// File▸Open) — closed here at the union + command altitude; deep DOCX
// semantics stay with plugin-doc's own conformance suite.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";

type Page = import("@playwright/test").Page;

const DOCX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "harness/doc-memo.docx",
);

const IMPORTER_ID = "media.paged.doc.importer.docx";
const OUTLINE_PANEL = "media.paged.doc.panel.outline";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// "Open…" — the id keeps the historic name; the picker's accept list is
// the importer-registry union, so this one door opens every registered
// format (file-commands.ts).
const OPEN_COMMAND = "paged.file.openIdml";

type CanvasGlobal = {
  __canvas: {
    ready: boolean;
    registries: {
      commands: { invoke: (id: string) => Promise<unknown> };
      importers: {
        list: () => Array<{
          id: string;
          title: string;
          extensions: readonly string[];
          mimeTypes?: readonly string[];
        }>;
        resolve: (name: string, mime?: string) => { id: string } | null;
      };
    };
    debugContext: () => {
      panels: { open: string[]; active: string | null };
    };
  };
};

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (cmd) =>
      (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(
        cmd,
      ),
    id,
  );

const openPanels = (page: Page) =>
  page.evaluate(() => {
    const p = (globalThis as unknown as CanvasGlobal).__canvas.debugContext()
      .panels;
    return [p.active, ...p.open].filter(Boolean) as string[];
  });

/** Bundle activation is async after boot — poll the union until the doc
 *  importer has registered (startup-only wiring, the B-14/B-15 lesson). */
const resolveDocx = (page: Page) =>
  page.evaluate(
    () =>
      (
        globalThis as unknown as CanvasGlobal
      ).__canvas.registries.importers.resolve("doc-memo.docx")?.id ?? null,
  );

test.describe("plugin-doc — file entry (File▸Open importer union)", () => {
  test("AC-DOCFE-1 — the .docx importer joins the File▸Open union: extensions, MIME, and resolve() route to it @feat:plugin-doc.file-entry @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await expect.poll(() => resolveDocx(page), { timeout: 15_000 }).toBe(
      IMPORTER_ID,
    );

    const probe = await page.evaluate(
      ({ importerId, mime }) => {
        const reg = (globalThis as unknown as CanvasGlobal).__canvas.registries
          .importers;
        const listed = reg.list().find((i) => i.id === importerId) ?? null;
        return {
          listed: listed
            ? {
                title: listed.title,
                extensions: [...listed.extensions],
                mimeTypes: [...(listed.mimeTypes ?? [])],
              }
            : null,
          // The union resolves by EXTENSION first (both Word forms)…
          byDocxName: reg.resolve("doc-memo.docx")?.id ?? null,
          byDotxName: reg.resolve("letterhead.dotx")?.id ?? null,
          // …then by MIME when the name claims nothing (drag-drop's lane).
          byMime: reg.resolve("word-payload.bin", mime)?.id ?? null,
        };
      },
      { importerId: IMPORTER_ID, mime: DOCX_MIME },
    );

    expect(probe.listed).not.toBeNull();
    expect(probe.listed?.extensions).toEqual(
      expect.arrayContaining([".docx", ".dotx"]),
    );
    expect(probe.listed?.mimeTypes).toContain(DOCX_MIME);
    expect(probe.byDocxName).toBe(IMPORTER_ID);
    expect(probe.byDotxName).toBe(IMPORTER_ID);
    expect(probe.byMime).toBe(IMPORTER_ID);
  });

  test("AC-DOCFE-2 — File▸Open with a picked .docx routes through the importer: ingest runs and the outline panel raises @feat:plugin-doc.file-entry @level:gesture", async ({
    page,
  }) => {
    await openCanvas(page);

    // A placement target must exist BEFORE the ingest (placeEmbedded pours
    // into the OPEN document); File▸New through the real command path.
    await invoke(page, "paged.file.new");
    await page.waitForFunction(
      () => (globalThis as unknown as CanvasGlobal).__canvas.ready === true,
      null,
      { timeout: 15_000 },
    );
    await expect.poll(() => resolveDocx(page), { timeout: 15_000 }).toBe(
      IMPORTER_ID,
    );

    // Drive the ONE File▸Open door. Its pickFile input.click() fires
    // Playwright's filechooser; the command promise resolves only after the
    // routed importer's ingest completes (file-commands.ts awaits import()).
    const chooser = page.waitForEvent("filechooser");
    const opened = invoke(page, OPEN_COMMAND);
    await (await chooser).setFiles(DOCX_FIXTURE);
    await opened;

    // The importer (not the IDML loader) owned the file: the doc bundle's
    // ingest raised its outline panel over the retained LoweredDoc.
    await expect
      .poll(() => openPanels(page), { timeout: 15_000 })
      .toEqual(expect.arrayContaining([OUTLINE_PANEL]));
    await expect(page.locator('[data-doc-panel="ready"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("[data-doc-summary]")).toContainText(
      "paragraphs",
    );
  });
});
