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

// Journey: the paged.doc plugin workflow through the editor host.
//
// Host-integration smoke for the Word/DOCX bundle: "Place Word document…"
// picks a .docx, the bundle lowers it (docx wasm → Lowered IR) and pours
// native stories into the OPEN document (placeEmbedded — no destructive
// open), raises the outline panel, and the exporter re-emits .docx bytes.
// Save-back needs the v54/v55 engine doors; on older hosts the exporter
// degrades to the verbatim source bytes — still a valid .docx, so the
// export assertion holds on BOTH lanes. Deep DOCX semantics (styles,
// tables, hyperlinks, save-back diffing) are covered by plugin-doc's own
// 60+ conformance tests; this journey proves the editor wiring.

import { expect, test } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const DOCX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/doc-memo.docx",
);

const PLACE_CMD = "media.paged.doc.command.placeDoc";
const OUTLINE_PANEL = "media.paged.doc.panel.outline";
const DOCX_EXPORTER = "media.paged.doc.exporter.docx";

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
const openPanels = (page: Page) =>
  page.evaluate(() => {
    const p = (
      globalThis as unknown as {
        __canvas: { debugContext: () => { panels: { open: string[]; active: string | null } } };
      }
    ).__canvas.debugContext().panels;
    return [p.active, ...p.open].filter(Boolean) as string[];
  });

/** Pull the .docx exporter through the host exporter registry. */
async function exportDocx(
  page: Page,
): Promise<{ byteLength: number; magic: string } | { reason: string }> {
  return page.evaluate(async (exporterId) => {
    const reg = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            exporters?: {
              list: () => Array<{
                id: string;
                export: () =>
                  | Promise<{ bytes: Uint8Array; fileName: string } | null>
                  | { bytes: Uint8Array; fileName: string }
                  | null;
              }>;
            };
          };
        };
      }
    ).__canvas.registries.exporters;
    if (!reg) return { reason: "host serves no exporter registry" };
    const exp = reg.list().find((e) => e.id === exporterId);
    if (!exp) return { reason: `exporter ${exporterId} not registered` };
    const result = await exp.export();
    if (!result) return { reason: "exporter returned null (no placed doc?)" };
    const b = result.bytes;
    return {
      byteLength: b.length,
      magic: String.fromCharCode(b[0], b[1], b[2], b[3]),
    };
  }, DOCX_EXPORTER);
}

test.describe("journey · paged.doc plugin", () => {
  test("a designer places a Word document and its text renders as native content @feat:plugin-doc.embedded-placement @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const before = await designer.renderBytes();

    // PLACE — the bundle command opens the host file picker
    // (shell-file-picker's programmatic input.click() fires Playwright's
    // filechooser, same as the sheet journeys). Fire-and-feed: the command
    // promise resolves only after ingest completes.
    const chooser = page.waitForEvent("filechooser");
    const placed = invoke(page, PLACE_CMD);
    await (await chooser).setFiles(DOCX_FIXTURE);
    await placed;

    // The importer raises the outline panel after placement.
    await expect
      .poll(() => openPanels(page), { timeout: 15_000 })
      .toEqual(expect.arrayContaining([OUTLINE_PANEL]));

    // RENDER — the poured native story must actually paint. Poll a fresh
    // snapshot against the pre-place baseline (a single cold sample flakes;
    // see the journey-flake lesson) before pinning the count.
    await expect
      .poll(async () => designer.renderDiffPixels(before, await designer.renderBytes()), {
        timeout: 15_000,
      })
      .toBeGreaterThan(64);

    // EXPORT — the exporter re-emits a .docx (ZIP "PK\x03\x04"). With the
    // v54/v55 doors it is the edited save-back; without them it degrades to
    // the verbatim source — both are valid, so assert shape, log which lane.
    const out = await exportDocx(page);
    expect("reason" in out ? out.reason : "", `docx export did not drive`).toBe("");
    if (!("reason" in out)) {
      expect(out.magic.startsWith("PK")).toBe(true);
      expect(out.byteLength).toBeGreaterThan(500);
      // eslint-disable-next-line no-console
      console.log(`[journey] paged.doc export bytes=${out.byteLength}`);
    }
  });
});
