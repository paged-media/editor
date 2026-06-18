// Journey: the paged.web plugin — embedding an HTML/CSS snippet as
// placed content.
//
// A designer reaches for "Insert web frame", drops an HTML snippet into
// the source panel, watches the sandboxed preview render it, and commits
// it to the document — then proves the source survived a panel close/
// reopen (the metadata round-trip). This is the V0 SOURCE LANE: the
// bundle's contributions (insert command → source panel → diagnostics →
// preview → persistence) drive through the real editor host (loadBundle →
// contributeCommand/Panel → host facades → Mutation), end to end. It
// mirrors the proven e2e web-plugin.spec.ts driving, here on a blank
// File ▸ New document instead of a loaded fixture.
//
// Per-step COLLECT-FAILURES: the insert + selection are HARD assertions
// (they gate the test — the e2e proves them green); the preview-tracks
// and persistence steps collect so one run reveals which contributions
// drove. On-canvas Blitz rendering is OUT of scope here — the source/
// insert/preview/persist workflow is the target.

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";

const PANEL_ID = "media.paged.web.panel.source";
const INSERT_COMMAND = "media.paged.web.command.insertWebFrame";

/** Count scene-tree nodes of one wire kind through the worker client
 *  (the same query web-plugin.spec.ts uses to prove insertFrame fired). */
async function countKind(page: Page, kind: string): Promise<number> {
  return page.evaluate(async (k) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string } | null;
      children?: unknown[];
    }>;
    let n = 0;
    const visit = (node: {
      id?: { kind: string } | null;
      children?: unknown[];
    }) => {
      if (node.id && node.id.kind === k) n += 1;
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return n;
  }, kind);
}

/** Invoke a command through the real registry (the stable surface a
 *  shortcut/menu hits) — the exact mechanism web-plugin.spec.ts uses. */
async function invokeCommand(page: Page, id: string): Promise<void> {
  await page.evaluate(async (commandId) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (id: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas;
    await c.registries.commands.invoke(commandId);
  }, id);
}

/** Hide a panel via the HOST-derived hide command (B-15:
 *  `paged.panel.hide.<panelId>`, not bundle-registered). */
async function hidePanel(page: Page, id: string): Promise<void> {
  await page.evaluate((pid) => {
    (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (i: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas.registries.commands.invoke(`paged.panel.hide.${pid}`);
  }, id);
}

test.describe("journey · paged.web plugin", () => {
  test("a designer embeds an HTML snippet: insert a web frame, edit the source, watch the sandboxed preview, and persist across reopen @feat:plugin-web.insert-command @feat:plugin-web.source-panel @feat:plugin-web.metadata-persistence @feat:plugin-platform.document-metadata @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const failures: string[] = [];

    // ── 1. INSERT — invoke the bundle's "Insert web frame" command. It
    //    fires one undoable insertFrame + attaches default source +
    //    selects the frame + opens the source panel (AC-WEB-1). The wire
    //    kind is engine-internal (textFrame or rectangle), so assert that
    //    exactly one of them grew by one (HARD — gates the test). ──
    const beforeText = await countKind(page, "textFrame");
    const beforeRect = await countKind(page, "rectangle");
    await invokeCommand(page, INSERT_COMMAND);

    await expect
      .poll(
        async () =>
          (await countKind(page, "textFrame")) +
          (await countKind(page, "rectangle")),
        { timeout: 6_000 },
      )
      .toBe(beforeText + beforeRect + 1);

    // The source panel opened on the freshly-selected frame, carrying the
    // default source — the W-04 host CodeEditor widget, whose textarea is
    // the inner `[data-code-input]` (HARD — proves the panel mounted on
    // selection, the plugin-bundles surface).
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 6_000 });
    await expect(html).toHaveValue(/Web frame/);

    // ── 2. EDIT + PREVIEW — drop a snippet into the HTML editor; the
    //    SANDBOXED iframe (sandbox="", page JS never executes — §6.1) must
    //    render the markup. Best-effort: collect so a partial drive shows. ──
    const snippet = "<h1>Spring line sheet</h1>";
    await html.fill(snippet);
    const preview = page.frameLocator("[data-web-preview]");
    try {
      await expect(preview.locator("h1")).toHaveText("Spring line sheet", {
        timeout: 6_000,
      });
    } catch {
      failures.push("preview: sandboxed iframe did not render the <h1> snippet");
    }

    // Style it through the CSS lane — the second source channel of the
    // envelope — and confirm the editor accepted it (best-effort).
    const css = page.locator("[data-web-css] [data-code-input]");
    try {
      await expect(css).toBeVisible({ timeout: 6_000 });
      await css.fill("h1 { color: rebeccapurple; }");
      await expect(css).toHaveValue(/rebeccapurple/);
    } catch {
      failures.push("css lane: editor not visible or value not accepted");
    }

    // ── 3. PERSIST — preview ≠ persistence: keystrokes only refresh the
    //    sandboxed preview behind the debounce; the document is written
    //    ONLY by the explicit "Save to document" action (one undoable
    //    metadata mutation — persistDraft). So COMMIT first, then close +
    //    reopen the panel; the metadata-backed source of truth re-reads,
    //    so BOTH lanes survive the round-trip (AC-WEB-2; best-effort). ──
    const save = page.locator("[data-web-commit]");
    try {
      // The editors are dirty after the edits → the save button enables.
      await expect(save).toBeEnabled({ timeout: 6_000 });
      await save.click();
      // The dirty flag clears once the metadata mutation applied.
      await expect(page.locator("[data-web-dirty]")).toHaveAttribute(
        "data-web-dirty",
        "false",
        { timeout: 6_000 },
      );
    } catch {
      failures.push("save: 'Save to document' did not commit the draft");
    }

    await hidePanel(page, PANEL_ID);
    try {
      await expect(html).toBeHidden({ timeout: 6_000 });
      await openPanel(page, PANEL_ID);
      await expect(
        page.locator("[data-web-html] [data-code-input]"),
      ).toHaveValue(snippet, { timeout: 6_000 });
      await expect(
        page.locator("[data-web-css] [data-code-input]"),
      ).toHaveValue(/rebeccapurple/, { timeout: 6_000 });
    } catch {
      failures.push(
        "persistence: source did not survive the panel close/reopen round-trip",
      );
    }

    // One run, all the source-lane contributions reported. The insert,
    // selection, and panel-mount above are HARD assertions; the preview +
    // persistence steps collect so a partial drive is visible.
    expect(
      failures,
      `paged.web source-lane steps that did not drive: ${failures.join("; ")}`,
    ).toEqual([]);
  });
});
