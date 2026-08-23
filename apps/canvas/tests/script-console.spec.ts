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

// W2.14 Full-Green — editor.script console capture evidence.
//
// The embedded Boa engine installs a console shim whose log/warn/error/
// info calls are captured per-execution and returned in
// scriptResult.output (the Script editor panel renders those lines).
// This is the script's only stdout, so the capture must be faithful:
// every level surfaces, ordering is preserved, and multiple args join.
//
// Routes (test-map editor.script): scripting.console.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

interface CanvasGlobal {
  client: {
    executeScript: (
      source: string,
    ) => Promise<{ output: string[]; error: string | null }>;
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

test.describe("editor.script — console capture", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-SCRIPT-CONSOLE-1 — console.log captures all four levels in order @feat:scripting.console @level:happy", async ({
    page,
  }) => {
    const r = await run(
      page,
      `
        console.log("a-log");
        console.warn("b-warn");
        console.error("c-error");
        console.info("d-info");
      `,
    );
    expect(r.error).toBeNull();
    expect(r.output).toHaveLength(4);
    // Order preserved, each level tagged.
    expect(r.output[0]).toContain("a-log");
    expect(r.output[1]).toContain("b-warn");
    expect(r.output[2]).toContain("c-error");
    expect(r.output[3]).toContain("d-info");
    // The level is distinguishable in the captured line (the panel
    // colours errors) — warn/error/info carry their tag.
    expect(r.output[1].toLowerCase()).toContain("warn");
    expect(r.output[2].toLowerCase()).toContain("error");
    expect(r.output[3].toLowerCase()).toContain("info");
  });

  test("AC-SCRIPT-CONSOLE-2 — console.log joins multiple args and stringifies values @feat:scripting.console @level:happy", async ({
    page,
  }) => {
    const r = await run(page, `console.log("count", 3, true, { k: "v" });`);
    expect(r.error).toBeNull();
    expect(r.output).toHaveLength(1);
    const line = r.output[0];
    expect(line).toContain("count");
    expect(line).toContain("3");
    expect(line).toContain("true");
  });

  test("AC-SCRIPT-CONSOLE-3 — a script whose completion value is undefined yields no output @feat:scripting.console @level:happy", async ({
    page,
  }) => {
    // The host echoes a non-undefined completion value (REPL-style), so
    // "no output" requires the script to complete to undefined — a bare
    // declaration does. This pins the capture contract: output carries
    // ONLY console.* lines + a meaningful completion value, nothing else.
    const r = await run(page, `const x = 1 + 1; void x;`);
    expect(r.error).toBeNull();
    expect(r.output).toEqual([]);
  });
});
