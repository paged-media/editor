// SDK Phase 5 (v1 sweep) — Attributes panel acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Attributes panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.attributes");
  });

  test("AC-ATTR-1 — panel mounts; em-dash without selection", async ({
    page,
  }) => {
    await expect(page.locator('[data-attributes-panel="ready"]')).toBeVisible();
    // Without a selection every bound control shows the mixed/em-dash
    // placeholder. Protocol v28 (the W2 wave) added the overprint
    // fill/stroke toggles alongside Nonprinting, so this now matches
    // several controls — assert ≥1 is visible via `.first()` rather than
    // a strict single-match `toBeVisible()`.
    const mixed = page.locator('[data-attributes-panel="ready"] [data-mixed]');
    await expect(mixed.first()).toBeVisible();
    expect(await mixed.count()).toBeGreaterThan(0);
  });

  test("AC-ATTR-2 — frameNonprinting toggle round-trips", async ({ page }) => {
    const applied = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: boolean } | null;
            }>;
          } | null>;
          mutate(op: unknown): Promise<unknown>;
        };
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
      if (!target) throw new Error("no TextFrame");
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameNonprinting",
          value: { type: "bool", value: true },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      const props = await dbg.client.elementProperties(target);
      const entry = props?.entries.find((e) => e.path === "frameNonprinting");
      return entry?.value?.value ?? null;
    });

    expect(applied).toBe(true);
  });

  test("AC-ATTR-3 — overprint pair sandwich: set fill+stroke → assert → undo", async ({
    page,
  }) => {
    // W2.3 — the overprint Bool pair. set → assert → undo → restored.
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
              value: { type: string; value: boolean } | null;
            }>;
          } | null>;
          mutate(op: unknown): Promise<unknown>;
          undo(): Promise<unknown>;
        };
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
      if (!target) throw new Error("no TextFrame");

      const read = async (path: string) => {
        const props = await dbg.client!.elementProperties(target);
        return props?.entries.find((e) => e.path === path)?.value?.value ?? null;
      };

      const before = {
        fill: await read("frameOverprintFill"),
        stroke: await read("frameOverprintStroke"),
      };

      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameOverprintFill",
          value: { type: "bool", value: true },
        },
      });
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameOverprintStroke",
          value: { type: "bool", value: true },
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      const after = {
        fill: await read("frameOverprintFill"),
        stroke: await read("frameOverprintStroke"),
      };

      await dbg.client.undo();
      await dbg.client.undo();
      await new Promise((r) => setTimeout(r, 40));
      const restored = {
        fill: await read("frameOverprintFill"),
        stroke: await read("frameOverprintStroke"),
      };

      return { before, after, restored };
    });

    expect(result.after.fill).toBe(true);
    expect(result.after.stroke).toBe(true);
    expect(result.restored).toEqual(result.before);
  });
});
