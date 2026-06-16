// W2.14 Full-Green — editor.script runtime-budget evidence.
//
// The worker evaluates scripts inside a budgeted Boa context (loop +
// recursion limits). A runaway script must NOT abort the worker — it
// returns a clean script error ("runtime budget exceeded") and the
// engine keeps serving the next script + the rest of the UI. This is the
// safety contract that makes the script surface usable for untrusted /
// AI-authored automation.
//
// Routes (test-map editor.script): scripting.runtime-budgets.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const TEXT_FRAME_ID = "ua365e1";

interface CanvasGlobal {
  client: {
    executeScript: (
      source: string,
    ) => Promise<{ output: string[]; error: string | null }>;
    elementProperties: (id: {
      kind: string;
      id: string;
    }) => Promise<{
      entries: { path: string; value: { type: string; value: unknown } }[];
    } | null>;
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

test.describe("editor.script — runtime budgets", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-SCRIPT-BUDGET-1 — a runaway loop returns a budget error, not a hang @feat:scripting.runtime-budgets @level:edge", async ({
    page,
  }) => {
    const r = await run(page, `while (true) {}`);
    expect(r.error).not.toBeNull();
    // The error names the loop limit (the RuntimeLimit surface), so a
    // user can tell a budget trip from a syntax/runtime error.
    expect(r.error!.toLowerCase()).toContain("budget");
  });

  test("AC-SCRIPT-BUDGET-2 — the worker survives a runaway and serves the next script @feat:scripting.runtime-budgets @level:happy", async ({
    page,
  }) => {
    // Trip the budget, then prove the engine is still alive: a trivial
    // script after the runaway runs cleanly and produces output.
    const runaway = await run(page, `for (;;) { Math.sqrt(2); }`);
    expect(runaway.error).not.toBeNull();

    const alive = await run(page, `console.log("still-alive");`);
    expect(alive.error).toBeNull();
    expect(alive.output.some((l) => l.includes("still-alive"))).toBe(true);
  });

  test("AC-SCRIPT-BUDGET-3 — a budget-tripped script leaves the document untouched @feat:scripting.runtime-budgets @level:happy", async ({
    page,
  }) => {
    // A scripted edit BEFORE the runaway commits; the runaway itself
    // produces no further mutation. Read the committed value back from
    // the wire and confirm the runaway didn't corrupt model state.
    await run(
      page,
      `paged.set("textFrame:${TEXT_FRAME_ID}", "frameOpacity", 55);`,
    );
    const runaway = await run(page, `while (true) { 1 + 1; }`);
    expect(runaway.error).not.toBeNull();

    const props = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal })
          .__canvas;
        return c.client.elementProperties({ kind: "textFrame", id });
      },
      { id: TEXT_FRAME_ID },
    );
    const opacity = props!.entries.find((e) => e.path === "frameOpacity")!.value
      .value;
    expect(opacity).toBe(55);
  });
});
