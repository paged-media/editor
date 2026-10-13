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

// Pages minted in ONE batch (Data Merge, a plugin's `host.mutate`
// batch, a `paged.*` script) — the three things the Data Merge film
// showed going wrong after "Merge into a new document":
//
//   1. the Document Map named the new pages by the engine's internal
//      spread id ("u3", "u5") instead of their folio;
//   2. the new pages' filmstrip thumbnails stayed blank — thumbnails
//      were only ever taken by the load pass, so no page added (or
//      edited) after the load got one;
//   3. the view jumped to fit ALL pages (3% after a 50-record merge),
//      because the camera re-fit on every change of the page list.
//
// A blank File ▸ New document is the fixture on purpose: the engine
// mints short ids there ("u1", "u3"), exactly the film's "u5", where a
// loaded IDML mints long ones ("uf07648") that already read as ids.

import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

interface CanvasGlobal {
  __canvas: {
    ready: boolean;
    snapshotsReady: boolean;
    handle: { docId: string; pageCount: number; pageIds: string[] } | null;
    setMode: (m: string) => void;
    registries: { commands: { invoke: (id: string) => Promise<unknown> } };
    client: {
      camera: { read: () => Camera };
      mutate: (m: unknown) => Promise<{ kind: string; payload?: unknown }>;
    };
  };
}

/** File ▸ New, then wait for the load pass (handle + its thumbnails). */
async function newDocument(page: Page): Promise<string> {
  const before = await page.evaluate(
    () => (globalThis as unknown as CanvasGlobal).__canvas.handle?.docId ?? null,
  );
  await page.evaluate(() =>
    (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(
      "paged.file.new",
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = (globalThis as unknown as CanvasGlobal).__canvas;
        return c.snapshotsReady ? (c.handle?.docId ?? null) : null;
      }),
    )
    .not.toBe(before);
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.snapshotsReady),
    )
    .toBe(true);
  return page.evaluate(
    () => (globalThis as unknown as CanvasGlobal).__canvas.handle!.docId,
  );
}

/** Insert `count` pages after the last one in ONE wire batch — the
 *  shape plugin-data's merge sends. */
async function batchInsertPages(page: Page, count: number): Promise<void> {
  const reply = await page.evaluate(async (n) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const last = c.handle!.pageIds[c.handle!.pageIds.length - 1];
    const ops = Array.from({ length: n }, () => ({
      op: "insertPage",
      args: { afterPageId: last, masterId: null },
    }));
    return c.client.mutate({ op: "batch", args: { ops } });
  }, count);
  expect(reply.kind).toBe("mutationApplied");
}

async function pageCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (globalThis as unknown as CanvasGlobal).__canvas.handle?.pageCount ?? 0,
  );
}

async function readCamera(page: Page): Promise<Camera> {
  return page.evaluate(() =>
    (globalThis as unknown as CanvasGlobal).__canvas.client.camera.read(),
  );
}

/** Per filmstrip entry: its label and whether every page tile in it
 *  shows a decoded thumbnail. */
async function railThumbnails(
  page: Page,
): Promise<Array<{ label: string; src: string | null; loaded: boolean }>> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-thumbnail-rail] [data-thumbnail-spread]",
      ),
    ).map((b) => {
      const img = b.querySelector("img");
      return {
        label: b.innerText.trim(),
        src: img?.getAttribute("src") ?? null,
        loaded: img != null && img.complete && img.naturalWidth > 0,
      };
    }),
  );
}

test.describe("Batch-minted pages", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await newDocument(page);
    // Design mode mounts the Document Map in the left dock.
    await page.evaluate(() =>
      (globalThis as unknown as CanvasGlobal).__canvas.setMode("design"),
    );
  });

  test("AC-BATCHPAGES-1 — the Document Map names batch-minted pages by folio, not by internal id @feat:editor-shell.panels.document-map @level:edge", async ({
    page,
  }) => {
    await batchInsertPages(page, 2);
    await expect.poll(() => pageCount(page)).toBe(3);

    const rows = page.locator("[data-document-map-panel] [data-document-map-spread]");
    await expect(rows).toHaveCount(3);
    // Each row's first line is its name. The engine's spread label IS
    // the spread's selfId, so a name like "u3" is an id, never a name.
    const names = (await rows.allInnerTexts()).map((t) => t.split("\n")[0]!.trim());
    expect(names).toEqual(["Cover", "Page 2", "Page 3"]);
  });
});
