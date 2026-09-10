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

import {
  openCanvas,
  loadIdml,
  openPanel,
  snapshotPagePng,
} from "./fidelity/canvas-driver";
import { elementPageRectPt } from "./e2e/harness/fixtures";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

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

  // AC-TFO-3 above proves the column paths WRITE, READ BACK and UNDO.
  // For most of this panel's life that was the whole story: all three
  // column controls were bound LIVE, wrote correctly, showed the value
  // back — and moved nothing on the canvas, because the composer's
  // per-column layout was a deferred wave. A model assertion cannot see
  // that. This is the half that can.
  //
  // The signal is a GUTTER measured INSIDE THE FRAME'S OWN RECTANGLE.
  // Two earlier drafts of this test measured the whole snapshot and
  // both passed on nonsense: this is a GEOMETRY fixture whose other
  // shapes carry most of the page's ink, so a frame-sized change never
  // moved the page-sized number. `elementPageRectPt` is the same
  // page-space conversion the render-region helpers use.
  test("AC-TFO-4 — two columns open a gutter inside the frame @feat:layout-model.text-columns @feat:editor-shell.panels.text-frame-options @level:happy", async ({
    page,
  }) => {
    // ENGINE, NOT TEST. The editor consumes PUBLISHED canvas-wasm, and
    // 0.63.0 (core 08fb4b1) predates the column wave (core 4c1b5d7):
    // its composer still lays every frame out at full inner width, so
    // the gutter this asserts cannot appear no matter what the panel
    // writes. Measured on the pinned engine: 6 px of gutter against the
    // ~22 px a 24 pt gutter should give.
    //
    // Verified green against core's own renderer — the same layout code
    // the canvas will run once it ships — on four InDesign-referenced
    // corpus pages (layout 7-10) plus the pre-existing 2col page, whose
    // mean deltaE halved.
    //
    // UNFIXME when the editor's canvas-wasm pin carries 4c1b5d7. The
    // three exemptions this file's neighbours carried (dirty, itemLayer,
    // directional feather) all came off exactly that way at 0.63.0.
    test.fixme(
      true,
      "column layout ships in the wasm AFTER 0.63.0; the pinned engine cannot render a gutter",
    );
    const setup = await page.evaluate(async () => {
      const dbg = (window as unknown as {
        __canvas?: {
          client?: {
            collection<T>(n: string): Promise<readonly T[]>;
            executeScript(s: string): Promise<{ output: string[]; error: string | null }>;
          };
        };
      }).__canvas;
      const pages = await dbg!.client!.collection<{ selfId: string }>("pages");
      // The frame the tree walk finds first, and its own story — the
      // pair AC-TFO-3 already relies on.
      const treeJson = await dbg!.client!
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
      const walk = (nodes: Node[] | undefined): Node["id"] => {
        if (!nodes) return null;
        for (const nd of nodes) {
          if (nd.id && nd.id.kind === "textFrame") return nd.id;
          const f = walk(nd.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no TextFrame");
      // Enough copy that the frame fills past one column: a frame that
      // never fills one cannot demonstrate a second.
      const filled = await dbg!.client!.executeScript(
        `const s = JSON.parse(paged.stories())[0];` +
          `let t = ''; for (let i = 0; i < 60; i++) { t += 'Column copy line ' + i + '. '; }` +
          `paged.insertText(s.selfId, 0, t);` +
          `console.log('ok');`,
      );
      if (filled.error) throw new Error(`fill failed: ${filled.error}`);
      return { pageId: pages[0]?.selfId ?? null, target };
    });
    expect(setup.pageId, "the fixture must carry a page").toBeTruthy();

    const rect = await elementPageRectPt(page, setup.target as never);
    expect(rect, "the target frame must have page-space bounds").toBeTruthy();

    // `PageSummary.sizePt` is `[width, height]` — the wire's own name,
    // read from the generated types rather than guessed at.
    const pageWidthPt = await page.evaluate(async () => {
      const dbg = (window as unknown as {
        __canvas?: { client?: { collection<T>(n: string): Promise<readonly T[]> } };
      }).__canvas;
      const pages = await dbg!.client!.collection<{ sizePt?: [number, number] }>("pages");
      return pages[0]?.sizePt?.[0] ?? 0;
    });
    expect(pageWidthPt).toBeGreaterThan(0);

    const SNAP_W = 900;
    const scale = SNAP_W / pageWidthPt;

    /** Widest ink-free run of pixel columns inside the frame's rect. */
    const gutterPx = (bytes: Uint8Array): number => {
      const png = PNG.sync.read(Buffer.from(bytes));
      const x0 = Math.max(0, Math.round(rect!.left * scale));
      const x1 = Math.min(png.width, Math.round(rect!.right * scale));
      const y0 = Math.max(0, Math.round(rect!.top * scale));
      const y1 = Math.min(png.height, Math.round(rect!.bottom * scale));
      const inked: boolean[] = [];
      for (let x = x0; x < x1; x++) {
        let any = false;
        for (let y = y0; y < y1 && !any; y++) {
          const i = (y * png.width + x) * 4;
          const lum =
            0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
          if (png.data[i + 3] > 0 && lum < 200) any = true;
        }
        inked.push(any);
      }
      const first = inked.indexOf(true);
      const last = inked.lastIndexOf(true);
      if (first < 0 || last <= first) return 0;
      let best = 0;
      let run = 0;
      for (let i = first; i <= last; i++) {
        run = inked[i] ? 0 : run + 1;
        if (run > best) best = run;
      }
      return best;
    };

    const setColumns = (count: number) =>
      page.evaluate(
        async ({ n, id }: { n: number; id: unknown }) => {
          const dbg = (window as unknown as {
            __canvas?: { client?: { mutate(op: unknown): Promise<unknown> } };
          }).__canvas;
          await dbg!.client!.mutate({
            op: "setElementProperty",
            args: { elementId: id, path: "textFrameColumnGutter", value: { type: "length", value: 24 } },
          });
          await dbg!.client!.mutate({
            op: "setElementProperty",
            args: { elementId: id, path: "textFrameColumnCount", value: { type: "length", value: n } },
          });
        },
        { n: count, id: setup.target },
      );

    // Both readings poll: a single cold sample races the layout cache
    // (the render-poll rule the journey suite learned the hard way).
    await setColumns(1);
    let oneColumn = 0;
    await expect
      .poll(
        async () => {
          oneColumn = gutterPx(await snapshotPagePng(page, setup.pageId!, SNAP_W, 96));
          return oneColumn;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(0);

    // A 24pt gutter at this scale is ~24 * scale px; require most of it
    // so the assertion is about the gutter and not about noise.
    const expected = Math.round(24 * scale * 0.6);
    await expect
      .poll(
        async () => gutterPx(await snapshotPagePng(page, setup.pageId!, SNAP_W, 96)),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(Math.max(oneColumn, expected));
  });
});
