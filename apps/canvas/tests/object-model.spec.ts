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

// ADR 323 (Wave 2b) — the editor's object model, end to end on the real
// engine:
//
//   · a migrated panel field (Stroke ▸ Weight) is a schema-driven
//     `PropertyField`: its type comes from the schema row, a commit lands
//     through `host.objects` (`__canvas.objects` is the SAME shared
//     registry every bundle host is injected with), and it is ONE undo
//     step;
//   · "Bind to data…" hands paged.data (the real bundle, packed from the
//     data plugin's branch for this run) a DURABLE target — a selector over
//     a Name or an `x-paged:oid` label — never a session address, plus the
//     path and the schema row; its Bindings panel opens with the draft;
//   · the binding badge appears once paged.data reports a property binding
//     on the path (its typed `media.paged.data.propertyBindings` query).

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";
import { bindToData } from "./e2e/harness/objects";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;
const FRAME = { kind: "textFrame", id: "ua365e1" };
const ADDRESS = `textFrame:${FRAME.id}`;
const FIELD = '[data-stroke-panel="ready"] [data-property-field="frameStrokeWeight"]';

type ObjectValue = { kind: string; value?: unknown };
interface Canvas {
  client: {
    setElementSelection(ids: unknown[], mode: string): Promise<unknown[]>;
    elementProperties(id: unknown): Promise<{
      entries: { path: string; value?: { type: string; value?: unknown } | null }[];
    } | null>;
    mutate(m: unknown): Promise<unknown>;
    undo(): Promise<unknown>;
  };
  setElementSelection(ids: unknown[]): void;
  objects: {
    get(address: string, path: string): Promise<ObjectValue>;
    query(selector: string): Promise<string[]>;
    schema(addressOrKind: string): Promise<{ path: string; type: { kind: string } }[]>;
  } | null;
  registries: {
    commands: {
      register(c: { id: string; title: string; handler: (p: unknown, a: unknown) => unknown }): { dispose(): void };
    };
  };
}

async function selectFrame(page: Page) {
  await page.evaluate(async (target) => {
    const c = (globalThis as unknown as { __canvas: Canvas }).__canvas;
    const ids = await c.client.setElementSelection([target], "replace");
    c.setElementSelection(ids);
  }, FRAME);
}

const readWeight = (page: Page) =>
  page.evaluate(async (address) => {
    const c = (globalThis as unknown as { __canvas: Canvas }).__canvas;
    const v = await c.objects!.get(address, "frameStrokeWeight");
    return v.kind === "value" ? (v.value as number) : v.kind;
  }, ADDRESS);

const oidLabel = (page: Page) =>
  page.evaluate(async (target) => {
    const c = (globalThis as unknown as { __canvas: Canvas }).__canvas;
    const props = await c.client.elementProperties(target);
    const e = props?.entries.find(
      (x) => x.value?.type === "pluginMetadata" && (x.value.value as { key?: string }).key === "x-paged:oid",
    );
    return e ? ((e.value!.value as { value?: string }).value ?? null) : null;
  }, FRAME);


test.describe("ADR 323 — object model in the editor", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await selectFrame(page);
    await openPanel(page, "paged.stroke");
    await expect(page.locator(FIELD)).toHaveAttribute("data-value-type", "length");
  });

  test("OM-1 — a PropertyField write lands through host.objects and is ONE undo step @feat:editor-shell.panels.stroke @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const before = await readWeight(page);
    expect(typeof before).toBe("number");
    const next = (before as number) === 7 ? 9 : 7;

    // The panel's own control — the schema row made it a length input.
    const input = page.locator(`${FIELD} input`).first();
    await input.fill(String(next));
    await input.blur();
    await expect.poll(() => readWeight(page)).toBe(next);
    await expect(page.locator(FIELD)).toHaveAttribute("data-binding-state", "value");

    // One undo restores the previous value: the field wrote ONE step.
    await page.evaluate(() =>
      (globalThis as unknown as { __canvas: Canvas }).__canvas.client.undo(),
    );
    await expect.poll(() => readWeight(page)).toBe(before);
  });

  test("OM-2 — Bind to data… routes (selector, path, schema) to paged.data's media.paged.data.bindProperty: its Bindings panel opens with the draft; nothing is bound yet @feat:editor-shell.panels.stroke @feat:data.bind.authoring @level:happy", async ({
    page,
  }) => {
    const { selector } = await bindToData(page, page.locator(FIELD), "frameStrokeWeight");
    expect(selector.length).toBeGreaterThan(0);
    // No fallback dialog on the routed path: paged.data owns the binding UI.
    await expect(page.locator("[data-bind-to-data]")).toHaveCount(0);
    // A draft is not a binding: the badge stays off. (The Bindings panel
    // took the dock slot; bring Stroke back.)
    await openPanel(page, "paged.stroke");
    await expect(page.locator(FIELD)).not.toHaveAttribute("data-bound", "");
  });

  test("OM-3 — the durable target resolves back to the frame; a binding defined through the REAL data bundle lights the badge (asked via media.paged.data.propertyBindings, never by parsing labels) @feat:editor-shell.panels.stroke @feat:data.bind.authoring @level:happy", async ({
    page,
  }) => {
    const { selector } = await bindToData(page, page.locator(FIELD), "frameStrokeWeight");
    // Durable: a name or an x-paged:oid selector, never the session id.
    expect(selector).not.toContain(FRAME.id);
    const hits = await page.evaluate(
      (sel) => (globalThis as unknown as { __canvas: Canvas }).__canvas.objects!.query(sel),
      selector,
    );
    expect(hits).toEqual([ADDRESS]);
    // The oid label paged.data will reuse was minted by the editor.
    const label = await oidLabel(page);
    expect(label).not.toBeNull();
    expect(JSON.parse(label!)).toMatchObject({ v: 1, data: { oid: expect.any(String) } });

    await openPanel(page, "paged.stroke");
    await expect(page.locator(FIELD)).not.toHaveAttribute("data-bound", "");
    const defined = await page.evaluate(
      async ({ sel }) => {
        const o = (globalThis as unknown as { __canvas: { objects: { invoke(c: string, a: unknown): Promise<unknown> } } }).__canvas.objects;
        return o.invoke("media.paged.data.defineProperty", {
          id: "om-weight",
          selector: sel,
          path: "frameStrokeWeight",
          query: "q",
          expr: "PT(2)",
        });
      },
      { sel: selector },
    );
    expect(defined).toMatchObject({ ok: true });
    await expect(page.locator(FIELD)).toHaveAttribute("data-bound", "");
    await expect(page.locator(`${FIELD} [data-badge="bound"]`)).toBeVisible();
  });

  test("OM-4 — editor.* automation: set/get/query/schema/batch over host.objects; refusals surface with a code @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const run = (source: string) =>
      page.evaluate(
        (src) =>
          (globalThis as unknown as { __demo: { run(s: string): Promise<{ ok: boolean; error?: string }> } }).__demo.run(src),
        source,
      );
    const r = await run(`
      const rows = await editor.schema("${ADDRESS}");
      if (!rows.some((r) => r.path === "frameStrokeWeight" && r.type.kind === "length")) throw new Error("schema");
      const hits = await editor.query("frame");
      if (!hits.includes("${ADDRESS}")) throw new Error("query " + JSON.stringify(hits));
      await editor.set("${ADDRESS}", "frameStrokeWeight", 5);
      const v = await editor.get("${ADDRESS}", "frameStrokeWeight");
      if (v.value !== 5) throw new Error("get " + JSON.stringify(v));
      const b = await editor.batch([{ op: "set", address: "${ADDRESS}", path: "frameStrokeWeight", value: 6 }]);
      if (!b.applied || b.undoSteps !== 1) throw new Error("batch " + JSON.stringify(b));
    `);
    expect(r).toEqual({ ok: true });
    await expect.poll(() => readWeight(page)).toBe(6);
    const refused = await run(`await editor.get("${ADDRESS}", "noSuchPath");`);
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/^unknownPath: /);
  });
});
