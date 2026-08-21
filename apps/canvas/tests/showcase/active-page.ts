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

// `withActivePage` — telling a plugin WHICH page it is working on.
//
// THE PROBLEM, found here and then FIXED in the editor. Every bundle
// that has to pick a page picks it the same way, and paged.draw's
// `resolveTargetPage`, paged.sheet's `activePageId`, paged.web's
// `insert.ts`, paged.data's `lower.ts` and paged.doc's `place.ts` all
// spell it identically:
//
//     const meta = await host.document.meta();
//     if (meta.activePage) return meta.activePage;
//     const pages = await host.document.collection("pages");
//     return pages[0]?.selfId ?? null;
//
// and the ENGINE answers that first question with `None`, always —
// `CanvasModel::document_meta` says active page is application state
// the worker does not track, and leaves it to "consumers to fold their
// own active-page state in when they need it". Nothing had. So the
// fallback was the only branch: on a one-page journey document nothing
// looked wrong, and on a sixteen-page document every plugin dropped its
// work onto page one. Probed rather than guessed — importing an SVG
// into a three-page document changed page 1 by 68,227 px and page 3 by
// zero. A designer on page nine of their own file got their import on
// page one, and `MoveNode`'s reparenting is deliberately off the wire,
// so nothing could carry it back.
//
// The fold now exists: `CanvasClient.setActivePage()` records it and
// `documentMeta()` reports it, and the canvas app pushes the page its
// own `paged.insert.*` verbs already target — viewport centre, then the
// containing page. Host inserts and plugin inserts finally agree about
// "here".
//
// So this file is no longer a shim around a gap. It is the test-side
// way to say "the module owns page N" for the duration of one call,
// through the same public door the app uses, and it restores the
// engine's own answer afterwards so no module leaks its page onto the
// next.

import type { Page } from "@playwright/test";

/** Tell the client which page is active. Prefer {@link withActivePage}. */
export async function setActivePage(page: Page, pageId: string): Promise<void> {
  await page.evaluate((id) => {
    (
      globalThis as unknown as {
        __canvas: { client: { setActivePage: (p: string | null) => void } };
      }
    ).__canvas.client.setActivePage(id);
  }, pageId);
}

/** Put the engine's own answer back. */
export async function clearActivePage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      globalThis as unknown as {
        __canvas: { client: { setActivePage: (p: string | null) => void } };
      }
    ).__canvas.client.setActivePage(null);
  });
}

/**
 * Run `fn` with `pageId` reported as the document's active page, then
 * restore. Everything a plugin does inside — including work it defers
 * to a microtask it started before returning — lands on that page.
 */
export async function withActivePage<T>(
  page: Page,
  pageId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await setActivePage(page, pageId);
  try {
    return await fn();
  } finally {
    await clearActivePage(page);
  }
}

/** The note every module using this should return, so the gap is
 *  recorded on the page where it bit rather than only in this file. */
export const ACTIVE_PAGE_NOTE =
  "the engine reports `activePage: null` — it is application state the " +
  "worker does not track — so every plugin resolved its target page as " +
  "pages[0], page ONE, however far into the document the user was. " +
  "Building this showcase is what made that visible, and it is fixed: " +
  "the host folds its own active page in (CanvasClient.setActivePage), " +
  "and the page it reports is the one paged.insert.* already targets, " +
  'so a host insert and a plugin insert finally agree about "here".';
