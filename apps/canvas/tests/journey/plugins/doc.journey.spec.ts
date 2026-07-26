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

// Journey: paged.doc DOCX ROUND-TRIP — open a .docx through the host importer,
// edit its text on the canvas with a real engine mutation, and save it back
// through the host exporter, then assert BOTH halves of the plugin's central
// promise:
//
//   1. the edit reached word/document.xml (the M2 byte-splice patcher ran), and
//   2. everything the plugin does not model survived VERBATIM — the unknown
//      part and the styles part come back byte-identical.
//
// This is the plugin's first host-integration proof. Everything up to here was
// verified in Rust against in-memory packages and a MOCK story read; the whole
// live chain (importer → native lowering → engine mutation → DOC-03 structured
// read → diff → patch → exporter) had never once run in a browser.
//
// Fixture: doc-memo.docx is docx-conformance's `memo_docx()` dumped to a file
// (cargo run -p docx-conformance --example dump-fixture -- memo <out>) — a
// Normal paragraph, a centered Heading1, a paragraph mixing a plain run with a
// bold red DIRECT-formatted run, plus customXml/unknown.txt, which exists
// precisely so a preservation claim can be tested rather than asserted.

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { expect, test, type Page } from "@playwright/test";

import { mutate } from "../../e2e/harness/ui";
import { Designer } from "../driver/designer";

const MEMO_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/doc-memo.docx",
);

const DOC_IMPORTER = "media.paged.doc.importer.docx";
const DOC_EXPORTER = "media.paged.doc.exporter.docx";

/** The marker the journey types into the imported document. Distinctive
 *  enough that finding it in the saved XML cannot be a coincidence. */
const EDIT = "PAGEDEDIT ";

/** Drive the .docx through the REAL host importer registry — the same path
 *  File▸Open and drag-drop take. Bytes are read in Node and handed over as a
 *  plain array (structured-clone across the evaluate boundary). */
async function importDocx(page: Page, bytes: Buffer): Promise<string | null> {
  return page.evaluate(
    async ({ importerId, data }) => {
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              importers?: {
                list: () => Array<{
                  id: string;
                  import: (f: {
                    name: string;
                    bytes: Uint8Array;
                  }) => Promise<unknown> | unknown;
                }>;
              };
            };
          };
        }
      ).__canvas.registries.importers;
      if (!reg) return "host serves no importer registry";
      const imp = reg.list().find((i) => i.id === importerId);
      if (!imp) return `importer ${importerId} not registered`;
      await imp.import({
        name: "doc-memo.docx",
        bytes: new Uint8Array(data),
      });
      return null;
    },
    { importerId: DOC_IMPORTER, data: Array.from(bytes) },
  );
}

/** Pull the .docx exporter through the host exporter registry (the Export
 *  Center path) and bring the bytes back to Node for inspection. */
async function exportDocx(
  page: Page,
): Promise<{ bytes: number[] } | { reason: string }> {
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
    if (!result) return { reason: "exporter returned null (no document?)" };
    return { bytes: Array.from(result.bytes) };
  }, DOC_EXPORTER);
}

/** Minimal ZIP reader — enough to pull one stored/deflated entry out of an
 *  OPC package without adding a dependency to the editor's test tier. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const compressed = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const nameAt = i + 30;
    const dataAt = nameAt + nameLen + extraLen;
    const name = buf.subarray(nameAt, nameAt + nameLen).toString("utf8");
    const raw = buf.subarray(dataAt, dataAt + compressed);
    out.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    i = dataAt + compressed;
  }
  return out;
}

test.describe("journey · paged.doc docx round-trip", () => {
  test("a designer opens a Word document, edits it, and saves it back with everything else intact @feat:plugin-doc.read-path @feat:plugin-doc.embedded-placement @feat:plugin-doc.save-back @feat:plugin-doc.opc-foundation @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const source = readFileSync(MEMO_FIXTURE);
    const sourceParts = unzip(source);

    // ── 0. NEGATIVE CONTROL — the blank page renders stably, so any pixel
    //    change below is the document arriving, not render noise. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. IMPORT (HARD) — the .docx goes through the host importer, the
    //    engine lowers it onto the NATIVE text stack, and it paints. ──
    const importError = await importDocx(page, source);
    expect(importError, "the docx importer accepted the file").toBeNull();

    await expect
      .poll(async () => designer.firstStoryId(), { timeout: 20_000 })
      .not.toBeNull();
    await page.waitForTimeout(600);

    const afterImport = await designer.renderBytes();
    await designer.expectRenderChanged(blankA, afterImport);

    // The lowered text is really in a native story — not an image, not an
    // opaque blob the plugin still owns.
    const storyId = await designer.firstStoryId();
    expect(storyId, "the lowered document created a native story").not.toBeNull();

    // ── 2. EDIT (HARD) — a real engine mutation on the story the document
    //    was lowered into. This is what save-back has to notice and patch. ──
    await mutate(page, {
      op: "insertText",
      args: { storyId, offset: 0, text: EDIT },
    });
    await page.waitForTimeout(400);
    const afterEdit = await designer.renderBytes();
    await designer.expectRenderChanged(afterImport, afterEdit);

    // ── 3. SAVE BACK (HARD) — through the host exporter registry. ──
    const exported = await exportDocx(page);
    expect(
      "bytes" in exported,
      `docx export must produce bytes: ${
        "reason" in exported ? exported.reason : ""
      }`,
    ).toBe(true);
    if (!("bytes" in exported)) return;

    const saved = Buffer.from(exported.bytes);
    expect(saved.length, "the saved .docx is non-empty").toBeGreaterThan(64);
    // ZIP local-file-header magic: an OPC package is a ZIP.
    expect(saved.subarray(0, 4).toString("binary"), "a valid .docx ZIP").toBe(
      "PK",
    );

    const savedParts = unzip(saved);
    const savedXml = savedParts.get("word/document.xml")?.toString("utf8") ?? "";

    // 3a. THE EDIT LANDED — the patcher rewrote the run's <w:t>.
    expect(savedXml, "the edit reached word/document.xml").toContain(EDIT.trim());

    // 3b. NOTHING ELSE IN THE BODY WAS DESTROYED — the other paragraphs, the
    //     style reference and the direct formatting are all still there. A
    //     regenerated document.xml would drop or rewrite these.
    expect(savedXml).toContain("A Centered Heading");
    expect(savedXml).toContain("bold red");
    expect(savedXml).toContain('w:val="Heading1"');
    expect(savedXml).toContain('w:color w:val="FF0000"');
    expect(savedXml, "the section properties survived").toContain("<w:sectPr>");

    // 3c. THE PRESERVATION INVARIANT — parts the plugin does not model come
    //     back BYTE-IDENTICAL. This is the claim that separates a patcher
    //     from a re-serializer, and it is why the fixture ships an unknown
    //     part at all.
    for (const part of ["customXml/unknown.txt", "word/styles.xml"]) {
      const before = sourceParts.get(part);
      const after = savedParts.get(part);
      expect(after, `${part} survived the round-trip`).toBeDefined();
      expect(
        after!.equals(before!),
        `${part} is byte-identical after an edited save-back`,
      ).toBe(true);
    }
  });
});
