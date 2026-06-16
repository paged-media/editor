// SDK Phase 5 (v1 sweep) — Text Wrap panel acceptance.
//
// Two rows backed by the shared `Option<TextWrap>` field. AC-TW-1
// pins the mount + the toggle-group writes. AC-TW-2 pins the
// bounds writes preserving the mode.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Text Wrap panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.text-wrap");
  });

  test("AC-TW-1 — panel mounts as a composition with a toggle-group + bounds row @feat:editor-shell.panels.text-wrap @level:smoke", async ({
    page,
  }) => {
    await expect(page.locator('[data-text-wrap-panel="ready"]')).toBeVisible();
  });

  test("AC-TW-2 — mode + offsets round-trip; partial commit preserves the unset half @feat:editor-shell.panels.text-wrap @level:happy", async ({
    page,
  }) => {
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
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");

      // First TextFrame from the tree.
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

      // 1. Set mode → ContourTextWrap.
      const setMode = await dbg.client.executeScript(
        `paged.set(${JSON.stringify(addr)}, "frameTextWrapMode", "ContourTextWrap");`,
      );
      if (setMode.error || setMode.output[0]?.trim() !== "true") {
        throw new Error(
          `mode set failed: ${setMode.error ?? setMode.output[0]}`,
        );
      }
      await new Promise((r) => setTimeout(r, 30));

      // 2. Set offsets → [8, 8, 8, 8]. Mode must stay ContourTextWrap.
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameTextWrapOffsets",
          value: { type: "bounds", value: [8, 8, 8, 8] },
        },
      });
      await new Promise((r) => setTimeout(r, 30));

      // 3. Inspect — both entries reflect the merged state.
      const inspectJson = await dbg.client
        .executeScript(`paged.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{
          path: string;
          value: { type: string; value: unknown } | null;
        }>;
      };
      const mode = inspect.entries.find((e) => e.path === "frameTextWrapMode");
      const offsets = inspect.entries.find(
        (e) => e.path === "frameTextWrapOffsets",
      );
      return {
        mode: mode?.value?.value ?? null,
        offsets: offsets?.value?.value ?? null,
      };
    });

    expect(result.mode).toBe("ContourTextWrap");
    expect(result.offsets).toEqual([8, 8, 8, 8]);
  });

  test("AC-TW-3 — invert sandwich: set true (preserving mode) → assert → undo @feat:editor-shell.panels.text-wrap @level:happy", async ({
    page,
  }) => {
    // W2.3 — `textWrapInvert` shares the Option<TextWrap> field with
    // mode/offsets; the apply arm preserves the other members.
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

      // Establish a known mode so invert's mode-preservation is
      // observable.
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameTextWrapMode",
          value: { type: "text", value: "BoundingBoxTextWrap" },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      const invertBefore = await read("textWrapInvert");

      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "textWrapInvert",
          value: { type: "bool", value: true },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      const after = {
        invert: await read("textWrapInvert"),
        mode: await read("frameTextWrapMode"),
      };

      await dbg.client.undo();
      await new Promise((r) => setTimeout(r, 30));
      const restoredInvert = await read("textWrapInvert");

      return { invertBefore, after, restoredInvert };
    });

    expect(result.after.invert).toBe(true);
    // Invert preserves the wrap mode.
    expect(result.after.mode).toBe("BoundingBoxTextWrap");
    expect(result.restoredInvert).toBe(result.invertBefore);
  });

  test("AC-TW-4 — contour options sandwich: set contour type + include-inside (preserving mode) → assert → undo @feat:editor-shell.panels.text-wrap @level:gesture", async ({
    page,
  }) => {
    // W2.4 — `frameTextWrapContourType` (Text enum) +
    // `frameTextWrapContourIncludeInside` (Bool) share the
    // Option<TextWrap> field; the apply arms preserve mode/offsets.
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

      // Establish ContourTextWrap so the contour options are meaningful.
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameTextWrapMode",
          value: { type: "text", value: "ContourTextWrap" },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      const contourBefore = await read("frameTextWrapContourType");

      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameTextWrapContourType",
          value: { type: "text", value: "DetectEdges" },
        },
      });
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameTextWrapContourIncludeInside",
          value: { type: "bool", value: true },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      const after = {
        contour: await read("frameTextWrapContourType"),
        includeInside: await read("frameTextWrapContourIncludeInside"),
        mode: await read("frameTextWrapMode"),
      };

      // Undo the include-inside write → restores the prior value; the
      // contour type + mode persist.
      await dbg.client.undo();
      await new Promise((r) => setTimeout(r, 30));
      const afterUndo = {
        contour: await read("frameTextWrapContourType"),
        mode: await read("frameTextWrapMode"),
      };

      return { contourBefore, after, afterUndo };
    });

    expect(result.after.contour).toBe("DetectEdges");
    expect(result.after.includeInside).toBe(true);
    // Contour options preserve the wrap mode.
    expect(result.after.mode).toBe("ContourTextWrap");
    // Undo of include-inside keeps the contour type + mode.
    expect(result.afterUndo.contour).toBe("DetectEdges");
    expect(result.afterUndo.mode).toBe("ContourTextWrap");
  });
});
