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

// plugin-doc.verbatim-export — the zero-edit .docx exporter through the
// editor's Export Center registry. The doc journey asserts "some valid
// .docx came back"; this spec pins what the FEATURE promises: the
// exporter registers in the host exporter registry (the Export Center's
// source), answers an honest NULL with nothing placed, and on the
// verbatim lane re-emits the retained OPC source BYTE-IDENTICAL — the
// preservation invariant delivered through the editor door. When a
// future host serves the v54 read door the edited lane takes over; the
// lane is read from the panel's readiness attribute so this spec stays
// honest on both.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";

type Page = import("@playwright/test").Page;

const DOCX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "harness/doc-memo.docx",
);

const EXPORTER_ID = "media.paged.doc.exporter.docx";
const PLACE_CMD = "media.paged.doc.command.placeDoc";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type CanvasGlobal = {
  __canvas: {
    ready: boolean;
    registries: {
      commands: { invoke: (id: string) => Promise<unknown> };
      exporters?: {
        list: () => Array<{
          id: string;
          title: string;
          extension: string;
          mimeType?: string;
          export: () =>
            | Promise<{ bytes: Uint8Array; fileName: string } | null>
            | { bytes: Uint8Array; fileName: string }
            | null;
        }>;
      };
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

/** Bundle activation is async after boot — poll until the exporter shows
 *  up in the registry (startup-only wiring, the B-14/B-15 lesson). */
const exporterRegistered = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as unknown as CanvasGlobal).__canvas.registries.exporters
        ?.list()
        .find((e) => e.id === "media.paged.doc.exporter.docx")?.id ?? null,
  );

/** Pull the exporter and return the full byte payload (the fixture is
 *  ~2 KB, so crossing the evaluate boundary as number[] is cheap). */
const runExport = (page: Page) =>
  page.evaluate(async (exporterId) => {
    const reg = (globalThis as unknown as CanvasGlobal).__canvas.registries
      .exporters;
    if (!reg) return { reason: "host serves no exporter registry" };
    const exp = reg.list().find((e) => e.id === exporterId);
    if (!exp) return { reason: `exporter ${exporterId} not registered` };
    const result = await exp.export();
    if (!result) return { nulled: true as const };
    return {
      fileName: result.fileName,
      bytes: Array.from(result.bytes),
    };
  }, EXPORTER_ID);

test.describe("plugin-doc — verbatim export (Export Center door)", () => {
  test("AC-DOCVE-1 — the Word exporter registers in the Export Center registry and answers NULL before any doc is placed @feat:plugin-doc.verbatim-export @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await expect
      .poll(() => exporterRegistered(page), { timeout: 15_000 })
      .toBe(EXPORTER_ID);

    const info = await page.evaluate((exporterId) => {
      const exp = (
        globalThis as unknown as CanvasGlobal
      ).__canvas.registries.exporters
        ?.list()
        .find((e) => e.id === exporterId);
      return exp
        ? { title: exp.title, extension: exp.extension, mimeType: exp.mimeType }
        : null;
    }, EXPORTER_ID);
    expect(info?.extension).toBe(".docx");
    expect(info?.mimeType).toBe(DOCX_MIME);
    expect(info?.title).toContain("Word");

    // Honesty before capability: with nothing placed there is no source
    // package to re-emit, and the exporter says so with null — it never
    // fabricates bytes.
    const empty = await runExport(page);
    expect(empty).toEqual({ nulled: true });
  });

  test("AC-DOCVE-2 — a placed Word document exports as a valid .docx; the verbatim lane re-emits the source BYTE-IDENTICAL @feat:plugin-doc.verbatim-export @level:happy", async ({
    page,
  }) => {
    const source = readFileSync(DOCX_FIXTURE);

    await openCanvas(page);
    await invoke(page, "paged.file.new");
    await page.waitForFunction(
      () => (globalThis as unknown as CanvasGlobal).__canvas.ready === true,
      null,
      { timeout: 15_000 },
    );
    await expect
      .poll(() => exporterRegistered(page), { timeout: 15_000 })
      .toBe(EXPORTER_ID);

    // Place the memo through the bundle's command door (fire-and-feed:
    // the command promise resolves only after ingest completes).
    const chooser = page.waitForEvent("filechooser");
    const placed = invoke(page, PLACE_CMD);
    await (await chooser).setFiles(DOCX_FIXTURE);
    await placed;
    await expect(page.locator('[data-doc-panel="ready"]')).toBeVisible({
      timeout: 15_000,
    });

    // Which lane can run is the HOST's fact — read it off the panel's
    // readiness line rather than assuming.
    const readiness = await page
      .locator("[data-doc-readiness]")
      .getAttribute("data-doc-readiness");
    expect(["live", "verbatim"]).toContain(readiness);

    const out = await runExport(page);
    if ("reason" in out) throw new Error(out.reason);
    if ("nulled" in out) throw new Error("exporter returned null after place");
    // A .docx is an OPC ZIP: local-file magic + a plausible package size.
    const bytes = Buffer.from(out.bytes);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("PK\x03\x04");
    expect(bytes.length).toBeGreaterThan(500);
    expect(out.fileName.endsWith(".docx")).toBe(true);

    if (readiness === "verbatim") {
      // The feature's invariant: the retained OPC package comes back
      // UNCHANGED — byte-identical to what went in.
      expect(bytes.length).toBe(source.length);
      expect(bytes.equals(source)).toBe(true);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        "[doc-verbatim-export] host serves the read door — edited lane ran; " +
          "verbatim byte-identity not applicable this run",
      );
    }
  });
});
