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

// Journey: the face a web bake gave the document comes back when the
// document is opened again, in the same session, without a re-bake.
//
// A document face lives as long as its document (plugin-sdk ADR 330), so
// reopening a document drops the face a bake gave it, while the baked text
// naming the face is saved. paged.web keeps the faces it gave in the
// document (plugin-web ADR 414) and gives them back on open:
//
//   1. a web frame whose source loads a face through its own `@font-face`
//      rule (a font file in the plugin's container resources) is baked; the
//      baked text names that face and the document holds it;
//   2. the document is saved as .paged and opened again: the face is back,
//      and no bake ran.

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";
import { BAKE, insertWebFrameWith, invoke, mutationsSince, select, tapMark, tapSceneLayers } from "./web-kit";

const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
/** A face no document holds, distinct from the default: a monospace. */
const FACE = `${REPO_ROOT}/corpus/fonts/JetBrainsMono-VF.ttf`;
const RESOURCE = "paged/media.paged.web/resources/fonts/mono.ttf";

const HTML = "<p>Hamburgefonstiv 0123</p>";
const CSS =
  "@font-face { font-family: 'Mono'; src: url(fonts/mono.ttf) format('truetype'); }\n" +
  "body { margin: 0; } p { font: 24px/32px 'Mono', monospace; margin: 0; color: #101820; }";

type FontRow = { family: string; isMissing: boolean };

const fonts = (page: Page): Promise<FontRow[]> =>
  page.evaluate(async () => {
    const c = (globalThis as unknown as {
      __canvas: { client: { collection(n: string): Promise<FontRow[]> } };
    }).__canvas;
    return (await c.client.collection("fonts")).map((f) => ({ family: f.family, isMissing: f.isMissing }));
  });

/** The row of the family the baked text was set in (the face's own name). */
const monoRow = async (page: Page): Promise<FontRow | undefined> =>
  (await fonts(page)).find((f) => /mono/i.test(f.family) && !/^monospace$/i.test(f.family));

const keptFaces = (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    const c = (globalThis as unknown as {
      __canvas: { client: { send(m: unknown): Promise<{ kind: string; payload: { paths?: string[] } }> } };
    }).__canvas;
    const r = await c.client.send({ kind: "listPagedParts", payload: { prefix: "paged/media.paged.web/faces/" } });
    return r.kind === "pagedPartList" ? (r.payload.paths ?? []) : [];
  });

test.describe("journey · a baked web face comes back when the document reopens", () => {
  test("bake, save, open again: the face the baked text names is given back without a re-bake @feat:plugin-web.bake-to-native @feat:plugin-web.web-fonts @feat:plugin-platform.font-asset-serving @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await tapSceneLayers(page);

    // The source's font file, in the plugin's container resources.
    const face = Array.from(readFileSync(FACE));
    await page.evaluate(
      async ({ path, bytes }) => {
        const c = (globalThis as unknown as {
          __canvas: { client: { send(m: unknown): Promise<{ kind: string }> } };
        }).__canvas;
        const r = await c.client.send({ kind: "writePagedPart", payload: { path, bytes, caller: "media.paged.web" } });
        if (r.kind !== "pagedPartWritten") throw new Error(`resource not written: ${r.kind}`);
      },
      { path: RESOURCE, bytes: face },
    );

    // ── 1. Bake: the baked text names the face, and the document holds it. ──
    const frame = await insertWebFrameWith(page, HTML, CSS);
    const logs: string[] = [];
    page.on("console", (m) => {
      if (/bakeWebFrame:/.test(m.text())) logs.push(m.text());
    });
    await select(page, [frame]);
    await invoke(page, BAKE);
    await expect.poll(() => logs.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(logs.join(" | ")).toMatch(/baked \d+ native item/);
    const baked = await monoRow(page);
    expect(baked, "the baked text names the face its source loads").toBeTruthy();
    expect(baked!.isMissing, "the bake gave the document the face").toBe(false);
    expect((await keptFaces(page)).length, "the bake kept the face with the document").toBeGreaterThan(0);

    // ── 2. Save and open again: the face is back, and no bake ran. ──
    const mark = await tapMark(page);
    await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: { client: { exportPaged(): Promise<Uint8Array>; loadDocument(b: Uint8Array): Promise<unknown> } };
      }).__canvas;
      await c.client.loadDocument(await c.client.exportPaged());
    });
    await expect
      .poll(async () => (await monoRow(page))?.isMissing, { timeout: 15_000, message: "the reopened document has its face" })
      .toBe(false);
    expect((await monoRow(page))?.family).toBe(baked!.family);
    expect(await mutationsSince(page, mark), "no bake ran on open").toEqual([]);
  });
});
