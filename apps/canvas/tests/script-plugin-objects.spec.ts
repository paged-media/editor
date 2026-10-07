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

// ADR 323 — a Boa script reaches a PLUGIN object (engine protocol 71 host
// bridge). The script runs in the worker; its `plugin:` calls suspend it,
// the main thread answers through the ONE shared registry
// (`__canvas.objects`, the instance every bundle host gets), and a script
// that writes a plugin property and a core property is ONE undo step.
//
// The plugin here is a test kind registered straight into the shared
// registry: its state is a label on the frame it annotates, written as the
// mutation the registry commits — the label-backed pattern a real bundle
// uses for state it keeps outside core.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;
const FRAME = { kind: "textFrame", id: "ua365e1" };
const ADDRESS = `textFrame:${FRAME.id}`;
const PLUGIN = "test.scripts";
const NOTE = `plugin:${PLUGIN}/note/1`;

type ObjectValue = { kind: string; value?: unknown };
interface Canvas {
  client: {
    executeScript(source: string): Promise<{ output: string[]; error: string | null }>;
    elementProperties(id: unknown): Promise<{
      entries: { path: string; value?: { type: string; value?: unknown } | null }[];
    } | null>;
    undo(): Promise<unknown>;
  };
  objects: {
    get(address: string, path: string): Promise<ObjectValue>;
    query(selector: string): Promise<string[]>;
    register(r: unknown): { dispose(): void };
  } | null;
}

/** Register the test kind: one note whose `text` lives in the frame's
 *  `x-paged:test.scripts` label. */
async function registerNoteKind(page: Page) {
  await page.evaluate(
    ({ frame, address, plugin }) => {
      const c = (globalThis as unknown as { __canvas: Canvas }).__canvas;
      const key = `x-paged:${plugin}`;
      const readText = async (): Promise<string> => {
        const props = await c.client.elementProperties(frame);
        const e = props?.entries.find(
          (x) => x.value?.type === "pluginMetadata" && (x.value.value as { key?: string }).key === key,
        );
        const raw = e ? (e.value!.value as { value?: string }).value : null;
        return raw ? (JSON.parse(raw) as { data: { text: string } }).data.text : "";
      };
      c.objects!.register({
        plugin,
        model: {
          // A typed plugin command: its handler writes through the registry
          // view it is handed (the script bridge's tracked view under Boa).
          commands: [
            {
              id: `${plugin}.annotate`,
              title: "Annotate",
              args: { kind: "struct", fields: { text: { kind: "text" } } },
              handler: async (ctx: { objects: { set(a: string, p: string, v: unknown): Promise<{ applied: boolean }> } }, args: { text: string }) =>
                (await ctx.objects.set(`plugin:${plugin}/note/1`, "text", args.text)).applied,
            },
          ],
          kinds: [
            {
              kind: "note",
              title: "Note",
              schema: [{ path: "text", type: { kind: "text" } }],
              hostOf: () => address,
              list: () => [`plugin:${plugin}/note/1`],
              get: async (_a: string, path: string) =>
                path === "text" ? { kind: "value", value: await readText() } : { kind: "absent" },
              set: (_a: string, _path: string, value: unknown) => ({
                kind: "mutations",
                mutations: [
                  {
                    op: "setPluginMetadata",
                    args: { elementId: frame, key, value: JSON.stringify({ v: 1, data: { text: value } }) },
                  },
                ],
              }),
            },
          ],
        },
      });
    },
    { frame: FRAME, address: ADDRESS, plugin: PLUGIN },
  );
}

const run = (page: Page, source: string) =>
  page.evaluate(async (s) => {
    const c = (globalThis as unknown as { __canvas: Canvas }).__canvas;
    return c.client.executeScript(s);
  }, source);

const query = (page: Page, selector: string) =>
  page.evaluate(
    async (sel) => (globalThis as unknown as { __canvas: Canvas }).__canvas.objects!.query(sel),
    selector,
  );

const undo = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __canvas: Canvas }).__canvas.client.undo());

const read = (page: Page, address: string, path: string) =>
  page.evaluate(
    async ({ address, path }) => {
      const c = (globalThis as unknown as { __canvas: Canvas }).__canvas;
      const v = await c.objects!.get(address, path);
      return v.kind === "value" ? v.value : v.kind;
    },
    { address, path },
  );

test.describe("ADR 323 — Boa scripts reach plugin objects", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await registerNoteKind(page);
  });

  test("SB-1 — paged.runScript sets a plugin property and a core property; ONE undo step @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const before = await read(page, ADDRESS, "frameStrokeWeight");
    const next = before === 6 ? 8 : 6;
    const r = await run(
      page,
      `paged.set(${JSON.stringify(NOTE)}, "text", "from a script");
       console.log(paged.set(${JSON.stringify(ADDRESS)}, "frameStrokeWeight", ${next}));
       console.log(JSON.parse(await paged.get(${JSON.stringify(NOTE)}, "text")));`,
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(["[log] true", "[log] from a script"]);
    expect(await read(page, NOTE, "text")).toBe("from a script");
    expect(await read(page, ADDRESS, "frameStrokeWeight")).toBe(next);

    await page.evaluate(() => (globalThis as unknown as { __canvas: Canvas }).__canvas.client.undo());
    expect(await read(page, NOTE, "text")).toBe("");
    expect(await read(page, ADDRESS, "frameStrokeWeight")).toBe(before);
  });

  test("SB-2 — a refused plugin write is an exception carrying the registry's code @feat:scripting.property-readwrite @level:edge", async ({
    page,
  }) => {
    const r = await run(
      page,
      `try { await paged.set(${JSON.stringify(NOTE)}, "text", 42); } catch (e) { console.log("refused", e.code); }
       try { await paged.get("plugin:${PLUGIN}/nope/1", "text"); } catch (e) { console.log("refused", e.code); }`,
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(["[log] refused invalidValue", "[log] refused unknownAddress"]);
  });

  test("SB-3 — a UI edit made while a script waits on the host stays its OWN undo step; the script's plugin + core writes stay one @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:edge", async ({
    page,
  }) => {
    // A second test kind whose read PARKS the script until the test lets
    // it go, so a UI edit can land while the script is suspended.
    await page.evaluate((plugin) => {
      const c = (globalThis as unknown as { __canvas: Canvas }).__canvas;
      const g = globalThis as unknown as { __gate?: { parked: boolean; release?: () => void } };
      g.__gate = { parked: false };
      c.objects!.register({
        plugin: `${plugin}.gate`,
        model: {
          kinds: [
            {
              kind: "gate",
              title: "Gate",
              schema: [{ path: "open", type: { kind: "bool" } }],
              list: () => [`plugin:${plugin}.gate/gate/1`],
              get: () =>
                new Promise((resolve) => {
                  g.__gate!.parked = true;
                  g.__gate!.release = () => resolve({ kind: "value", value: true });
                }),
            },
          ],
        },
      });
    }, PLUGIN);
    const GATE = `plugin:${PLUGIN}.gate/gate/1`;
    const weightBefore = await read(page, ADDRESS, "frameStrokeWeight");
    const weight = weightBefore === 6 ? 8 : 6;
    const opacityBefore = await read(page, ADDRESS, "frameOpacity");
    const opacity = opacityBefore === 40 ? 60 : 40;

    // The script parks on the host FIRST, then writes a plugin and a core
    // property. (Its records must be contiguous to fold: a script record
    // made BEFORE a foreign edit cannot join a step that ends after it —
    // the engine keeps that one as its own step.)
    const script = page.evaluate(
      async ({ src }) => (globalThis as unknown as { __canvas: Canvas }).__canvas.client.executeScript(src),
      {
        src: `await paged.get(${JSON.stringify(GATE)}, "open");
              paged.set(${JSON.stringify(NOTE)}, "text", "scripted");
              paged.set(${JSON.stringify(ADDRESS)}, "frameStrokeWeight", ${weight});`,
      },
    );
    await expect
      .poll(() => page.evaluate(() => (globalThis as unknown as { __gate: { parked: boolean } }).__gate.parked))
      .toBe(true);
    // The UI edit, through the same registry a panel field writes with.
    const ui = await page.evaluate(
      async ({ address, opacity }) =>
        (globalThis as unknown as { __canvas: { objects: { set(a: string, p: string, v: unknown): Promise<{ applied: boolean }> } } })
          .__canvas.objects.set(address, "frameOpacity", opacity),
      { address: ADDRESS, opacity },
    );
    expect(ui.applied).toBe(true);
    await page.evaluate(() => (globalThis as unknown as { __gate: { release(): void } }).__gate.release());
    const r = await script;
    expect(r.error).toBeNull();
    expect(await read(page, NOTE, "text")).toBe("scripted");
    expect(await read(page, ADDRESS, "frameStrokeWeight")).toBe(weight);
    expect(await read(page, ADDRESS, "frameOpacity")).toBe(opacity);

    // Undo once: the SCRIPT's step — both its writes, the plugin one
    // included (reported as committed) — and nothing of the UI edit.
    await page.evaluate(() => (globalThis as unknown as { __canvas: Canvas }).__canvas.client.undo());
    expect(await read(page, NOTE, "text")).toBe("");
    expect(await read(page, ADDRESS, "frameStrokeWeight")).toBe(weightBefore);
    expect(await read(page, ADDRESS, "frameOpacity")).toBe(opacity);
    // Undo again: the UI edit, on its own.
    await page.evaluate(() => (globalThis as unknown as { __canvas: Canvas }).__canvas.client.undo());
    expect(await read(page, ADDRESS, "frameOpacity")).toBe(opacityBefore);
  });
  test("SB-4 — paged.invoke runs a CORE command and a PLUGIN command from a script; ONE undo step @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const [pageAddress] = await query(page, "page");
    const framesBefore = (await query(page, "frame")).length;
    const r = await run(
      page,
      `const made = JSON.parse(await paged.invoke("core.insertFrame", { pageId: ${JSON.stringify(pageAddress)}, bounds: [20, 20, 80, 120] }));
       console.log(made.created.length, made.undoSteps);
       console.log(JSON.parse(await paged.invoke("${PLUGIN}.annotate", { text: "invoked" })));
       try { await paged.invoke("${PLUGIN}.nothing", {}); } catch (e) { console.log("refused", e.code); }`,
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(["[log] 1 1", "[log] true", "[log] refused unknownCommand"]);
    expect((await query(page, "frame")).length).toBe(framesBefore + 1);
    expect(await read(page, NOTE, "text")).toBe("invoked");

    // ONE undo: the core command AND the plugin command's write (reported
    // as committed by the bridge's tracked view).
    await undo(page);
    expect((await query(page, "frame")).length).toBe(framesBefore);
    expect(await read(page, NOTE, "text")).toBe("");
  });

  test("SB-5 — paged.commands lists core and plugin commands; an invoke op inside paged.batch shares its ONE undo step @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:edge", async ({
    page,
  }) => {
    const [pageAddress] = await query(page, "page");
    const framesBefore = (await query(page, "frame")).length;
    const before = await read(page, ADDRESS, "frameStrokeWeight");
    const next = before === 6 ? 8 : 6;
    const r = await run(
      page,
      `const all = JSON.parse(await paged.commands());
       console.log(all[0].owner, all.some(c => c.id === "core.insertFrame"), JSON.parse(await paged.commands("${PLUGIN}")).map(c => c.id).join());
       console.log(await paged.batch([
         { op: "set", address: ${JSON.stringify(NOTE)}, path: "text", value: "batched" },
         { op: "invoke", id: "core.insertFrame", args: { pageId: ${JSON.stringify(pageAddress)}, bounds: [20, 20, 80, 120] }, handle: "box" },
         { op: "set", address: "$h:box", path: "frameStrokeWeight", value: 5 },
         { op: "set", address: ${JSON.stringify(ADDRESS)}, path: "frameStrokeWeight", value: ${next} },
       ]));`,
    );
    expect(r.error).toBeNull();
    expect(r.output[0]).toBe(`[log] core true ${PLUGIN}.annotate`);
    expect(JSON.parse(r.output[1]!.replace("[log] ", ""))).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);
    expect((await query(page, "frame")).length).toBe(framesBefore + 1);
    expect(await read(page, NOTE, "text")).toBe("batched");
    expect(await read(page, ADDRESS, "frameStrokeWeight")).toBe(next);

    await undo(page);
    expect((await query(page, "frame")).length).toBe(framesBefore);
    expect(await read(page, NOTE, "text")).toBe("");
    expect(await read(page, ADDRESS, "frameStrokeWeight")).toBe(before);
  });
});
