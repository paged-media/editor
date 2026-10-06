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

// Journey: the protocol-69 plugin doors, driven end to end through a
// throwaway bundle loaded with the same loader and host options as every
// real bundle (dev-only `__loadTestBundle`):
//
//   1. ENTERING POINT — double-clicking a frame a plugin edit context
//      claims hands `onEnter` the page, the page-local point and the
//      frame-content point (supports("editContext.enterPoint@1"));
//   2. OVERLAY LAYERS — two retained `host.overlay.layer()`s and the tool
//      preview are on the canvas together, and each clears without
//      touching the others (supports("overlay.layers@1"));
//   3. DOCUMENT OPENED — `host.document.onDidOpen` fires on File ▸ New and
//      on opening an IDML through the importer (File ▸ Open's lane);
//   4. SCENE FACES — `host.assets.registerFont` gives a plugin's scene
//      text a face the document lacks, while the document still reports
//      that family missing (supports("assets.registerFont@1"));
//   5. DOCUMENT METADATA — `host.document.setDocumentMetadata` is one
//      undoable edit that fires onDidChange (supports("document.metadata@1")).
//
// Needs the plugin-sdk that ships these doors and an engine on protocol 69
// (scene-scoped faces, document labels); the editor's pins move with the
// release.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { loadIdml, openCanvas, openPanel } from "../fidelity/canvas-driver";
import { Designer } from "./driver/designer";
import { screenPointInFrame, select } from "./plugins/web-kit";

const BUNDLE_ID = "media.paged.journeydoors";
const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** A generated fixture with a run pinned to "Phantom Display", a family no
 *  font provides — `FontSummary.isMissing` is true by design. */
const PREFLIGHT_IDML = `${REPO_ROOT}/corpus/idml/generated/preflight.idml`;
const MISSING_FAMILY = "Phantom Display";
const BREADCRUMB = "[data-edit-context-breadcrumb]";

type Pt = [number, number];
interface Entered {
  type: string;
  id: { kind: string; id: string };
  pageId?: string;
  pagePoint?: Pt;
  contentPoint?: Pt;
}
interface Opened {
  docId: string;
  pageCount: number;
  pageIds: string[];
  pageSizesPt: Pt[];
}
interface Doors {
  enters: Entered[];
  opens: Opened[];
  changes: string[];
  supports: Record<string, boolean>;
}

/** Load the test bundle; resolves once it has activated. Records what its
 *  doors see on `globalThis.__doors69`. */
async function loadDoorsBundle(page: Page): Promise<Doors["supports"]> {
  await page.waitForFunction(
    () => typeof (globalThis as unknown as { __loadTestBundle?: unknown }).__loadTestBundle === "function",
  );
  return page.evaluate((id) => {
    type Host = {
      supports(f: string): boolean;
      contribute: { editContext(c: unknown): unknown; objectType(c: unknown): unknown };
      document: {
        onDidOpen(l: (e: unknown) => void): unknown;
        onDidChange(l: (e: { kind: string }) => void): unknown;
      };
      overlay: {
        layer(id?: string): { set(s: unknown[]): void; clear(): void; dispose(): void };
        setToolPreviews(s: unknown[] | null): void;
      };
    };
    const g = globalThis as unknown as {
      __doors69: Doors & { host?: Host; layers?: Record<string, ReturnType<Host["overlay"]["layer"]>> };
      __doors69Dispose?: { dispose(): void };
      __loadTestBundle: (b: unknown) => { dispose(): void };
    };
    const doors = { enters: [], opens: [], changes: [], supports: {} } as Doors & {
      host?: Host;
    };
    g.__doors69 = doors;
    g.__doors69Dispose = g.__loadTestBundle({
      manifest: {
        id,
        name: "journey doors",
        version: "0.0.0",
        apiVersion: "^0.2",
        capabilities: {
          document: { read: "broad", write: "broad" },
          rendering: ["overlay", "sceneLayer"],
          assets: ["fonts"],
        },
        contributes: {
          editContexts: [{ type: "journeyFrame", entry: "doubleClick" }],
          objectTypes: [{ type: "journeyFrame", bakedFallback: "rectangle" }],
        },
      },
      activate(host: Host) {
        doors.host = host;
        for (const f of [
          "editContext.enterPoint@1",
          "overlay.layers@1",
          "document.onDidOpen@1",
          "assets.registerFont@1",
          "document.metadata@1",
        ]) {
          doors.supports[f] = host.supports(f);
        }
        host.contribute.editContext({
          type: "journeyFrame",
          entry: "doubleClick",
          onEnter: (ctx: Entered) => doors.enters.push(JSON.parse(JSON.stringify(ctx))),
        });
        // Claimed by this bundle's own metadata on the frame (the way a
        // web frame is), so draw's kind-claimed vectorGraphic does not
        // take the double-click.
        host.contribute.objectType({
          type: "journeyFrame",
          matches: (c: { metadata: unknown }) => c.metadata !== null,
          editContextType: "journeyFrame",
          bakedFallback: "rectangle",
        });
        host.document.onDidOpen((e) => doors.opens.push(e as Opened));
        host.document.onDidChange((e) => doors.changes.push(e.kind));
        return { dispose() {} };
      },
    });
    return doors.supports;
  }, BUNDLE_ID);
}

const doors = (page: Page): Promise<Omit<Doors, "supports">> =>
  page.evaluate(() => {
    const d = (globalThis as unknown as { __doors69: Doors }).__doors69;
    return { enters: d.enters, opens: d.opens, changes: d.changes };
  });

/** Run `body` (an async function body over `host`) inside the page and
 *  return its JSON result. */
async function hostCall<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(async (src) => {
    const d = (globalThis as unknown as { __doors69: { host: unknown } }).__doors69;
    // eslint-disable-next-line no-new-func
    const fn = new Function("host", `return (async () => { ${src} })();`);
    return JSON.parse(JSON.stringify((await fn(d.host)) ?? null));
  }, body) as Promise<T>;
}

/** Run `body` against the bundle's live host inside the page. */
async function withHost(page: Page, body: string): Promise<void> {
  await page.evaluate((src) => {
    const d = (globalThis as unknown as { __doors69: { host: unknown; layers?: unknown } }).__doors69;
    // eslint-disable-next-line no-new-func
    new Function("host", "doors", src)(d.host, d);
  }, body);
}

const near = (a: Pt | undefined, b: Pt, tol = 1.5): boolean =>
  !!a && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;

test.describe("journey · plugin doors: entering point, overlay layers, document opened, scene faces, document metadata", () => {
  test("double-clicking a claimed frame hands onEnter the page point and the frame-content point @feat:plugin-platform.edit-context @feat:plugin-platform.one-entry-gesture @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const supports = await loadDoorsBundle(page);
    expect(supports["editContext.enterPoint@1"], "the editor vouches for the point").toBe(true);

    const id = await designer.drawRectangle({ x0: 100, y0: 150, x1: 320, y1: 280 });
    expect(id, "drew a target frame").not.toBe("");
    await designer.applyFill("rectangle", id);
    await designer.activate("select");
    const frame = { kind: "rectangle", id };
    await select(page, [frame]);
    await page.evaluate(async (id) => {
      const d = (
        globalThis as unknown as {
          __doors69: {
            host: {
              document: {
                setMetadata(e: unknown, v: unknown): Promise<{ applied: boolean }>;
              };
            };
          };
        }
      ).__doors69;
      const r = await d.host.document.setMetadata(
        { kind: "rectangle", id },
        { v: 1, data: { journey: true } },
      );
      if (!r.applied) throw new Error("setMetadata was refused");
    }, id);

    // Where, in content and page space, the pointer will land.
    const DX = 60;
    const DY = 40;
    const expectedPage = await page.evaluate(
      async ({ id, dx, dy }) => {
        const c = (
          globalThis as unknown as {
            __canvas: { client: { elementGeometry(ids: unknown[]): Promise<unknown[]> } };
          }
        ).__canvas.client;
        const g = (await c.elementGeometry([{ kind: "rectangle", id }]))[0] as {
          bounds: [number, number, number, number];
          itemTransform?: [number, number, number, number, number, number] | null;
        };
        const [a, b, cc, d, tx, ty] = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
        const px = g.bounds[1] + dx;
        const py = g.bounds[0] + dy;
        return [a * px + cc * py + tx, b * px + d * py + ty] as [number, number];
      },
      { id, dx: DX, dy: DY },
    );
    const at = await screenPointInFrame(page, frame, DX, DY);
    await page.mouse.dblclick(at.x, at.y);
    await expect(page.locator(BREADCRUMB)).toBeVisible({ timeout: 10_000 });

    await expect.poll(async () => (await doors(page)).enters.length, { timeout: 10_000 }).toBe(1);
    const [entered] = (await doors(page)).enters;
    expect(entered.type).toBe("journeyFrame");
    expect(entered.id).toEqual(frame);
    const handle = await designer.handle();
    expect(entered.pageId).toBe(handle.pageIds[0]);
    // The pointer lands on a whole screen pixel, so allow that much (in
    // points at the current zoom) against the aimed point...
    const scale = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: { client: { camera: { read(): { scale: number } } } };
          }
        ).__canvas.client.camera.read().scale,
    );
    const tol = 1.5 / scale;
    expect(near(entered.pagePoint, expectedPage, tol), `pagePoint ${entered.pagePoint} ≈ ${expectedPage}`).toBe(true);
    expect(near(entered.contentPoint, [DX, DY], tol), `contentPoint ${entered.contentPoint} ≈ ${DX},${DY}`).toBe(true);
    // ...but the two must describe the SAME point: the frame is not
    // rotated or scaled, so content = page − (aimed page − aimed content).
    expect(
      near(
        entered.contentPoint,
        [
          entered.pagePoint![0] - (expectedPage[0] - DX),
          entered.pagePoint![1] - (expectedPage[1] - DY),
        ],
        0.01,
      ),
      "pagePoint and contentPoint are one point",
    ).toBe(true);
    // eslint-disable-next-line no-console
    console.log(`[doors] entered at page ${entered.pagePoint}, content ${entered.contentPoint}`);

    await page.keyboard.press("Escape");
    await expect(page.locator(BREADCRUMB)).toHaveCount(0, { timeout: 10_000 });
  });

  test("two plugin overlay layers and the tool preview are on the canvas together and clear independently @feat:plugin-platform.overlay-channel @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const supports = await loadDoorsBundle(page);
    expect(supports["overlay.layers@1"]).toBe(true);
    const pageId = (await designer.handle()).pageIds[0];

    await withHost(
      page,
      `const p = ${JSON.stringify(pageId)};
       doors.layers = { a: host.overlay.layer("a"), b: host.overlay.layer("b") };
       doors.layers.a.set([{ pageId: p, points: [[40, 40], [40, 90]] }]);
       doors.layers.b.set([{ pageId: p, rect: [120, 60, 200, 260] }]);
       host.overlay.setToolPreviews([{ kind: "text", pageId: p, x: 60, y: 320, text: "journey-preview" }]);`,
    );
    const layerA = page.locator(`[data-overlay-layer="${BUNDLE_ID}/a"]`);
    const layerB = page.locator(`[data-overlay-layer="${BUNDLE_ID}/b"]`);
    const preview = page.locator("svg text", { hasText: "journey-preview" });
    await expect(layerA.locator("polyline")).toHaveCount(1);
    await expect(layerB.locator("rect")).toHaveCount(1);
    await expect(preview).toHaveCount(1);
    // Stack order is creation order: a below b.
    const order = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll("[data-overlay-layer]")).map((n) =>
          n.getAttribute("data-overlay-layer"),
        ),
    );
    expect(order).toEqual([`${BUNDLE_ID}/a`, `${BUNDLE_ID}/b`]);

    // A tool writing the preview slot does not touch the layers.
    await withHost(page, `host.overlay.setToolPreviews(null);`);
    await expect(preview).toHaveCount(0);
    await expect(layerA.locator("polyline")).toHaveCount(1);
    await expect(layerB.locator("rect")).toHaveCount(1);

    // Clearing one layer leaves the other and the preview alone.
    await withHost(
      page,
      `host.overlay.setToolPreviews([{ kind: "text", pageId: ${JSON.stringify(pageId)}, x: 60, y: 320, text: "journey-preview" }]);
       doors.layers.a.clear();`,
    );
    await expect(layerA).toHaveCount(0);
    await expect(layerB.locator("rect")).toHaveCount(1);
    await expect(preview).toHaveCount(1);

    // Disposing the bundle takes its layers with it.
    await page.evaluate(() =>
      (globalThis as unknown as { __doors69Dispose: { dispose(): void } }).__doors69Dispose.dispose(),
    );
    await expect(page.locator("[data-overlay-layer]")).toHaveCount(0);
  });

  test("document.onDidOpen fires on File ▸ New and on opening an IDML @feat:plugin-platform.bundle-lifecycle @feat:plugin-platform.native-document @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const supports = await loadDoorsBundle(page);
    expect(supports["document.onDidOpen@1"]).toBe(true);
    expect((await doors(page)).opens, "an already-open document is not replayed").toEqual([]);

    // File ▸ New.
    await designer.newDocument();
    await expect.poll(async () => (await doors(page)).opens.length, { timeout: 10_000 }).toBe(1);
    const fresh = await designer.handle();
    const [onNew] = (await doors(page)).opens;
    expect(onNew.pageIds).toEqual(fresh.pageIds);
    expect(onNew.pageCount).toBe(fresh.pageCount);
    expect(onNew.pageSizesPt).toEqual(fresh.pageSizesPt);

    // Open: two pages, exported and opened through the importer registry
    // (the lane File ▸ Open and drag-drop take for an .idml).
    expect(await designer.addPage()).toBe(2);
    const result = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: { exportIdml(): Promise<Uint8Array> };
            registries: {
              importers: {
                resolve(name: string): {
                  import(f: { name: string; bytes: Uint8Array }): Promise<void> | void;
                } | null;
              };
            };
          };
        }
      ).__canvas;
      const bytes = await c.client.exportIdml();
      const imp = c.registries.importers.resolve("doors.idml");
      if (!imp) return "no importer claims .idml";
      await imp.import({ name: "doors.idml", bytes });
      return "";
    });
    expect(result).toBe("");
    await expect.poll(async () => (await doors(page)).opens.length, { timeout: 15_000 }).toBe(2);
    const onOpen = (await doors(page)).opens[1];
    expect(onOpen.pageCount).toBe(2);
    expect(onOpen.pageIds).toHaveLength(2);
    expect(onOpen.pageIds).toEqual((await designer.handle()).pageIds);
  });

  test("a scene face registered by a plugin draws its scene text while the document still reports the family missing @feat:plugin-platform.font-asset-serving @feat:plugin-platform.scene-layer @feat:editor-shell.panels.fonts @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, PREFLIGHT_IDML);
    const pageId = loaded.pages[0].pageId;
    const supports = await loadDoorsBundle(page);
    expect(supports["assets.registerFont@1"], "the editor's asset source registers scene faces").toBe(true);

    const missing = (): Promise<boolean | null> =>
      hostCall<boolean | null>(
        page,
        `const fonts = await host.document.collection("fonts");
         const f = fonts.find((x) => x.family === ${JSON.stringify(MISSING_FAMILY)});
         return f ? Boolean(f.isMissing) : null;`,
      );
    expect(await missing(), "the fixture's family is missing to begin with").toBe(true);

    // A frame for the plugin's scene text, and one text run naming the family.
    const frameId = await hostCall<string>(
      page,
      `const r = await host.document.mutate({ op: "insertFrame", args: { pageId: ${JSON.stringify(pageId)}, bounds: [100, 100, 220, 400] } });
       if (!r.applied || !r.createdId) throw new Error("insertFrame: " + JSON.stringify(r));
       return r.createdId.id;`,
    );
    const submitScene = (): Promise<string[]> =>
      hostCall<string[]>(
        page,
        `globalThis.__doorsScene ??= host.contribute.sceneLayer();
         const r = await globalThis.__doorsScene.submit(${JSON.stringify(frameId)}, {
           items: [{ kind: "text", x: 6, y: 60, text: "Hamburgefonstiv", size: 30,
                     paint: { r: 0, g: 0, b: 0, a: 1 }, family: ${JSON.stringify(MISSING_FAMILY)} }],
         });
         return [...r.fontFallbacks];`,
      );
    expect(await submitScene(), "unregistered: the scene run falls back").toEqual([MISSING_FAMILY]);

    // Register a face under that family through the plugin door.
    await hostCall(
      page,
      `const resp = await fetch("/fonts/Lora.ttf");
       if (!resp.ok) throw new Error("/fonts/Lora.ttf: " + resp.status);
       globalThis.__doorsFace = await host.assets.registerFont(
         new Uint8Array(await resp.arrayBuffer()), ${JSON.stringify(MISSING_FAMILY)});`,
    );
    expect(await submitScene(), "the scene run resolves the plugin's face").toEqual([]);

    // ...and the DOCUMENT does not: the family is still missing, in the
    // collection and in the Fonts panel (opened after the registration, so
    // it reads fresh).
    expect(await missing(), "the document still reports the family missing").toBe(true);
    await openPanel(page, "paged.fonts");
    await expect(page.locator('[data-fonts-panel="ready"]')).toBeVisible();
    const row = page.locator("[data-font-list] [data-list-row]", { hasText: MISSING_FAMILY });
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-row-badge="missing"]')).toBeVisible();

    // Disposing the face takes it out of the scene table again.
    await hostCall(page, `globalThis.__doorsFace.dispose();`);
    await expect.poll(submitScene, { timeout: 10_000 }).toEqual([MISSING_FAMILY]);
  });

  test("document metadata is one undoable edit that fires onDidChange @feat:plugin-platform.document-metadata @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const supports = await loadDoorsBundle(page);
    expect(supports["document.metadata@1"]).toBe(true);

    const read = (): Promise<unknown> =>
      hostCall(page, `return await host.document.getDocumentMetadata();`);
    const write = (title: string): Promise<{ applied: boolean }> =>
      hostCall(
        page,
        `return await host.document.setDocumentMetadata({ v: 1, data: { values: { title: ${JSON.stringify(title)} } } });`,
      );
    const A = { v: 1, data: { values: { title: "A" } } };
    const B = { v: 1, data: { values: { title: "B" } } };

    expect(await read(), "a new document carries none").toBeNull();
    expect((await write("A")).applied).toBe(true);
    await expect.poll(async () => (await doors(page)).changes).toEqual(["mutationApplied"]);
    expect(await read()).toEqual(A);
    expect((await write("B")).applied).toBe(true);
    expect(await read()).toEqual(B);

    // The editor's own Undo / Redo — the bundle wrote no undo code.
    await designer.runCommand("paged.editor.undo");
    await expect.poll(read).toEqual(A);
    await designer.runCommand("paged.editor.undo");
    await expect.poll(read).toBeNull();
    await designer.runCommand("paged.editor.redo");
    await expect.poll(read).toEqual(A);
    expect((await doors(page)).changes).toEqual([
      "mutationApplied",
      "mutationApplied",
      "undoApplied",
      "undoApplied",
      "redoApplied",
    ]);

    // It travels with the document: exported and reopened, the value is there.
    const reopened = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: { exportIdml(): Promise<Uint8Array> };
            registries: {
              importers: {
                resolve(name: string): {
                  import(f: { name: string; bytes: Uint8Array }): Promise<void> | void;
                } | null;
              };
            };
          };
        }
      ).__canvas;
      const bytes = await c.client.exportIdml();
      const imp = c.registries.importers.resolve("doors.idml");
      if (!imp) return "no importer claims .idml";
      await imp.import({ name: "doors.idml", bytes });
      return "";
    });
    expect(reopened).toBe("");
    await expect.poll(async () => (await doors(page)).opens.length, { timeout: 15_000 }).toBe(1);
    expect(await read(), "the label survives an IDML round trip").toEqual(A);
  });
});

