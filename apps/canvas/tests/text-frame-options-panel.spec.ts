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

// SDK Phase 5 (v1 sweep) — Text Frame Options panel acceptance.
//
// One row today (inset spacing); the row's BoundsLeaf reuses the
// same primitive the Object panel uses for Frame Bounds. AC-TFO-2
// pins the apply path end-to-end: a setProperty against
// frameInsetSpacing flows through the new apply arm.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Text Frame Options panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.text-frame-options");
  });

  test("AC-TFO-1 — panel mounts as a composition @feat:editor-shell.panels.text-frame-options @level:smoke", async ({ page }) => {
    await expect(
      page.locator('[data-text-frame-options-panel="ready"]'),
    ).toBeVisible();
  });

  test("AC-TFO-2 — frameInsetSpacing apply round-trips @feat:editor-shell.panels.text-frame-options @level:happy", async ({ page }) => {
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          mutate(op: unknown): Promise<unknown>;
        };
      };
      const w = window as unknown as { __canvas?: DebugCanvas };
      const dbg = w.__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");

      // Walk the tree for the first TextFrame.
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const walk = (nodes: Node[] | undefined): Node["id"] => {
        if (!nodes) return null;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") return n.id;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no TextFrame");

      const addr = `${target.kind}:${target.id}`;
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameInsetSpacing",
          value: { type: "bounds", value: [10, 20, 30, 40] },
        },
      });
      await new Promise((r) => setTimeout(r, 50));

      const inspectJson = await dbg.client
        .executeScript(`paged.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{
          path: string;
          value: { type: string; value: number[] } | null;
        }>;
      };
      const entry = inspect.entries.find((e) => e.path === "frameInsetSpacing");
      return entry?.value?.value ?? null;
    });

    expect(result).toEqual([10, 20, 30, 40]);
  });

  test("AC-TFO-3 — text-frame-pref sandwich: VJ + auto-size + columns set → assert → undo @feat:editor-shell.panels.text-frame-options @level:happy", async ({
    page,
  }) => {
    // W2.3 — the TextFrame-only preference paths. Enum-string fields
    // carry the RAW IDML strings (CenterAlign / WidthOnly); columns
    // are Length. set → assert → undo → restored, through the REAL
    // apply + undo dispatch.
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: unknown } | null;
            }>;
          } | null>;
          mutate(op: unknown): Promise<unknown>;
          undo(): Promise<unknown>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");

      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const walk = (nodes: Node[] | undefined): Node["id"] => {
        if (!nodes) return null;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") return n.id;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no TextFrame");

      const read = async (path: string) => {
        const props = await dbg.client!.elementProperties(target);
        return props?.entries.find((e) => e.path === path)?.value?.value ?? null;
      };

      const before = {
        vj: await read("textFrameVerticalJustification"),
        autoSize: await read("textFrameAutoSizing"),
        cols: await read("textFrameColumnCount"),
      };

      const set = (path: string, value: unknown) =>
        dbg.client!.mutate({
          op: "setElementProperty",
          args: { elementId: target, path, value },
        });

      await set("textFrameVerticalJustification", {
        type: "text",
        value: "CenterAlign",
      });
      await set("textFrameAutoSizing", { type: "text", value: "WidthOnly" });
      await set("textFrameColumnCount", { type: "length", value: 3 });
      await new Promise((r) => setTimeout(r, 40));

      const after = {
        vj: await read("textFrameVerticalJustification"),
        autoSize: await read("textFrameAutoSizing"),
        cols: await read("textFrameColumnCount"),
      };

      // Undo the three writes.
      await dbg.client.undo();
      await dbg.client.undo();
      await dbg.client.undo();
      await new Promise((r) => setTimeout(r, 40));
      const restored = {
        vj: await read("textFrameVerticalJustification"),
        autoSize: await read("textFrameAutoSizing"),
        cols: await read("textFrameColumnCount"),
      };

      return { before, after, restored };
    });

    expect(result.after.vj).toBe("CenterAlign");
    expect(result.after.autoSize).toBe("WidthOnly");
    expect(result.after.cols).toBe(3);
    expect(result.restored).toEqual(result.before);
  });
});
