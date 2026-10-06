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
});
