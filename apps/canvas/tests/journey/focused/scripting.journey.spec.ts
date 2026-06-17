// Journey: the paged.* scripting runtime.
//
// A power user drives the document through the script console — reads the
// scene tree, sets a property (which lands as an undoable Operation),
// inspects it, logs to the console, undoes/redoes, and watches a runaway
// loop get cut off by the runtime budget without taking the worker down.
// Plus the two scripting surfaces (script editor + REPL) mount.

import { expect, test } from "@playwright/test";

import { script } from "../../e2e/harness/ui";
import { Designer } from "../driver/designer";

interface ScriptCanvas {
  client: {
    executeScript: (
      s: string,
    ) => Promise<{ output: string[]; error: string | null }>;
  };
  debugContext: () => { panels: { open: string[]; active: string | null } };
}
const exec = (page: import("@playwright/test").Page, src: string) =>
  page.evaluate(
    (s) =>
      (globalThis as unknown as { __canvas: ScriptCanvas }).__canvas.client
        .executeScript(s),
    src,
  );

test.describe("journey · scripting", () => {
  test("read, write, inspect, log, undo/redo, survive a runaway @feat:scripting.property-readwrite @feat:scripting.mutation-parity @feat:scripting.inspection @feat:scripting.collections @feat:scripting.console @feat:scripting.undo-redo @feat:scripting.runtime-budgets @feat:scripting.script-editor @feat:scripting.repl @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const id = await designer.drawRectangle({ x0: 110, y0: 130, x1: 320, y1: 280 });
    const ref = `rectangle:${id}`;

    // COLLECTIONS — paged.tree() dumps the scene; our rectangle is in it.
    const tree = await script(page, "paged.tree();");
    expect(tree.join("\n"), "tree lists the drawn rectangle").toContain(id);

    // PROPERTY-READWRITE + MUTATION-PARITY — set lands as a real edit;
    // INSPECTION — read it back and confirm the model moved.
    const before = (await script(page, `paged.inspect(${JSON.stringify(ref)});`)).join("\n");
    await script(page, `paged.set(${JSON.stringify(ref)}, "frameOpacity", 41);`);
    const after = (await script(page, `paged.inspect(${JSON.stringify(ref)});`)).join("\n");
    expect(after, "scripted paged.set changed the inspected model").not.toBe(before);

    // CONSOLE — console.log lines surface in the script output.
    const logged = await script(page, `console.log("journey-marker", 7 * 6);`);
    expect(logged.some((l) => l.includes("journey-marker") && l.includes("42"))).toBe(true);

    // UNDO/REDO — paged.undo reverts the scripted edit, redo reapplies.
    await script(page, "paged.undo();");
    const undone = (await script(page, `paged.inspect(${JSON.stringify(ref)});`)).join("\n");
    expect(undone, "undo restored the pre-set model").toBe(before);
    await script(page, "paged.redo();");
    const redone = (await script(page, `paged.inspect(${JSON.stringify(ref)});`)).join("\n");
    expect(redone, "redo reapplied the scripted edit").toBe(after);

    // RUNTIME-BUDGETS — a runaway loop returns a script error (the Boa
    // RuntimeLimit), and the worker SURVIVES: a follow-up script still runs.
    const runaway = await exec(page, "let n = 0; while (true) { n = n + 1; } n;");
    expect(runaway.error, "runaway loop is cut off by the runtime budget").toBeTruthy();
    const recovered = await script(page, "2 + 3;");
    expect(recovered.join(""), "worker survived the runaway").toContain("5");

    // SCRIPT-EDITOR + REPL — both scripting surfaces mount as panels.
    for (const pid of ["paged.script-editor", "paged.repl"]) {
      await page.evaluate(
        (id2) =>
          (
            globalThis as unknown as { __canvas: { openPanel?: (i: string) => void } }
          ).__canvas.openPanel?.(id2),
        pid,
      );
    }
    const open = await page.evaluate(() => {
      const p = (globalThis as unknown as { __canvas: ScriptCanvas }).__canvas
        .debugContext().panels;
      return [p.active, ...p.open].filter(Boolean) as string[];
    });
    expect(open, "script editor + REPL panels mounted").toEqual(
      expect.arrayContaining(["paged.script-editor", "paged.repl"]),
    );
  });
});
