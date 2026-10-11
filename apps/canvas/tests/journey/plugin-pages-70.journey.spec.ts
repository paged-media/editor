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

// Journey: the v70 page doors a presentation plugin uses, driven through a
// throwaway bundle loaded with the same loader and host options as every
// real bundle (dev-only `__loadTestBundle`):
//
//   1. GO TO A PAGE — `host.viewport.goToPage` moves the camera to the
//      page, the active page follows and `onDidChangeActivePage` fires
//      (supports("viewport.pages@1"));
//   2. PAGE IMAGES — `host.render.snapshot` answers a PNG of a page, and
//      null for a page the document does not have (supports("render.snapshot@1")).

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";

const BUNDLE_ID = "media.paged.journeypages";
const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** Twelve pages: room to navigate. */
const LAYOUT_IDML = `${REPO_ROOT}/corpus/idml/generated/layout.idml`;

type Host = {
  supports(f: string): boolean;
  nativeDocument: { open(bytes: Uint8Array): Promise<void> };
  document: { collection(name: string): Promise<{ selfId: string }[]> };
  viewport: {
    camera(): { scale: number; tx: number; ty: number };
    goToPage(id: string, o?: { fit?: "page" | "width" }): Promise<boolean>;
    activePage(): string | null;
    onDidChangeActivePage(l: (id: string | null) => void): unknown;
  };
  render: {
    snapshot(
      id: string,
      o: { widthPx: number },
    ): Promise<{ widthPx: number; heightPx: number; png: Uint8Array } | null>;
  };
};
type G = { __pages70: { host: Host; changes: (string | null)[]; pages: string[] } };

/** Load the test bundle, then open the fixture through its
 *  `nativeDocument.open` — the File > Open orchestration a plugin
 *  importer uses, so the editor's own document state follows. Answers the
 *  page ids. */
async function openThroughBundle(page: Page): Promise<string[]> {
  await page.waitForFunction(
    () => typeof (globalThis as unknown as { __loadTestBundle?: unknown }).__loadTestBundle === "function",
  );
  const bytes = Array.from(readFileSync(LAYOUT_IDML));
  return page.evaluate(
    async ({ id, bytes }) => {
      const g = globalThis as unknown as Partial<G> & {
        __loadTestBundle: (b: unknown) => { dispose(): void };
      };
      const ready = new Promise<Host>((resolve) => {
        g.__loadTestBundle({
          manifest: {
            id,
            name: "journey pages",
            version: "0.0.0",
            apiVersion: "^0.2",
            capabilities: { document: { read: "broad", openNative: true } },
          },
          activate(host: Host) {
            resolve(host);
          },
        });
      });
      const host = await ready;
      const changes: (string | null)[] = [];
      host.viewport.onDidChangeActivePage((p) => changes.push(p));
      await host.nativeDocument.open(new Uint8Array(bytes));
      const pages = (await host.document.collection("pages")).map((p) => p.selfId);
      g.__pages70 = { host, changes, pages };
      return pages;
    },
    { id: BUNDLE_ID, bytes },
  );
}

const pagesHost = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as G).__pages70.host.viewport.activePage());

test.describe("journey · v70 page doors: go to a page, page images", () => {
  test("goToPage moves the camera to the page and the active page follows @feat:editor-shell.panels.pages-navigator @level:gesture", async ({
    page,
  }) => {
    await openCanvas(page);
    const pages = await openThroughBundle(page);
    expect(pages.length, "a multi-page fixture").toBeGreaterThan(3);
    // The editor reports the page it shows once the document is open: the
    // page under the viewport's centre, with the whole document fitted.
    await expect.poll(() => pagesHost(page)).not.toBeNull();
    const start = await pagesHost(page);
    const target = pages[pages.length - 1] === start ? pages[0] : pages[pages.length - 1];

    const r = await page.evaluate(async (target) => {
      const g = (globalThis as unknown as G).__pages70;
      const before = g.host.viewport.camera();
      return {
        supports: g.host.supports("viewport.pages@1"),
        ok: await g.host.viewport.goToPage(target),
        unknown: await g.host.viewport.goToPage("no-such-page"),
        before,
      };
    }, target);
    expect(r.supports).toBe(true);
    expect(r.ok, "the editor went to the page").toBe(true);
    expect(r.unknown, "an unknown page is refused").toBe(false);
    // The camera animates; the active page settles on the target.
    await expect.poll(() => pagesHost(page)).toBe(target);
    const after = await page.evaluate(() => {
      const g = (globalThis as unknown as G).__pages70;
      return { camera: g.host.viewport.camera(), changes: g.changes };
    });
    expect(after.changes.at(-1), "onDidChangeActivePage reported it").toBe(target);
    expect(after.camera.ty, "the camera moved down the document").not.toBe(r.before.ty);
  });

  test("render.snapshot answers a PNG of a page and null for an unknown one @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const pages = await openThroughBundle(page);
    const r = await page.evaluate(async (pageId) => {
      const g = (globalThis as unknown as G).__pages70;
      const shot = await g.host.render.snapshot(pageId, { widthPx: 240 });
      const none = await g.host.render.snapshot("no-such-page", { widthPx: 240 });
      return {
        supports: g.host.supports("render.snapshot@1"),
        width: shot?.widthPx ?? 0,
        height: shot?.heightPx ?? 0,
        magic: shot ? Array.from(shot.png.slice(0, 4)) : [],
        none,
      };
    }, pages[1]);
    expect(r.supports).toBe(true);
    expect(Math.abs(r.width - 240)).toBeLessThanOrEqual(1);
    expect(r.height).toBeGreaterThan(0);
    expect(r.magic, "PNG bytes").toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(r.none).toBeNull();
  });
});
