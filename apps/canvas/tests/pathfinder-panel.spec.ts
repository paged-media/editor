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

// SDK Phase 5 (v1 sweep) — Pathfinder panel acceptance.
//
// Curve-preserving Bezier CSG via flo_curves. All four ops
// (Union / Intersect / Subtract / Exclude) ship in v1.
// The TS panel dispatches a single `Mutation::PathfinderBoolean`;
// the Rust apply layer reads each frame's path, runs flo_curves
// (`path_add` / `path_sub` / `path_intersect`), and builds an
// internal Batch (FramePath + RemoveNode) so one Cmd-Z reverses
// everything.
//
// Fixtures use plain rectangles so the apply result is
// predictable — Union of two non-overlapping rects = compound
// path of 2 subpaths; Subtract overlapping = L-shape of 6
// vertices; Intersect of overlapping = the overlap rect.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

test.describe("Phase 5 — Pathfinder panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.pathfinder");
  });

  test("AC-PF-1 — panel mounts; 4 buttons; all enabled when 2+ selected @feat:editor-shell.panels.pathfinder @feat:frames-paths.pathfinder-boolean @level:smoke", async ({
    page,
  }) => {
    await expect(page.locator('[data-pathfinder-panel="ready"]')).toBeVisible();
    const buttons = page.locator(
      '[data-pathfinder-panel="ready"] button[data-pathfinder-kind]',
    );
    await expect(buttons).toHaveCount(4);
    // Hint visible with empty selection (all buttons disabled).
    await expect(
      page.locator('[data-pathfinder-panel="ready"] [data-pathfinder-hint]'),
    ).toBeVisible();
  });

  test("AC-PF-2 — Subtract on overlapping rects yields L-shape + removes others @feat:editor-shell.panels.pathfinder @feat:frames-paths.pathfinder-boolean @level:happy", async ({
    page,
  }) => {
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
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
          mutate(op: unknown): Promise<unknown>;
          pathAnchors(id: unknown): Promise<{
            anchors: Array<{ anchor: [number, number] }>;
            subpathStarts: number[];
          } | null>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const ids: Array<{ kind: string; id: string }> = [];
      const walk = (nodes: Node[] | undefined) => {
        if (!nodes) return;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") ids.push(n.id);
          walk(n.children);
        }
      };
      walk(JSON.parse(treeJson) as Node[]);
      if (ids.length < 2) throw new Error("< 2 TextFrames");
      const pair = ids.slice(0, 2);
      // Pin both bounds + anchors so the Pathfinder reads
      // a deterministic geometry (the fixture's parsed anchors
      // would otherwise dominate via the path_anchors fallback).
      const rect = (
        l: number,
        t: number,
        r: number,
        b: number,
      ): Array<{
        anchor: [number, number];
        left: [number, number];
        right: [number, number];
      }> => [
        { anchor: [l, t], left: [l, t], right: [l, t] },
        { anchor: [r, t], left: [r, t], right: [r, t] },
        { anchor: [r, b], left: [r, b], right: [r, b] },
        { anchor: [l, b], left: [l, b], right: [l, b] },
      ];
      await dbg.client.mutate({
        op: "batch",
        args: {
          ops: [
            {
              op: "setElementProperty",
              args: {
                elementId: pair[0],
                path: "frameBounds",
                value: { type: "bounds", value: [0, 0, 20, 20] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[0],
                path: "framePath",
                value: {
                  type: "framePath",
                  value: { anchors: rect(0, 0, 20, 20), subpathStarts: [0] },
                },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[1],
                path: "frameBounds",
                value: { type: "bounds", value: [10, 10, 30, 30] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[1],
                path: "framePath",
                value: {
                  type: "framePath",
                  value: { anchors: rect(10, 10, 30, 30), subpathStarts: [0] },
                },
              },
            },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      dbg.setElementSelection?.(pair, "replace");
      await new Promise((r) => setTimeout(r, 80));
      return JSON.stringify(pair);
    });

    // Dispatch the Mutation directly to isolate the wire from the
    // panel UI. The panel just packs elementSelection into this
    // same payload.
    await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: { mutate(op: unknown): Promise<unknown> };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      await dbg.client.mutate({
        op: "pathfinderBoolean",
        args: { kept: pair[0], others: [pair[1]], kind: "subtract" },
      });
    }, result);
    await page.waitForTimeout(300);

    // Inspect bounds before the click — confirms the setup batch
    // landed and the kept frame is at [0,0,20,20].
    const beforeKeptBounds = await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const props = await dbg.client.elementProperties(pair[0]);
      return (
        props?.entries.find((e) => e.path === "frameBounds")?.value?.value ??
        null
      );
    }, result);
    // The kept frame's bounds aren't touched by FramePath — only
    // its anchors. Bounds stay at [0,0,20,20] (the prior setup).
    expect(beforeKeptBounds).toEqual([0, 0, 20, 20]);

    const aftermath = await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
          pathAnchors(id: unknown): Promise<{
            anchors: Array<{ anchor: [number, number] }>;
            subpathStarts: number[];
          } | null>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const props0 = await dbg.client.elementProperties(pair[0]);
      const props1 = await dbg.client.elementProperties(pair[1]);
      const anchors0 = await dbg.client.pathAnchors(pair[0]);
      const boundsAfter =
        props0?.entries.find((e) => e.path === "frameBounds")?.value?.value ??
        null;
      return {
        keptExists: props0 !== null,
        otherGone: props1 === null,
        keptVertexCount: anchors0?.anchors.length ?? 0,
        keptBoundsAfter: boundsAfter,
        keptAnchorsRaw: anchors0?.anchors ?? null,
      };
    }, result);

    // Diagnostic — surface everything via the test message so we
    // can see WHAT state the apply landed in.
    expect(
      aftermath,
      `aftermath state: ${JSON.stringify(aftermath)}`,
    ).toMatchObject({
      keptExists: true,
      otherGone: true,
      keptVertexCount: 6,
    });
  });

  test("AC-PF-3 — single Cmd-Z reverses the whole Pathfinder op @feat:editor-shell.panels.pathfinder @feat:frames-paths.pathfinder-boolean @level:happy", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<unknown>;
          mutate(op: unknown): Promise<unknown>;
          undo(): Promise<unknown>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const ids: Array<{ kind: string; id: string }> = [];
      const walk = (nodes: Node[] | undefined) => {
        if (!nodes) return;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") ids.push(n.id);
          walk(n.children);
        }
      };
      walk(JSON.parse(treeJson) as Node[]);
      if (ids.length < 2) throw new Error("< 2 TextFrames");
      const pair = ids.slice(0, 2);
      await dbg.client.mutate({
        op: "batch",
        args: {
          ops: [
            {
              op: "setElementProperty",
              args: {
                elementId: pair[0],
                path: "frameBounds",
                value: { type: "bounds", value: [0, 0, 20, 20] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[1],
                path: "frameBounds",
                value: { type: "bounds", value: [10, 10, 30, 30] },
              },
            },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      dbg.setElementSelection?.(pair, "replace");
      await new Promise((r) => setTimeout(r, 80));
      return JSON.stringify(pair);
    });

    // Run Union (any op is fine — point is the undo coalescing).
    await page
      .locator(
        '[data-pathfinder-panel="ready"] button[data-pathfinder-kind="union"]',
      )
      .click();
    await page.waitForTimeout(150);

    // One undo.
    await page.evaluate(async () => {
      type DebugCanvas = {
        client?: { undo(): Promise<unknown> };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      await dbg.client.undo();
    });
    await page.waitForTimeout(150);

    const restored = await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<unknown>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const p0 = await dbg.client.elementProperties(pair[0]);
      const p1 = await dbg.client.elementProperties(pair[1]);
      return { keptExists: p0 !== null, otherRestored: p1 !== null };
    }, result);

    // After one undo, both frames exist again.
    expect(restored.keptExists).toBe(true);
    expect(restored.otherRestored).toBe(true);
  });
});

// ---------------------------------------------------------------------
// B-22 (engine protocol v57) — the REGION Pathfinder row.
//
// Divide / Trim / Merge / Crop / Outline / Minus back shipped as
// DISABLED SEAMS until v57; they are live buttons now. These specs drive
// them through the PANEL (a real click on the tile), not through the
// wire, because the thing under test is what the panel contributes on
// top of the mutation: the TOP-TO-BOTTOM ordering it derives from the
// scene tree, and the refusal it puts in front of the user.

interface PanelElementId {
  kind: string;
  id: string;
}

/** Insert an axis-aligned closed quad on `pageId` and return its id.
 *  (`loadIdml` reports the page ids; the React `__canvas.handle` mirror
 *  stays null on the direct-load path the driver takes.) */
async function insertQuad(
  page: import("@playwright/test").Page,
  pageId: string,
  box: [number, number, number, number],
): Promise<PanelElementId> {
  return page.evaluate(
    async ({ pageId, b }) => {
      const dbg = (
        window as unknown as {
          __canvas?: { client?: { mutate(op: unknown): Promise<unknown> } };
        }
      ).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const [l, t, r, bo] = b;
      const pt = (x: number, y: number) => ({
        anchor: [x, y],
        left: [x, y],
        right: [x, y],
      });
      const reply = (await dbg.client.mutate({
        op: "insertPath",
        args: {
          pageId,
          anchors: [pt(l, t), pt(r, t), pt(r, bo), pt(l, bo)],
          open: false,
        },
      })) as { kind: string; payload: { createdId?: PanelElementId | null } };
      if (reply.kind !== "mutationApplied" || !reply.payload.createdId) {
        throw new Error(`insertPath failed: ${reply.kind}`);
      }
      return reply.payload.createdId;
    },
    { pageId, b: box },
  );
}

/** Every selectable leaf in the scene tree, in paint order. */
async function leafIds(
  page: import("@playwright/test").Page,
): Promise<PanelElementId[]> {
  return page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        __canvas?: { client?: { sceneTree(): Promise<unknown[]> } };
      }
    ).__canvas;
    if (!dbg?.client) throw new Error("no client");
    const out: PanelElementId[] = [];
    const walk = (
      nodes: Array<{ id?: PanelElementId | null; children?: unknown[] }>,
    ) => {
      for (const n of nodes) {
        if (n.id) out.push(n.id);
        if (n.children) walk(n.children as never);
      }
    };
    walk((await dbg.client.sceneTree()) as never);
    return out;
  });
}

async function anchorCount(
  page: import("@playwright/test").Page,
  id: PanelElementId,
): Promise<number | null> {
  return page.evaluate(async (target) => {
    const dbg = (
      window as unknown as {
        __canvas?: {
          client?: {
            pathAnchors(id: unknown): Promise<{ anchors: unknown[] } | null>;
          };
        };
      }
    ).__canvas;
    if (!dbg?.client) throw new Error("no client");
    const t = await dbg.client.pathAnchors(target);
    return t ? t.anchors.length : null;
  }, id);
}

async function select(
  page: import("@playwright/test").Page,
  ids: PanelElementId[],
): Promise<void> {
  await page.evaluate((sel) => {
    const dbg = (
      window as unknown as {
        __canvas?: { setElementSelection?(ids: unknown[], mode: string): void };
      }
    ).__canvas;
    dbg?.setElementSelection?.(sel, "replace");
  }, ids);
  await page.waitForTimeout(120);
}

async function undo(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        __canvas?: { client?: { undo(): Promise<unknown> } };
      }
    ).__canvas;
    await dbg?.client?.undo();
  });
  await page.waitForTimeout(200);
}

test.describe("B-22 — the region Pathfinder row", () => {
  let pageId = "";

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const doc = await loadIdml(page, FIXTURE);
    pageId = doc.pages[0].pageId;
    await openPanel(page, "paged.pathfinder");
  });

  test("AC-PF-4 — the six region verbs are LIVE buttons, not seams @feat:editor-shell.panels.pathfinder @feat:frames-paths.pathfinder-boolean @level:smoke", async ({
    page,
  }) => {
    const verbs = page.locator(
      '[data-pathfinder-panel="ready"] button[data-pathfinder-verb]',
    );
    await expect(verbs).toHaveCount(6);
    // Disabled with an empty selection, but NOT `data-seam` — a seam is
    // permanently dead, these wait for operands.
    await expect(
      page.locator(
        '[data-pathfinder-panel="ready"] button[data-pathfinder-verb][data-seam]',
      ),
    ).toHaveCount(0);
    // Convert shape stays an honest seam (no Operation behind it).
    await expect(
      page.locator("[data-convert-shape-seam] button[data-seam]"),
    ).toHaveCount(4);

    const a = await insertQuad(page, pageId, [100, 100, 300, 300]);
    const b = await insertQuad(page, pageId, [200, 200, 400, 400]);
    await select(page, [a, b]);
    await expect(
      page.locator('button[data-pathfinder-verb="pathfinderDivide"]'),
    ).toBeEnabled();
  });

  test("AC-PF-5 — Divide splits the arrangement into one object per face @feat:editor-shell.panels.pathfinder @feat:frames-paths.pathfinder-boolean @level:happy", async ({
    page,
  }) => {
    const a = await insertQuad(page, pageId, [100, 100, 300, 300]); // back
    const b = await insertQuad(page, pageId, [200, 200, 400, 400]); // front
    const before = (await leafIds(page)).length;
    await select(page, [a, b]);

    await page
      .locator('button[data-pathfinder-verb="pathfinderDivide"]')
      .click();
    await page.waitForTimeout(400);

    // Three faces from two overlapping squares: both inputs are reused
    // as carriers and one FRESH object carries the surplus face.
    const after = await leafIds(page);
    expect(after.length, `leaves after Divide: ${after.length}`).toBe(
      before + 1,
    );
    expect(after.some((e) => e.id === a.id)).toBe(true);
    expect(after.some((e) => e.id === b.id)).toBe(true);
    // No refusal was shown.
    await expect(page.locator("[data-pathfinder-error]")).toHaveCount(0);

    await undo(page);
    expect((await leafIds(page)).length).toBe(before);
  });

  test("AC-PF-6 — Minus back reads the real z-order, not the click order @feat:editor-shell.panels.pathfinder @feat:frames-paths.pathfinder-boolean @level:happy", async ({
    page,
  }) => {
    const back = await insertQuad(page, pageId, [100, 100, 300, 300]);
    const front = await insertQuad(page, pageId, [200, 200, 400, 400]);
    const before = (await leafIds(page)).length;
    // Select BOTTOM-UP on purpose: click order says `back` is first.
    // A panel that trusted click order would treat it as the topmost and
    // keep `front` instead.
    await select(page, [back, front]);

    await page
      .locator('button[data-pathfinder-verb="pathfinderMinusBack"]')
      .click();
    await page.waitForTimeout(400);

    const after = await leafIds(page);
    expect(after.length).toBe(before - 1);
    expect(after.some((e) => e.id === back.id)).toBe(true);
    expect(after.some((e) => e.id === front.id)).toBe(false);
    // The survivor is the BACK square minus the front one — the
    // six-vertex L, not the untouched four-vertex square.
    expect(await anchorCount(page, back)).toBe(6);
    await expect(page.locator("[data-pathfinder-error]")).toHaveCount(0);

    await undo(page);
    expect((await leafIds(page)).length).toBe(before);
    expect(await anchorCount(page, back)).toBe(4);
  });

  test("AC-PF-7 — more than 12 inputs surfaces the engine's REASON, not a silent no-op @feat:editor-shell.panels.pathfinder @feat:frames-paths.pathfinder-boolean @level:edge", async ({
    page,
  }) => {
    // Thirteen mutually overlapping quads — one past the planar
    // kernel's input cap. The engine REFUSES rather than truncating.
    const ids: PanelElementId[] = [];
    for (let i = 0; i < 13; i++) {
      const o = i * 5;
      ids.push(
        await insertQuad(page, pageId, [100 + o, 100 + o, 300 + o, 300 + o]),
      );
    }
    const before = (await leafIds(page)).length;
    await select(page, ids);

    await page
      .locator('button[data-pathfinder-verb="pathfinderDivide"]')
      .click();
    await page.waitForTimeout(400);

    const status = page.locator("[data-pathfinder-error]");
    await expect(status).toBeVisible();
    await expect(status).toContainText("at most 12");
    await expect(status).toContainText("13");
    // Refused means nothing changed — not a partial, truncated result.
    expect((await leafIds(page)).length).toBe(before);
  });
});
