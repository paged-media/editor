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

// SDK Phase 5 (v1 sweep) — Object Styles panel acceptance.
//
// Element-scope variant of the style-panel pattern. The bound
// path is `appliedObjectStyle`; the apply arm rewrites the page
// item's `applied_object_style` field.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

test.describe("Phase 5 — Object Styles panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.object-styles");
  });

  test("AC-OSTYLE-1 — panel mounts as a composition with a select @feat:editor-shell.panels.object-styles @feat:styles.object.crud @level:smoke", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-object-styles-panel="ready"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-object-styles-panel="ready"] select[data-collection="objectStyles"]',
      ),
    ).toBeVisible();
  });

  test("AC-OSTYLE-2 — selecting a style writes appliedObjectStyle through the apply layer @feat:editor-shell.panels.object-styles @feat:styles.object.crud @level:happy", async ({
    page,
  }) => {
    const selectedSelfId = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const w = window as unknown as { __canvas?: DebugCanvas };
      const dbg = w.__canvas;
      if (!dbg?.client) {
        throw new Error("__canvas client not available");
      }

      // Pick a TextFrame from the loaded fixture's tree.
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      const tree = JSON.parse(treeJson) as Array<{
        children?: Array<{
          id?: { kind: string; id: string } | null;
          children?: unknown[];
        }>;
      }>;

      // Walk for the first frame with a usable element id.
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const walk = (nodes: Node[] | undefined): Node["id"] => {
        if (!nodes) return null;
        for (const n of nodes) {
          if (
            n.id &&
            (n.id.kind === "textFrame" || n.id.kind === "rectangle")
          ) {
            return n.id;
          }
          const found = walk(n.children);
          if (found) return found;
        }
        return null;
      };
      const target = walk(tree as unknown as Node[]);
      if (!target) throw new Error("fixture has no selectable frame");

      // Drive the element selection via the test affordance.
      dbg.setElementSelection?.([target], "replace");
      await new Promise((r) => setTimeout(r, 50));

      // Pull the object styles list.
      const stylesJson = await dbg.client
        .executeScript("paged.objectStyles()")
        .then((r) => r.output[0] ?? "[]");
      const styles = JSON.parse(stylesJson);
      if (!styles.length) {
        throw new Error(`fixture has no object styles; raw=${stylesJson}`);
      }
      const style = (styles as Array<{ selfId: string }>).find(
        (s) => s.selfId && s.selfId.length > 0,
      );
      if (!style) {
        throw new Error("no object style with non-empty selfId");
      }

      // Address-string for `paged.set` mirrors `parse_element_id` —
      // `<kind>:<rawId>`.
      const addr = `${target.kind}:${target.id}`;
      const setResult = await dbg.client.executeScript(
        `paged.set(${JSON.stringify(addr)},
                   "appliedObjectStyle",
                   ${JSON.stringify(style.selfId)});`,
      );
      if (setResult.error) {
        throw new Error(`paged.set errored: ${setResult.error}`);
      }
      if (setResult.output[0]?.trim() !== "true") {
        throw new Error(
          `paged.set returned ${setResult.output[0]}; addr=${addr}`,
        );
      }
      await new Promise((r) => setTimeout(r, 50));

      // Inspect: appliedObjectStyle on the frame should now carry
      // the selected style's selfId.
      const inspectJson = await dbg.client
        .executeScript(`paged.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{ path: string; value: { value: string } | null }>;
      };
      const entry = inspect.entries.find(
        (e) => e.path === "appliedObjectStyle",
      );
      return entry?.value?.value ?? null;
    });

    expect(selectedSelfId).toBeTruthy();
  });
});
