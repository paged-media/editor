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

// E2E — D-26 / D-27, the editor half of two plugin doors (ADR 219).
//
//   AC-DOC-1  `host.documents` backend: exportPaged serializes the open
//             document; open on a CLEAN document replaces it without asking.
//   AC-DOC-2  open on an EDITED document asks keep/discard, naming the
//             plugin and the document. Keep (and Esc) changes nothing and
//             answers `declined`; Discard opens and the copy starts clean.
//   AC-DOC-3  bytes that are not a package reject before any prompt.
//   AC-MEA-1  `client.measureTexts` — the batched measure behind
//             `host.text.measureStrings` — answers what `measureText`
//             answers, string by string, in one worker round-trip.
//
// Driven through the dev-only `__documents` handle (the `__consent`
// pattern): the pinned plugin-sdk may predate `capabilities.documents`,
// and the backend is what this repo owns.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

type OpenResult = { opened: true; pageIds: string[] } | { opened: false; reason: "declined" };

type DocWindow = {
  __documents: {
    exportPaged(): Promise<Uint8Array>;
    open(bytes: Uint8Array, name?: string): Promise<OpenResult>;
  };
  __canvas: {
    ready: boolean;
    client: {
      mutate(m: unknown): Promise<{ kind: string }>;
      documentMeta(): Promise<{ dirty: boolean }>;
      measureText(
        family: string,
        style: string | null,
        text: string,
        sizePt: number,
      ): Promise<{ advance: number; ascender: number; descender: number }>;
      measureTexts(
        family: string,
        style: string | null,
        texts: string[],
        sizePt: number,
      ): Promise<Array<{ advance: number; ascender: number; descender: number }>>;
    };
  };
  __template?: Uint8Array;
  __openResult?: Promise<OpenResult>;
};

async function loadText(page: Page): Promise<void> {
  await openCanvas(page);
  await page.setInputFiles('input[type="file"]', fixturePath("text"));
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as DocWindow).__canvas.ready), {
      timeout: 30_000,
    })
    .toBe(true);
}

const dirty = (page: Page) =>
  page.evaluate(async () =>
    (await (globalThis as unknown as DocWindow).__canvas.client.documentMeta()).dirty,
  );

/** Export the open document into `__template`; returns its first bytes. */
const exportTemplate = (page: Page) =>
  page.evaluate(async () => {
    const w = globalThis as unknown as DocWindow;
    w.__template = await w.__documents.exportPaged();
    return [w.__template.byteLength, w.__template[0], w.__template[1]];
  });

/** Start an open of `__template` without awaiting it in-page. */
const startOpen = (page: Page, name: string) =>
  page.evaluate((n) => {
    const w = globalThis as unknown as DocWindow;
    w.__openResult = w.__documents.open(w.__template!, n);
  }, name);

const openResult = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as DocWindow).__openResult!);

/** Edit the open document (a frame on its first page). */
async function edit(page: Page, pageId: string): Promise<void> {
  const reply = await page.evaluate(
    (p) =>
      (globalThis as unknown as DocWindow).__canvas.client.mutate({
        op: "insertFrame",
        args: { pageId: p, bounds: [20, 20, 80, 80] },
      }),
    pageId,
  );
  expect(reply.kind).toBe("mutationApplied");
}

test.describe("D-26 — host.documents, the editor backend", () => {
  test.beforeEach(async ({ page }) => {
    await loadText(page);
  });

  test("AC-DOC-1 — exportPaged serializes; open on a clean document asks nothing @feat:plugin-platform.native-document @level:happy", async ({
    page,
  }) => {
    const [size, b0, b1] = await exportTemplate(page);
    expect(size).toBeGreaterThan(1000);
    expect([b0, b1]).toEqual([0x50, 0x4b]); // a ZIP container
    expect(await dirty(page)).toBe(false);

    await startOpen(page, "Catalog (merged)");
    const r = await openResult(page);
    expect(r.opened).toBe(true);
    if (r.opened) expect(r.pageIds.length).toBeGreaterThan(0);
    await expect(page.getByTestId("replace-document-dialog")).toHaveCount(0);
    expect(await dirty(page)).toBe(false);
  });

  test("AC-DOC-2 — an edited document asks; keep declines, discard opens @feat:plugin-platform.native-document @level:edge", async ({
    page,
  }) => {
    await exportTemplate(page);
    await startOpen(page, "Copy");
    const first = await openResult(page);
    expect(first.opened).toBe(true);
    if (!first.opened) return;
    await edit(page, first.pageIds[0]);
    expect(await dirty(page)).toBe(true);

    // Keep: the prompt names the plugin and the document; the answer is
    // `declined` and the edit survives.
    await startOpen(page, "Catalog (merged)");
    const dialog = page.getByTestId("replace-document-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("replace-document-requester")).toHaveText("Test plugin");
    await expect(page.getByTestId("replace-document-name")).toHaveText("Catalog (merged)");
    await page.getByTestId("replace-document-keep").click();
    expect(await openResult(page)).toEqual({ opened: false, reason: "declined" });
    await expect(dialog).toHaveCount(0);
    expect(await dirty(page)).toBe(true);

    // Esc is a keep too.
    await startOpen(page, "Catalog (merged)");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await openResult(page)).toEqual({ opened: false, reason: "declined" });
    expect(await dirty(page)).toBe(true);

    // Discard: the copy opens clean.
    await startOpen(page, "Catalog (merged)");
    await page.getByTestId("replace-document-discard").click();
    const r = await openResult(page);
    expect(r.opened).toBe(true);
    expect(await dirty(page)).toBe(false);
  });

  test("AC-DOC-3 — non-package bytes reject before any prompt @feat:plugin-platform.native-document @level:edge", async ({
    page,
  }) => {
    const err = await page.evaluate(async () => {
      try {
        await (globalThis as unknown as DocWindow).__documents.open(new Uint8Array([1, 2, 3, 4]), "x");
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(err).toMatch(/not an IDML or \.paged package/);
    await expect(page.getByTestId("replace-document-dialog")).toHaveCount(0);
  });
});

test.describe("D-27 — the batched measure", () => {
  test("AC-MEA-1 — measureTexts equals measureText per string, in order @feat:plugin-platform.text-measurement @level:happy", async ({
    page,
  }) => {
    await loadText(page);
    const words = ["Hamburgefonstiv", "W", "i", "", "Open Sans"];
    const { batch, single } = await page.evaluate(async (ws) => {
      const c = (globalThis as unknown as DocWindow).__canvas.client;
      const batch = await c.measureTexts("Open Sans", null, ws, 12);
      const single = [];
      for (const w of ws) single.push(await c.measureText("Open Sans", null, w, 12));
      return { batch, single };
    }, words);
    expect(batch).toEqual(single);
    expect(batch[0].advance).toBeGreaterThan(0);
    expect(batch[1].advance).toBeGreaterThan(batch[2].advance); // W wider than i
    expect(
      await page.evaluate(() =>
        (globalThis as unknown as DocWindow).__canvas.client.measureTexts("Open Sans", null, [], 12),
      ),
    ).toEqual([]);
  });
});
