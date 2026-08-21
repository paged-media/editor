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

// File ▸ Save (.paged) — the native container save, and the reopen
// that makes it worth having.
//
// The engine has been able to write a container since protocol 51
// (`ExportPaged`, and the three `…PagedPart` doors beside it), and
// `paged-run export --format paged` used it from the CLI. The editor
// could not: the menu item was a disabled `soon(...)` seam and no TS
// called `exportPaged`, so plugin content — a sheet's workbook, a web
// frame's source, a Word file's original OPC — had no way out of the
// app except through an IDML export that drops it.
//
// What is pinned here:
//   · the command registers and the menu item is REAL, not disabled;
//   · the bytes are a well-formed container: `mimetype` stored first
//     (so InDesign still sees a valid UCF package), a `manifest.json`
//     naming the protocol, and `paged/core/model/document.pgm`;
//   · the container reloads through the ORDINARY document door —
//     no importer, no separate code path — which is what licenses
//     adding `.paged` to the picker's accept list and nothing else;
//   · a plugin part written through `host.parts` is in the file and
//     survives the round-trip. That is the whole point of the format,
//     and an IDML export is the negative control: same document, and
//     the part is gone.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";
import {
  assertUcfMimetypeFirst,
  readZipText,
  zipEntryNames,
} from "./e2e/harness/read-zip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/text.idml`;

/** Load a fixture through the same client door the React UI uses. */
async function loadFixture(page: Page, absPath: string): Promise<number> {
  return page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            loadDocument: (b: Uint8Array) => Promise<{ pageCount: number }>;
          };
        };
      }
    ).__canvas;
    const handle = await c.client.loadDocument(bytes);
    return handle.pageCount;
  }, "/@fs" + absPath);
}

/** Export the open document as a container and bring the bytes back
 *  to Node, where a real unzip is available. */
async function exportPaged(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { exportPaged: () => Promise<Uint8Array> } };
      }
    ).__canvas;
    const bytes = await c.client.exportPaged();
    let s = "";
    for (const byte of bytes) s += String.fromCharCode(byte);
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

test.describe("File ▸ Save (.paged)", () => {
  test("the command is registered and the menu item is real @feat:package-anatomy.paged-container @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const surfaced = await page.evaluate(() => {
      const r = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              commands: { list: () => { id: string; title: string }[] };
              menus: {
                list: () => {
                  path: string;
                  command: string;
                  disabled?: boolean;
                }[];
              };
            };
          };
        }
      ).__canvas.registries;
      const item = r.menus.list().find((m) => m.path === "File/Save (.paged)");
      return {
        command: r.commands.list().some((c) => c.id === "paged.file.savePaged"),
        menuFound: Boolean(item),
        menuDisabled: item?.disabled ?? null,
        menuCommand: item?.command ?? null,
      };
    });
    expect(surfaced.command, "paged.file.savePaged is registered").toBe(true);
    expect(surfaced.menuFound, "File/Save (.paged) is in the menu").toBe(true);
    // The seam it replaced was `disabled: true` with a `paged.soon.*`
    // command id. Both halves have to have changed, or the menu still
    // shows a dead entry that merely LOOKS different.
    expect(
      surfaced.menuDisabled,
      "the seam is retired, not shadowed",
    ).toBeFalsy();
    expect(surfaced.menuCommand).toBe("paged.file.savePaged");
  });

  test("the container is well-formed and reopens through the ordinary door @feat:package-anatomy.paged-container @feat:package-anatomy.paged-parts-door @feat:round-tripping.native-reserialization @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const pagesIn = await loadFixture(page, FIXTURE);
    expect(pagesIn).toBeGreaterThan(0);

    // A plugin part, written through the same door a bundle uses.
    // This is the payload an IDML export cannot carry.
    const PART = "paged/media.paged.test/showcase-probe.json";
    const PAYLOAD = '{"probe":"save-paged spec"}';
    await page.evaluate(
      async ({ path, payload }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: { send: (m: unknown) => Promise<{ kind: string }> };
            };
          }
        ).__canvas;
        const bytes = Array.from(new TextEncoder().encode(payload));
        const reply = await c.client.send({
          kind: "writePagedPart",
          payload: { path, bytes },
        });
        if (reply.kind !== "pagedPartWritten") {
          throw new Error(`writePagedPart refused: ${reply.kind}`);
        }
      },
      { path: PART, payload: PAYLOAD },
    );

    const paged = await exportPaged(page);
    expect(paged.length, "container is non-empty").toBeGreaterThan(0);
    expect(paged.subarray(0, 2).toString("latin1"), "zip magic").toBe("PK");

    // `mimetype` must be the FIRST entry and STORED, or Adobe's UCF
    // sniff fails and the file stops being a valid IDML package —
    // which is the property that lets one artifact serve both readers.
    assertUcfMimetypeFirst(
      paged,
      "application/vnd.adobe.indesign-idml-package",
    );

    const entries = zipEntryNames(paged);
    expect(entries).toContain("manifest.json");
    expect(entries).toContain("paged/core/model/document.pgm");
    expect(entries, "the plugin part travelled with the file").toContain(PART);
    expect(entries, "still a valid IDML projection").toContain("designmap.xml");

    const manifest = JSON.parse(
      readZipText(paged, "manifest.json") ?? "{}",
    ) as {
      format: string;
      pagedProtocol: number;
      parts: { path: string }[];
    };
    expect(manifest.format).toBe("paged-container");
    expect(manifest.pagedProtocol).toBeGreaterThanOrEqual(51);
    expect(manifest.parts.map((p) => p.path)).toContain(PART);

    // Reopen: the SAME door a user's Open… takes, with no importer
    // involved. The engine decides on the way in.
    const reopened = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              loadDocument: (b: Uint8Array) => Promise<{ pageCount: number }>;
              send: (m: unknown) => Promise<{
                kind: string;
                payload: { found?: boolean; bytes?: number[] };
              }>;
            };
          };
        }
      ).__canvas;
      const handle = await c.client.loadDocument(bytes);
      const read = await c.client.send({
        kind: "readPagedPart",
        payload: { path: "paged/media.paged.test/showcase-probe.json" },
      });
      return {
        pageCount: handle.pageCount,
        found: read.payload.found ?? false,
        text: new TextDecoder().decode(
          new Uint8Array(read.payload.bytes ?? []),
        ),
      };
    }, paged.toString("base64"));

    expect(reopened.pageCount, "reopened with the same page count").toBe(
      pagesIn,
    );
    expect(reopened.found, "the part survived the round-trip").toBe(true);
    expect(reopened.text).toBe(PAYLOAD);
  });

  test("an IDML export is the negative control — the plugin part is dropped @feat:round-tripping.idml-reserialization @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, FIXTURE);
    const PART = "paged/media.paged.test/dropped.json";
    await page.evaluate(async (path) => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { send: (m: unknown) => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.send({
        kind: "writePagedPart",
        payload: { path, bytes: Array.from(new TextEncoder().encode("x")) },
      });
    }, PART);

    const idmlB64 = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { exportIdml: () => Promise<Uint8Array> } };
        }
      ).__canvas;
      const bytes = await c.client.exportIdml();
      let s = "";
      for (const byte of bytes) s += String.fromCharCode(byte);
      return btoa(s);
    });
    const idml = Buffer.from(idmlB64, "base64");
    const entries = zipEntryNames(idml);
    expect(entries).toContain("designmap.xml");
    // This is the loss `.paged` exists to prevent. If this assertion
    // ever flips, the two formats have stopped differing and one of
    // them is redundant.
    expect(entries, "IDML carries no paged/ namespace").not.toContain(PART);
  });
});
