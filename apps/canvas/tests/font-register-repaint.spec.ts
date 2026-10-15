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

// A page re-laid out by a font registration repaints.
//
// Registering a document face (a plugin's `host.assets.registerDocumentFont`,
// or the client's `registerFont`) makes the engine re-lay the text that
// names that family, and its `fontRegistered` reply lists the pages that
// moved. The worker flagged its render loop for mutations, undo/redo,
// scripts and scene layers, but not for this reply, so the canvas kept
// the old glyphs until the next camera move or edit.
//
// The live canvas is not readable headlessly (no 2D context on the
// OffscreenCanvas), so the repaint is read off the worker's own journal:
// the render loop records a `worker.frame` for every tick that draws, and
// draws only when flagged dirty or when the camera moved.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";
import { loadViaReactPath } from "./e2e/harness/viewport";
import { Designer } from "./journey/driver/designer";

type Client = {
  drainJournal(): Promise<{ entries: Array<{ code: string }> } | null>;
  registerFont(family: string, bytes: Uint8Array, style: string | null): Promise<void>;
  clearFontRegistry(): Promise<void>;
  subscribe(l: (m: { kind: string; payload?: { pageIds?: string[] } }) => void): () => void;
};

/** Frames the worker drew since the last drain, after `settleMs`. */
async function framesAfter(page: Page, settleMs: number): Promise<number> {
  return page.evaluate(async (ms) => {
    const c = (globalThis as unknown as { __canvas: { client: Client } }).__canvas.client;
    await new Promise((r) => setTimeout(r, ms));
    const drain = await c.drainJournal();
    return (drain?.entries ?? []).filter((e) => e.code === "worker.frame").length;
  }, settleMs);
}

/** Run `act` in the page and report the pages its reply named, whether
 *  the resolver ran after it, and how many frames the worker drew. */
async function afterFontReply(
  page: Page,
  act: "register" | "clear",
): Promise<{ pageIds: string[]; resolved: boolean; frames: number }> {
  // Let the load's own repaints and the resolver settle, then start clean.
  await expect.poll(() => framesAfter(page, 600), { timeout: 15_000 }).toBe(0);
  const { pageIds, resolved } = await page.evaluate(async (which) => {
    const c = (globalThis as unknown as { __canvas: { client: Client } }).__canvas.client;
    let pageIds: string[] = [];
    let resolved = false;
    const off = c.subscribe((m) => {
      if (m.kind === "fontRegistered" || m.kind === "fontRegistryCleared") {
        pageIds = m.payload?.pageIds ?? [];
      }
      if (m.kind === "resolutionDone") resolved = true;
    });
    if (which === "register") {
      const resp = await fetch("/fonts/CormorantGaramond.ttf");
      if (!resp.ok) throw new Error(`/fonts/CormorantGaramond.ttf: ${resp.status}`);
      await c.registerFont("Open Sans", new Uint8Array(await resp.arrayBuffer()), null);
    } else {
      await c.clearFontRegistry();
    }
    // The resolver is debounced (300 ms).
    await new Promise((r) => setTimeout(r, 800));
    off();
    return { pageIds, resolved };
  }, act);
  return { pageIds, resolved, frames: await framesAfter(page, 300) };
}

test.describe("A font registration repaints the pages it re-lays out", () => {
  test("AC-FONT-REPAINT-1 — registering the face a document names repaints its pages, with no other edit @feat:the-renderer.font-registry @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    // text.idml sets its text in Open Sans, which this canvas does not
    // have: it renders in the fallback face until one is registered.
    await loadViaReactPath(page, "text");
    const designer = new Designer(page);
    const before = await designer.renderBytes();

    const { pageIds, resolved, frames } = await afterFontReply(page, "register");
    expect(pageIds.length, "the engine re-laid out the pages that name the face").toBeGreaterThan(0);
    expect(frames, "the canvas redrew without a camera move or an edit").toBeGreaterThan(0);
    expect(resolved, "the resolver re-ran after the re-layout").toBe(true);
    // And what it redrew is the new face.
    await designer.expectRenderChangesFrom(before);

    // Clearing the registry puts the fallback back, and repaints too.
    const cleared = await afterFontReply(page, "clear");
    expect(cleared.pageIds.length).toBeGreaterThan(0);
    expect(cleared.frames).toBeGreaterThan(0);
  });
});
