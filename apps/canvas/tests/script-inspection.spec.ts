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

// W2.14 Full-Green — editor.script inspection evidence.
//
// The paged.* surface lets a script READ the scene graph the same way
// the Inspector panel does: paged.tree() (the node hierarchy),
// paged.stories() (story summaries), paged.inspect(ref) (an element's
// ElementProperties), paged.get(ref, path) (one property), and
// paged.selection() (the host's live element selection). These are the
// read primitives every automation/AI script builds on, so they must
// return real engine state — not stubs.
//
// Routes (test-map editor.script): scripting.inspection,
// the-renderer.properties-read.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;
const TEXT_FRAME_ID = "ua365e1";

interface CanvasGlobal {
  client: {
    executeScript: (
      source: string,
    ) => Promise<{ output: string[]; error: string | null }>;
    setElementSelection: (
      ids: { kind: string; id: string }[],
      mode: string,
    ) => Promise<unknown>;
  };
}

async function run(
  page: Page,
  source: string,
): Promise<{ output: string[]; error: string | null }> {
  return page.evaluate(
    async ({ source }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.executeScript(source);
    },
    { source },
  );
}

/** JSON.parse a value logged from inside Boa (peel "[log] " + the
 *  outer JSON-string quoting that console.log applies). */
async function read<T = unknown>(page: Page, expr: string): Promise<T> {
  const r = await run(page, `console.log(JSON.stringify(${expr}))`);
  if (r.error) throw new Error(`paged script error: ${r.error}`);
  const line = r.output[0] ?? "";
  const m = line.match(/^\[log\]\s+(.*)$/s);
  const payload = m ? m[1] : line;
  return JSON.parse(JSON.parse(payload) as string) as T;
}

interface TreeNode {
  id: { kind: string; id: string } | null;
  kind: string;
  children?: TreeNode[];
}

test.describe("editor.script — inspection", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-SCRIPT-INSPECT-1 — paged.tree() returns the spread/page/frame hierarchy @feat:scripting.inspection @feat:the-renderer.properties-read @level:happy", async ({
    page,
  }) => {
    const tree = await read<TreeNode[]>(page, "paged.tree()");
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0].kind).toBe("Spread");
    // The known text frame must be reachable by walking the tree.
    let found = false;
    const walk = (n: TreeNode) => {
      if (n.id?.kind === "textFrame" && n.id.id === TEXT_FRAME_ID) found = true;
      for (const c of n.children ?? []) walk(c);
    };
    for (const r of tree) walk(r);
    expect(found, `${TEXT_FRAME_ID} not present in paged.tree()`).toBe(true);
  });

  test("AC-SCRIPT-INSPECT-2 — paged.stories() summarises the document's stories", async ({
    page,
  }) => {
    const stories = await read<
      Array<{ selfId: string; characterCount: number }>
    >(page, "paged.stories()");
    expect(stories.length).toBeGreaterThan(0);
    // Every summary carries a real character count (the text the frame holds).
    expect(stories.every((s) => typeof s.characterCount === "number")).toBe(
      true,
    );
    expect(stories.some((s) => s.characterCount > 0)).toBe(true);
  });

  test("AC-SCRIPT-INSPECT-3 — paged.inspect(ref) returns the element's properties", async ({
    page,
  }) => {
    const props = await read<{
      kind: string;
      entries: Array<{ path: string; value: unknown }>;
    }>(page, `paged.inspect("textFrame:${TEXT_FRAME_ID}")`);
    expect(props.kind).toBe("TextFrame");
    expect(props.entries.length).toBeGreaterThan(0);
    // frameBounds is always emitted for a frame — a concrete property
    // path proves this is the real introspection payload, not a stub.
    expect(props.entries.some((e) => e.path === "frameBounds")).toBe(true);
  });

  test("AC-SCRIPT-INSPECT-4 — paged.get(ref, path) reads a single property and reflects a write @feat:scripting.inspection @feat:the-renderer.properties-read @level:happy", async ({
    page,
  }) => {
    // Set a known value through the script, then read it back via get —
    // a real read of live model state, not a parse echo.
    const r = await run(
      page,
      `
        paged.set("textFrame:${TEXT_FRAME_ID}", "frameOpacity", 37);
        console.log(JSON.stringify(paged.get("textFrame:${TEXT_FRAME_ID}", "frameOpacity")));
      `,
    );
    expect(r.error).toBeNull();
    const line = r.output.find((l) => l.includes("type")) ?? r.output[0];
    const m = line.match(/^\[log\]\s+(.*)$/s);
    const value = JSON.parse(JSON.parse(m ? m[1] : line) as string) as {
      type: string;
      value: number;
    };
    expect(value.value).toBe(37);
  });

  test("AC-SCRIPT-INSPECT-5 — paged.selection() reflects the host's element selection", async ({
    page,
  }) => {
    // Install a selection through the same channel the canvas click path
    // uses, then assert the script bridge converges on the same ids.
    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal })
          .__canvas;
        await c.client.setElementSelection(
          [{ kind: "textFrame", id }],
          "replace",
        );
      },
      { id: TEXT_FRAME_ID },
    );
    const sel = await read<Array<{ kind: string; id: string }>>(
      page,
      "paged.selection()",
    );
    expect(sel.length).toBe(1);
    expect(sel[0].kind).toBe("textFrame");
    expect(sel[0].id).toBe(TEXT_FRAME_ID);
  });
});
