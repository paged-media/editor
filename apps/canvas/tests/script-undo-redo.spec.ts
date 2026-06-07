// W2.14 Full-Green — editor.script undo/redo evidence.
//
// Every paged.* write lands as a Mutation on the same Operation channel
// as gestures and panels, so paged.undo() / paged.redo() drive the very
// same undo stack the rest of the editor shares. This spec proves the
// full round-trip end-to-end through the engine: a scripted edit changes
// real model state, paged.undo() restores it, paged.redo() re-applies it
// — read back via the wire (elementProperties), not a script echo.
//
// Routes (test-map editor.script): scripting.undo-redo,
// round-tripping.undo-redo.

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

async function run(page: Page, source: string): Promise<void> {
  const r = await page.evaluate(
    async ({ source }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.executeScript(source);
    },
    { source },
  );
  if (r.error) throw new Error(`paged script error: ${r.error}`);
}

/** Read frameOpacity from the WIRE (not the script) so the assertion
 *  measures real model state independent of the surface that wrote it. */
async function opacity(page: Page, id: string): Promise<unknown> {
  const props = await page.evaluate(
    async ({ id }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.elementProperties({ kind: "textFrame", id });
    },
    { id },
  );
  if (!props) throw new Error("no props");
  return props.entries.find((e) => e.path === "frameOpacity")!.value.value;
}

test.describe("editor.script — undo/redo", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-SCRIPT-UNDO-1 — paged.undo() then paged.redo() round-trips a scripted edit", async ({
    page,
  }) => {
    const baseline = await opacity(page, TEXT_FRAME_ID);

    await run(
      page,
      `paged.set("textFrame:${TEXT_FRAME_ID}", "frameOpacity", 44);`,
    );
    expect(await opacity(page, TEXT_FRAME_ID)).toBe(44);

    await run(page, `paged.undo();`);
    expect(
      await opacity(page, TEXT_FRAME_ID),
      "paged.undo() did not restore the baseline",
    ).toEqual(baseline);

    await run(page, `paged.redo();`);
    expect(
      await opacity(page, TEXT_FRAME_ID),
      "paged.redo() did not re-apply the scripted edit",
    ).toBe(44);
  });

  test("AC-SCRIPT-UNDO-2 — paged.redo() is a no-op with nothing to redo (returns without error)", async ({
    page,
  }) => {
    // A fresh document has an empty redo stack — redo must be a safe
    // no-op, not a throw (the budgets/error contract: scripts that hit a
    // benign edge return cleanly).
    const r = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.executeScript("console.log(String(paged.redo()))");
    });
    expect(r.error).toBeNull();
    // paged.redo() reports false when there was nothing to redo.
    expect(r.output[0]).toContain("false");
  });

  test("AC-SCRIPT-UNDO-3 — undo unwinds multiple scripted edits LIFO", async ({
    page,
  }) => {
    const baseline = await opacity(page, TEXT_FRAME_ID);
    await run(
      page,
      `paged.set("textFrame:${TEXT_FRAME_ID}", "frameOpacity", 10);`,
    );
    await run(
      page,
      `paged.set("textFrame:${TEXT_FRAME_ID}", "frameOpacity", 90);`,
    );
    expect(await opacity(page, TEXT_FRAME_ID)).toBe(90);
    await run(page, `paged.undo();`); // back to 10
    expect(await opacity(page, TEXT_FRAME_ID)).toBe(10);
    await run(page, `paged.undo();`); // back to baseline
    expect(await opacity(page, TEXT_FRAME_ID)).toEqual(baseline);
  });
});
