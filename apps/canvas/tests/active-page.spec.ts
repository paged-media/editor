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

// `documentMeta().activePage` — the host's answer to "which page am I
// working on?", and the reason plugins stopped landing on page 1.
//
// The engine deliberately does not answer this. `CanvasModel::
// document_meta` builds `DocumentMeta` with `active_page: None` and
// says why: active page is application state — camera focus, Pages
// panel selection — that the worker does not track, and it leaves
// "consumers to fold their own active-page state in when they need
// it". Nothing had folded it in.
//
// That was not cosmetic. Every first-party bundle that mints a page
// item resolves its target the same way — paged.web's `insert.ts`,
// paged.data's `lower.ts`, paged.doc's `place.ts`, paged.draw's
// `resolveTargetPage`, paged.sheet's `activePageId` all read
// `meta.activePage` and fall back to `pages[0]`. With the engine always
// answering null, the fallback was the ONLY branch: on a one-page
// document nothing looked wrong, and on a multi-page document every
// plugin dropped its work onto page one no matter where the user was.
// Nor could it be repaired afterwards — `MoveNode`'s reparenting is
// deliberately off the wire.
//
// What is pinned here: the client reports what the host pushed, the
// host pushes what the camera is looking at, and the page it names is
// the SAME page `paged.insert.*` targets — so a host insert and a
// plugin insert agree about "here", which is the property that was
// actually missing.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
// `layout` ships six pages — enough that "page 1" and "the page the
// camera is on" can actually differ.
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/layout.idml`;

async function loadFixture(page: Page): Promise<string[]> {
  return page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            loadDocument: (b: Uint8Array) => Promise<{ pageIds: string[] }>;
          };
        };
      }
    ).__canvas;
    return (await c.client.loadDocument(bytes)).pageIds;
  }, "/@fs" + FIXTURE);
}

async function metaActivePage(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            documentMeta: () => Promise<{ activePage?: string | null }>;
          };
        };
      }
    ).__canvas;
    return (await c.client.documentMeta()).activePage ?? null;
  });
}

test.describe("active page", () => {
  test("the client reports the page the host pushed @feat:sections-numbering-variables.page-number-resolution @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const pageIds = await loadFixture(page);
    expect(pageIds.length, "the fixture is multi-page").toBeGreaterThan(2);

    // Before anything pushes, the answer is the engine's: null. This
    // is the state every plugin used to see, always.
    await page.evaluate(() =>
      (
        globalThis as unknown as {
          __canvas: { client: { setActivePage: (p: string | null) => void } };
        }
      ).__canvas.client.setActivePage(null),
    );
    expect(
      await metaActivePage(page),
      "the engine itself does not track an active page",
    ).toBeNull();

    const third = pageIds[2];
    await page.evaluate(
      (id) =>
        (
          globalThis as unknown as {
            __canvas: { client: { setActivePage: (p: string | null) => void } };
          }
        ).__canvas.client.setActivePage(id),
      third,
    );
    expect(await metaActivePage(page)).toBe(third);

    // Clearing restores the engine's answer rather than pinning the
    // last page forever — otherwise closing a document would leave a
    // stale id addressing a page that no longer exists.
    await page.evaluate(() =>
      (
        globalThis as unknown as {
          __canvas: { client: { setActivePage: (p: string | null) => void } };
        }
      ).__canvas.client.setActivePage(null),
    );
    expect(await metaActivePage(page)).toBeNull();
  });

  test("the app pushes a real page once a document is open @feat:frames-paths.frame.insert @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    // The REACT door, deliberately. The app's effect reads
    // `document.handle` — the shell's state — so a direct
    // `client.loadDocument` leaves it null and the app pushes nothing.
    // That is not a bug in the effect; it is what "application state"
    // means, and it is why the showcase's page modules call
    // `client.setActivePage` explicitly instead of hoping.
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
              .ready,
        ),
      )
      .toBe(true);

    const { active, pageIds } = await page.evaluate(async () => {
      const g = globalThis as unknown as {
        __canvas: {
          handle?: { pageIds: string[] };
          client: {
            documentMeta: () => Promise<{ activePage?: string | null }>;
          };
        };
      };
      const meta = await g.__canvas.client.documentMeta();
      return {
        active: meta.activePage ?? null,
        pageIds: g.__canvas.handle?.pageIds ?? [],
      };
    });

    // Reported at all is the change — this was null for every document
    // ever opened before the fold existed.
    expect(active, "the app pushed an active page").not.toBeNull();
    // And it is a page of THIS document, not a stale id from the last
    // one. That is what makes it safe for a plugin to mint into.
    expect(pageIds, "it named a page of this document").toContain(active);
  });
});
