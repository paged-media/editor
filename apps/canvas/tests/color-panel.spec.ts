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

// SDK Phase 5 (v1 sweep) — Color panel acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

test.describe("Phase 5 — Color panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.color");
  });

  test("AC-COLOR-1 — panel mounts as a composition with fill picker + tint scrub @feat:editor-shell.panels.color @level:smoke", async ({
    page,
  }) => {
    await expect(page.locator('[data-color-panel="ready"]')).toBeVisible();
    await expect(
      page.locator(
        '[data-color-panel="ready"] select[data-collection="swatches"][data-value-type="colorRef"]',
      ),
    ).toBeVisible();
  });

  test("AC-COLOR-3 — fill swatch surfaces a CMYK/RGB readout @feat:editor-shell.panels.color @level:happy", async ({
    page,
  }) => {
    // Select a frame whose fill resolves to a non-Paper swatch
    // — the fixture's TextFrames carry "Color/Black" or similar.
    const ok = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          mutate(op: unknown): Promise<unknown>;
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
      if (!target) return false;
      // Force a known fill (Color/Black is in every IDML).
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameFillColor",
          value: { type: "colorRef", value: "Color/Black" },
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      dbg.setElementSelection?.([target], "replace");
      await new Promise((r) => setTimeout(r, 150));
      return true;
    });
    if (!ok) {
      test.skip(true, "fixture has no TextFrame");
      return;
    }
    await expect(
      page.locator('[data-color-panel="ready"] [data-color-preview]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-color-panel="ready"] [data-color-rgb]'),
    ).toBeVisible();
  });

  test("AC-COLOR-2 — frameFillTint round-trips via the apply layer @feat:editor-shell.panels.color @level:happy", async ({
    page,
  }) => {
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
              value: { type: string; value: number | null } | null;
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
          path: "frameFillTint",
          value: { type: "length", value: 42 },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      const props = await dbg.client.elementProperties(target);
      const entry = props?.entries.find((e) => e.path === "frameFillTint");
      return entry?.value?.value ?? null;
    });

    expect(applied).toBe(42);
  });

  test("AC-COLOR-4 — no-selection Apply writes the document-default fill (W2.5) @feat:editor-shell.panels.color @level:happy", async ({
    page,
  }) => {
    // W2.5 — with nothing selected the Color panel routes the applied
    // colour to the document default via `setDocumentDefaults`; the
    // panel reads it back off `documentMeta()`. Drive the mechanism
    // directly: write a known swatch as the default and assert the meta
    // reflects it.
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          collection<T>(name: string): Promise<T[]>;
          documentMeta(): Promise<{ defaultFillColor?: string | null }>;
          mutate(op: unknown): Promise<unknown>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");

      // Pick an existing swatch from the document.
      const swatches = await dbg.client.collection<{ selfId: string }>(
        "swatches",
      );
      const swatch = swatches.find((s) => s.selfId && s.selfId !== "Swatch/None");
      if (!swatch) throw new Error("no usable swatch in fixture");

      const before = (await dbg.client.documentMeta()).defaultFillColor ?? null;

      await dbg.client.mutate({
        op: "setDocumentDefaults",
        args: {
          fillColor: swatch.selfId,
          strokeColor: null,
          strokeWeight: null,
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      const after = (await dbg.client.documentMeta()).defaultFillColor ?? null;

      return { before, after, expected: swatch.selfId };
    });

    expect(result.after).toBe(result.expected);
    expect(result.after).not.toBe(result.before);
  });
});
