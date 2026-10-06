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

// E2E — D-29: undo after a Data Merge RE-merge, WITHOUT the data plugin.
//
// The batches are the ones paged.data's merge writer sends for InDesign's
// `long-record-set` template (57 records on 3 pages, 26 + 26 + 5, the
// template consumed), captured from the editor and replayed here through
// the client's write door (harness/data-merge/long-record-set.merge-batches
// .json, the merge's two batches; the re-merge's clear is built from the
// document, as relower.ts builds it):
//
//   merge     = A: delete the template frame + duplicate the page twice
//               B: the content (57 frames, text, formatting, labels)
//   re-merge  = C: clear run 1 (its 57 frames, the 2 pages it added) +
//                  duplicate the page twice — the writer's FIRST batch
//               D: the content again
//
// Undo walks D, C, B, A: the first merge's output, its pages empty, then
// the template — one page, its one frame. Headless core (plugin-sdk's
// headless host over canvas-wasm 0.68.0 and a local 0.69 build) lands on
// the same states after every step, as does core's own D-29 test
// (paged-canvas tests/data_merge_pages.rs).
// Both undo routes are walked: the client door awaited step by step, and
// Edit ▸ Undo fired back to back the way a user (or a journey) does.

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";

const HARNESS = pathResolve(dirname(fileURLToPath(import.meta.url)), "harness/data-merge");

const TEMPLATE = pathResolve(HARNESS, "long-record-set.idml");
const BATCHES = JSON.parse(
  readFileSync(pathResolve(HARNESS, "long-record-set.merge-batches.json"), "utf8"),
) as { pageOrder: string[]; pages: unknown; content: unknown };

type Reply = { kind: string; payload: Record<string, unknown> };
type CanvasWindow = {
  __canvas: {
    ready: boolean;
    client: {
      send(m: unknown): Promise<Reply>;
      mutate(m: unknown): Promise<Reply>;
      undo(): Promise<Reply>;
      redo(): Promise<Reply>;
    };
    registries: {
      commands: {
        invoke?(id: string): unknown;
        execute?(id: string): unknown;
        run?(id: string): unknown;
      };
    };
  };
};

/** Per page in document order: its id and the ids of its text frames. */
async function layout(page: Page): Promise<{ page: string; frames: string[] }[]> {
  return page.evaluate(async () => {
    type Node = {
      kind: string;
      id?: { kind: string; id: string } | null;
      children?: Node[];
    };
    const c = (globalThis as unknown as CanvasWindow).__canvas;
    // The tree's Page nodes carry no id; the pages collection lists the
    // same pages in the same (document) order.
    const pages = await c.client.send({ kind: "requestCollection", payload: { name: "pages" } });
    const ids = ((pages.payload as { items?: { selfId: string }[] }).items ?? []).map(
      (p) => p.selfId,
    );
    const tree = await c.client.send({ kind: "requestSceneTree" });
    const out: { page: string; frames: string[] }[] = [];
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.kind === "Page") {
          out.push({
            page: ids[out.length] ?? "?",
            frames: (n.children ?? [])
              .map((x) => x.id)
              .filter((id): id is { kind: string; id: string } => !!id && id.kind === "textFrame")
              .map((id) => id.id),
          });
        } else if (n.children) walk(n.children);
      }
    };
    walk(((tree.payload as { roots?: Node[] }).roots ?? []) as Node[]);
    return out;
  });
}

const counts = async (page: Page) => (await layout(page)).map((p) => p.frames.length);

async function mutate(page: Page, m: unknown): Promise<Reply> {
  return page.evaluate(
    (mm) => (globalThis as unknown as CanvasWindow).__canvas.client.mutate(mm),
    m,
  );
}

/** The writer's content batch, re-addressed onto the live output pages. */
function contentFor(pages: string[]): unknown {
  let json = JSON.stringify(BATCHES.content);
  BATCHES.pageOrder.forEach((captured, i) => {
    json = json.split(`"pageId":"${captured}"`).join(`"pageId":"@@${i}"`);
  });
  pages.forEach((live, i) => {
    json = json.split(`"pageId":"@@${i}"`).join(`"pageId":"${live}"`);
  });
  return JSON.parse(json);
}

/** Merge, then re-merge (the clear riding the re-merge's pages batch). */
async function mergeTwice(page: Page): Promise<void> {
  await openCanvas(page);
  await page.setInputFiles('input[type="file"]', TEMPLATE);
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as CanvasWindow).__canvas.ready), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect.poll(() => counts(page), { timeout: 30_000 }).toEqual([1]);
  const template = (await layout(page))[0];

  // Merge: A (pages), B (content).
  expect((await mutate(page, BATCHES.pages)).kind).toBe("mutationApplied");
  const run1 = (await layout(page)).map((p) => p.page);
  expect(run1).toHaveLength(3);
  expect(run1[0]).toBe(template.page);
  expect((await mutate(page, contentFor(run1))).kind).toBe("mutationApplied");
  expect(await counts(page)).toEqual([26, 26, 5]);

  // Re-merge: C (clear run 1 + pages), D (content).
  const before = await layout(page);
  const clear = [
    ...before.flatMap((p) => p.frames.map((f) => ({ op: "deleteFrame", args: { frameId: f } }))),
    ...before.slice(1).map((p) => ({ op: "deletePage", args: { pageId: p.page } })),
    ...[1, 2].map(() => ({ op: "duplicatePage", args: { page: template.page } })),
  ];
  expect((await mutate(page, { op: "batch", args: { ops: clear } })).kind).toBe(
    "mutationApplied",
  );
  const run2 = (await layout(page)).map((p) => p.page);
  expect(run2).toHaveLength(3);
  expect(await counts(page)).toEqual([0, 0, 0]);
  expect((await mutate(page, contentFor(run2))).kind).toBe("mutationApplied");
  expect(await counts(page)).toEqual([26, 26, 5]);
}

/** After undo k (1-based): what headless core holds. */
const AFTER_UNDO: number[][] = [
  [0, 0, 0], // D undone: the re-merge's pages, empty
  [26, 26, 5], // C undone: the first merge's output
  [0, 0, 0], // B undone: the first merge's pages, empty
  [1], // A undone: the template
];

test.describe("D-29 · undo after a Data Merge re-merge (writer batches, no plugin)", () => {
  test("client undo, awaited: re-merge, merge, then the template @feat:data.lower.content", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await mergeTwice(page);
    for (const [i, want] of AFTER_UNDO.entries()) {
      const r = await page.evaluate(() =>
        (globalThis as unknown as CanvasWindow).__canvas.client.undo(),
      );
      expect(r.kind, `undo ${i + 1}`).toBe("undoApplied");
      await expect.poll(() => counts(page), { timeout: 10_000, message: `undo ${i + 1}` }).toEqual(want);
    }
    const t = await layout(page);
    expect(t).toHaveLength(1);
    // Redo walks forward again to the re-merge.
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => (globalThis as unknown as CanvasWindow).__canvas.client.redo());
    }
    await expect.poll(() => counts(page), { timeout: 10_000 }).toEqual([26, 26, 5]);
  });

  test("Edit ▸ Undo ×4 back to back: the template @feat:data.lower.content", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await mergeTwice(page);
    // Fired without waiting between them, as a user's Cmd-Z run does.
    await page.evaluate(async () => {
      const cmd = (globalThis as unknown as CanvasWindow).__canvas.registries.commands;
      const fn = cmd.invoke ?? cmd.execute ?? cmd.run;
      for (let i = 0; i < 4; i++) await fn?.call(cmd, "paged.editor.undo");
    });
    await expect.poll(() => counts(page), { timeout: 15_000 }).toEqual([1]);
    // And it stays there: nothing re-applies a step behind the undo.
    await page.waitForTimeout(1_000);
    expect(await counts(page)).toEqual([1]);
  });
});
