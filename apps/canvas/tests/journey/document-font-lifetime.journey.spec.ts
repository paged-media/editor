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

// Journey: a face a plugin gives a document lives as long as that document
// (plugin-sdk ADR 330, `assets.documentFont@2`).
//
// The engine keeps ONE document font registry per session and seeds every
// document it loads from it. A face `host.assets.registerDocumentFont` gave
// one document therefore laid out the next one too: a document that names
// the family without holding it was drawn in the first document's face, and
// the Fonts panel called the family present. The client now drops a
// document's faces before the next document loads.
//
//   1. CLOSE — a plugin gives document A a face for the family its text
//      names; the user opens document B (File ▸ New, a text frame set in the
//      same family, no face). B reports the family missing in the Fonts panel,
//      and its page is drawn in a substitute: giving B the face redraws it
//      (and the door answers `registered`, not `held`).
//   2. REOPEN — opening A again brings the face back only through the
//      plugin's own `document.onDidOpen`.
//
// Driven through a throwaway bundle loaded with the same loader and host
// options as every real bundle (dev-only `__loadTestBundle`).

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { loadIdml, openPanel } from "../fidelity/canvas-driver";
import { Designer } from "./driver/designer";

const BUNDLE_ID = "media.paged.journeyfaces";
const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** A generated fixture with a run set in "Phantom Display", a family no
 *  font provides — `FontSummary.isMissing` is true by design. */
const PREFLIGHT_IDML = `${REPO_ROOT}/corpus/idml/generated/preflight.idml`;
const FAMILY = "Phantom Display";
/** A face that draws nothing like the default (a monospace), served by the
 *  vite `/fonts/` route from corpus/fonts. */
const FACE_URL = "/fonts/JetBrainsMono-VF.ttf";

interface Faces {
  supports: Record<string, boolean>;
  /** When true, the bundle gives the face on every `document.onDidOpen`. */
  giveOnOpen: boolean;
  /** The outcome of every face the bundle gave on open, in order. */
  givenOnOpen: Array<{ status: string }>;
}

/** Load the test bundle; resolves once it has activated. */
async function loadFacesBundle(page: Page): Promise<Faces["supports"]> {
  await page.waitForFunction(
    () => typeof (globalThis as unknown as { __loadTestBundle?: unknown }).__loadTestBundle === "function",
  );
  return page.evaluate(
    ({ id, family, faceUrl }) => {
      type Outcome = { status: string };
      type Host = {
        supports(f: string): boolean;
        assets: { registerDocumentFont(bytes: Uint8Array, family: string): Promise<Outcome> };
        document: { onDidOpen(l: () => void): unknown };
      };
      const g = globalThis as unknown as {
        __faces: Faces & { host?: Host; give?: () => Promise<Outcome> };
        __loadTestBundle: (b: unknown) => { dispose(): void };
      };
      const faces = { supports: {}, giveOnOpen: false, givenOnOpen: [] } as Faces & {
        host?: Host;
        give?: () => Promise<Outcome>;
      };
      g.__faces = faces;
      g.__loadTestBundle({
        manifest: {
          id,
          name: "journey faces",
          version: "0.0.0",
          apiVersion: "^0.2",
          capabilities: {
            document: { read: "broad", write: "broad" },
            assets: ["fonts"],
          },
        },
        activate(host: Host) {
          faces.host = host;
          for (const f of ["assets.documentFont@1", "assets.documentFont@2", "document.onDidOpen@1"]) {
            faces.supports[f] = host.supports(f);
          }
          // The plugin's own face: bytes it ships, under the family its text
          // names.
          faces.give = async () => {
            const resp = await fetch(faceUrl);
            if (!resp.ok) throw new Error(`${faceUrl}: ${resp.status}`);
            return host.assets.registerDocumentFont(new Uint8Array(await resp.arrayBuffer()), family);
          };
          // Its load path: the face the document needs, given on open.
          host.document.onDidOpen(() => {
            if (!faces.giveOnOpen) return;
            void faces.give!().then((o) => faces.givenOnOpen.push({ status: o.status }));
          });
          return { dispose() {} };
        },
      });
      return faces.supports;
    },
    { id: BUNDLE_ID, family: FAMILY, faceUrl: FACE_URL },
  );
}

/** The plugin gives the open document its face; the door's outcome. */
const give = (page: Page): Promise<{ status: string }> =>
  page.evaluate(async () => {
    const f = (globalThis as unknown as { __faces: { give(): Promise<{ status: string }> } }).__faces;
    const out = await f.give();
    return { status: out.status };
  });

/** Whether the open document reports the family missing (its Fonts row). */
const missing = (page: Page): Promise<boolean | null> =>
  page.evaluate(async (family) => {
    const c = (globalThis as unknown as {
      __canvas: { client: { collection(n: string): Promise<Array<{ family: string; isMissing: boolean }>> } };
    }).__canvas;
    const row = (await c.client.collection("fonts")).find((f) => f.family === family);
    return row ? row.isMissing : null;
  }, FAMILY);

/** A hash of page `pageId` as the engine draws it now. */
const pageHash = (page: Page, pageId: string): Promise<string> =>
  page.evaluate(async (id) => {
    const c = (globalThis as unknown as {
      __canvas: { client: { requestSnapshot(id: string, w: number): Promise<{ pngBytes: number[] }> } };
    }).__canvas;
    const png = await c.client.requestSnapshot(id, 480);
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(png.pngBytes));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }, pageId);

/** The open document: File ▸ New, then one text frame set in `family`.
 *  Answers its first page id. */
async function newDocumentNaming(page: Page, designer: Designer, family: string): Promise<string> {
  await designer.newDocument();
  return page.evaluate(async (fam) => {
    const c = (globalThis as unknown as {
      __canvas: {
        client: { mutate(m: unknown): Promise<{ kind: string; payload?: unknown }> };
        handle?: { pageIds: string[] } | null;
      };
    }).__canvas;
    const pageId = c.handle?.pageIds?.[0];
    if (!pageId) throw new Error("File ▸ New left no page");
    const reply = await c.client.mutate({
      op: "batch",
      args: {
        ops: [
          { op: "insertTextFrame", args: { pageId, bounds: [72, 72, 240, 540] } },
          { op: "bindCreated", args: { handle: "t" } },
          { op: "insertText", args: { storyId: "$h:t", offset: 0, text: "Hamburgefonstiv 0123" } },
          {
            op: "setElementProperty",
            args: {
              elementId: { kind: "storyRange", id: { story_id: "$h:t", start: 0, end: 20 } },
              path: "characterFontFamily",
              value: { type: "text", value: fam },
            },
          },
        ],
      },
    });
    if (reply.kind !== "mutationApplied") throw new Error(`text in ${fam}: ${JSON.stringify(reply)}`);
    return pageId;
  }, family);
}

test.describe("journey · a plugin's document face lives as long as its document", () => {
  test("closing the document drops its face: the next document reports the family missing and draws a substitute @feat:plugin-platform.font-asset-serving @feat:editor-shell.panels.fonts @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await loadIdml(page, PREFLIGHT_IDML);
    const supports = await loadFacesBundle(page);
    expect(supports["assets.documentFont@2"], "the editor scopes a document face to its document").toBe(true);

    // Document A: the plugin gives it the face its text names.
    expect(await missing(page), "A names a family no font provides").toBe(true);
    expect((await give(page)).status).toBe("registered");
    expect(await missing(page), "A holds the plugin's face").toBe(false);

    // Close A: open B, which names the family and holds no face.
    const pageId = await newDocumentNaming(page, designer, FAMILY);
    expect(await missing(page), "B does not lay out with A's face").toBe(true);
    await openPanel(page, "paged.fonts");
    await expect(page.locator('[data-fonts-panel="ready"]')).toBeVisible();
    const row = page.locator("[data-font-list] [data-list-row]", { hasText: FAMILY });
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-row-badge="missing"]')).toBeVisible();

    // B is drawn in a substitute, not in A's face: giving B the face is a
    // registration (not "held") and redraws the page.
    const substitute = await pageHash(page, pageId);
    expect((await give(page)).status, "B held no face for the family").toBe("registered");
    expect(await missing(page)).toBe(false);
    expect(await pageHash(page, pageId), "B redraws in the face it was given").not.toBe(substitute);
  });

  test("reopening a document brings its face back through the plugin's own load path @feat:plugin-platform.font-asset-serving @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await loadIdml(page, PREFLIGHT_IDML);
    const supports = await loadFacesBundle(page);
    expect(supports["document.onDidOpen@1"]).toBe(true);
    expect((await give(page)).status).toBe("registered");
    expect(await missing(page)).toBe(false);

    // Reopened, and nothing gives the face again: missing.
    await loadIdml(page, PREFLIGHT_IDML);
    expect(await missing(page), "a reopened document does not inherit the face").toBe(true);

    // Reopened by a plugin that gives it on open: back, from its own path.
    await page.evaluate(() => {
      (globalThis as unknown as { __faces: { giveOnOpen: boolean } }).__faces.giveOnOpen = true;
    });
    await loadIdml(page, PREFLIGHT_IDML);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (globalThis as unknown as { __faces: { givenOnOpen: Array<{ status: string }> } }).__faces.givenOnOpen,
          ),
        { timeout: 15_000 },
      )
      .toEqual([{ status: "registered" }]);
    expect(await missing(page), "the plugin's onDidOpen gave the face back").toBe(false);
  });
});
