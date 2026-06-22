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

// SDK Phase 5 (v1 sweep) — Frame Fitting panel acceptance.
//
// Rectangle-only. Mode + crops both round-trip via the apply
// layer; partial commits preserve the other half (mirrors the
// Text Wrap pattern with `Option<FrameFittingOption>`).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/images.idml`;

test.describe("Phase 5 — Frame Fitting panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.frame-fitting");
  });

  test("AC-FF-1 — panel mounts @feat:editor-shell.panels.frame-fitting @feat:images-graphics.frame-fitting @level:smoke", async ({ page }) => {
    await expect(
      page.locator('[data-frame-fitting-panel="ready"]'),
    ).toBeVisible();
  });

  test("AC-FF-2 — type + crops round-trip; partial commits preserve the other half @feat:editor-shell.panels.frame-fitting @feat:images-graphics.frame-fitting @level:gesture", async ({
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

      // Find the first Rectangle in the tree (the images fixture
      // ships several placed-image rectangles).
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
          if (n.id && n.id.kind === "rectangle") return n.id;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no Rectangle");
      const addr = `${target.kind}:${target.id}`;

      // 1. Set fitting type → "Proportionally".
      const setType = await dbg.client.executeScript(
        `paged.set(${JSON.stringify(addr)}, "frameFittingType", "Proportionally");`,
      );
      if (setType.error || setType.output[0]?.trim() !== "true") {
        throw new Error(
          `type set failed: ${setType.error ?? setType.output[0]}`,
        );
      }
      await new Promise((r) => setTimeout(r, 30));

      // 2. Set crops → [4, 8, 12, 16]. Type must stay
      //    "Proportionally".
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameFittingCrops",
          value: { type: "bounds", value: [4, 8, 12, 16] },
        },
      });
      await new Promise((r) => setTimeout(r, 30));

      const inspectJson = await dbg.client
        .executeScript(`paged.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{
          path: string;
          value: { type: string; value: unknown } | null;
        }>;
      };
      const fittingType = inspect.entries.find(
        (e) => e.path === "frameFittingType",
      );
      const crops = inspect.entries.find((e) => e.path === "frameFittingCrops");
      return {
        type: fittingType?.value?.value ?? null,
        crops: crops?.value?.value ?? null,
      };
    });

    expect(result.type).toBe("Proportionally");
    expect(result.crops).toEqual([4, 8, 12, 16]);
  });

  test("AC-FF-3 — reference-point + auto-fit sandwich: set → assert → undo @feat:editor-shell.panels.frame-fitting @feat:images-graphics.frame-fitting @level:happy", async ({
    page,
  }) => {
    // W2.3 — Rectangle-only. `frameFittingReferencePoint` is the raw
    // IDML anchor string (CenterPoint); `frameAutoFit` is Bool. set
    // → assert → undo → restored.
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
          if (n.id && n.id.kind === "rectangle") return n.id;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no Rectangle");

      const read = async (path: string) => {
        const props = await dbg.client!.elementProperties(target);
        return props?.entries.find((e) => e.path === path)?.value?.value ?? null;
      };

      const before = {
        ref: await read("frameFittingReferencePoint"),
        autoFit: await read("frameAutoFit"),
      };

      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameFittingReferencePoint",
          value: { type: "text", value: "CenterPoint" },
        },
      });
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameAutoFit",
          value: { type: "bool", value: true },
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      const after = {
        ref: await read("frameFittingReferencePoint"),
        autoFit: await read("frameAutoFit"),
      };

      await dbg.client.undo();
      await dbg.client.undo();
      await new Promise((r) => setTimeout(r, 40));
      const restored = {
        ref: await read("frameFittingReferencePoint"),
        autoFit: await read("frameAutoFit"),
      };

      return { before, after, restored };
    });

    expect(result.after.ref).toBe("CenterPoint");
    expect(result.after.autoFit).toBe(true);
    expect(result.restored).toEqual(result.before);
  });

  test("AC-FF-4 — fill-proportionally writes frameFittingType; round-trips @feat:editor-shell.panels.frame-fitting @feat:images-graphics.frame-fitting @level:happy", async ({
    page,
  }) => {
    // W2.4 — the "Fill frame proportionally" action writes the real
    // `frameFittingType` enum (no new op, no client-side scale hack).
    // set → assert → undo → restored.
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
          if (n.id && n.id.kind === "rectangle") return n.id;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no Rectangle");

      const read = async () => {
        const props = await dbg.client!.elementProperties(target);
        return (
          props?.entries.find((e) => e.path === "frameFittingType")?.value
            ?.value ?? null
        );
      };

      const before = await read();
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: target,
          path: "frameFittingType",
          value: { type: "text", value: "FillProportionally" },
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      const after = await read();

      await dbg.client.undo();
      await new Promise((r) => setTimeout(r, 40));
      const restored = await read();

      return { before, after, restored };
    });

    expect(result.after).toBe("FillProportionally");
    expect(result.restored).toBe(result.before);
  });
});
