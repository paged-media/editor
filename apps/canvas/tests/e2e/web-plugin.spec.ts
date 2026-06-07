// E2E — paged.web v0 (the source lane) through the real editor.
// The bundle arrives via loadBundle in main.tsx; this suite drives
// the user path: invoke "Insert web frame" (one undoable insertFrame
// + default source attached + selection + the source panel opens),
// edit HTML in the panel, watch the sandboxed preview track it,
// check the policy diagnostics, and undo.
//
// Coverage:
//   AC-WEB-1  insert command creates a frame, selects it, opens the
//             panel with the default source; undo removes the frame
//   AC-WEB-2  editing HTML updates the sandboxed preview (srcdoc)
//             and persists through a panel close/reopen
//   AC-WEB-3  <script> in the source surfaces the policy ERROR in
//             the diagnostics list; removing it clears the list

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

const PANEL_ID = "media.paged.web.panel.source";
const INSERT_COMMAND = "media.paged.web.command.insertWebFrame";

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

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas.client.undo();
  });
}

test.describe("E2E web-plugin (paged.web source lane)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (globalThis as unknown as { __canvas: { ready: boolean } })
                .__canvas.ready,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
  });

  test("AC-WEB-1 — insert web frame: one undoable frame, selected, panel open with default source", async ({
    page,
  }) => {
    const before = await countKind(page, "textFrame");
    const beforeRect = await countKind(page, "rectangle");
    await invokeCommand(page, INSERT_COMMAND);

    // One new frame (insertFrame creates a frame element; accept
    // either wire kind, but exactly one of them grew).
    await expect
      .poll(
        async () =>
          (await countKind(page, "textFrame")) +
          (await countKind(page, "rectangle")),
        { timeout: 5_000 },
      )
      .toBe(before + beforeRect + 1);

    // The source panel opened, showing the default source for the
    // (selected) new frame. W-04: the HTML lane is the host CodeEditor
    // widget — its textarea is the inner `[data-code-input]`.
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 5_000 });
    await expect(html).toHaveValue(/Web frame/);

    await undo(page);
    await expect
      .poll(
        async () =>
          (await countKind(page, "textFrame")) +
          (await countKind(page, "rectangle")),
      )
      .toBe(before + beforeRect);
  });

  test("AC-WEB-2 — editing HTML updates the sandboxed preview and persists across reopen", async ({
    page,
  }) => {
    await invokeCommand(page, INSERT_COMMAND);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 5_000 });

    await html.fill("<h1>Price list</h1>");
    // The preview is a SANDBOXED iframe rendering the composed
    // srcdoc — page JavaScript never executes (§6.1), but markup
    // renders.
    const preview = page.frameLocator("[data-web-preview]");
    await expect(preview.locator("h1")).toHaveText("Price list", {
      timeout: 5_000,
    });

    // Persistence: wait out the save debounce, close + reopen the
    // panel, the edit survives (storage-backed source of truth).
    await page.waitForTimeout(500);
    // B-15: the hide command is HOST-derived from the registry
    // (`paged.panel.hide.<panelId>`), not bundle-registered.
    await page.evaluate((id) => {
      (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (i: string) => Promise<unknown> } } };
        }
      ).__canvas.registries.commands.invoke(`paged.panel.hide.${id}`);
    }, PANEL_ID);
    await expect(html).toBeHidden({ timeout: 5_000 });
    await openPanel(page, PANEL_ID);
    await expect(
      page.locator("[data-web-html] [data-code-input]"),
    ).toHaveValue("<h1>Price list</h1>", { timeout: 5_000 });
  });

  test("AC-WEB-3 — <script> surfaces the policy error; removing it clears diagnostics", async ({
    page,
  }) => {
    await invokeCommand(page, INSERT_COMMAND);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 5_000 });

    await html.fill("<p>ok</p>\n<script>alert(1)</script>");
    const diagnostics = page.locator("[data-web-diagnostics]");
    await expect(diagnostics).toContainText("never executes", {
      timeout: 5_000,
    });

    await html.fill("<p>ok</p>");
    // The POLICY error must clear. The diagnostics list itself may stay
    // visible: W3.12 font-parity diagnostics legitimately persist for any
    // source whose CSS names a font family (the substitution-badge
    // contract) — asserting toBeHidden() became over-broad once font
    // parity landed.
    await expect(diagnostics).not.toContainText("never executes", {
      timeout: 5_000,
    });
  });

  test("AC-WEB-4 — the host codeEditor widget renders: line numbers, highlighting, gutter markers", async ({
    page,
  }) => {
    await invokeCommand(page, INSERT_COMMAND);
    const editor = page.locator("[data-web-html] [data-code-editor]");
    await expect(editor).toBeVisible({ timeout: 5_000 });

    // Line numbers: the default source spans 2 lines → the gutter
    // renders 1 and 2.
    const lineGutter = editor.locator("[data-code-gutter-lines]");
    await expect(lineGutter).toContainText("1");
    await expect(lineGutter).toContainText("2");

    // Syntax highlighting: the underlay tokenizes tags into spans.
    await expect(
      editor.locator("[data-code-underlay] .code-tag").first(),
    ).toBeVisible();

    // Diagnostics gutter markers: a <script> lights an error dot on
    // the offending line.
    const html = page.locator("[data-web-html] [data-code-input]");
    await html.fill("<p>ok</p>\n<script>x</script>");
    await expect(
      editor.locator('[data-code-gutter-marks] [data-code-mark="error"]'),
    ).toHaveCount(1, { timeout: 5_000 });
    // …and an inline squiggle on that line.
    await expect(
      editor.locator("[data-code-underlay] .code-squiggle"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("AC-WEB-5 — the Problems panel lists a published diagnostic and click focuses the source panel", async ({
    page,
  }) => {
    await invokeCommand(page, INSERT_COMMAND);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 5_000 });

    // Publish a policy error through host.diagnostics (the panel's
    // debounced commit fans out to the host Problems store) — wait out
    // the 300ms save debounce so the diagnostic is published.
    await html.fill("<p>ok</p>\n<script>boom()</script>");
    await page.waitForTimeout(500);

    // Open the host Problems panel — it consumes host.diagnostics from
    // every loaded bundle, not just the plugin's own inline list.
    await openPanel(page, "paged.problems");
    const problems = page.locator("[data-problems-panel]");
    await expect(problems).toBeVisible({ timeout: 5_000 });
    const problem = problems.locator(
      '[data-problem][data-problem-bundle="media.paged.web"]',
    );
    await expect(problem.first()).toContainText("never executes", {
      timeout: 5_000,
    });

    // Hide the source panel, then click the problem — click-to-focus
    // reopens the owning bundle's panel.
    await page.evaluate((id) => {
      (
        globalThis as unknown as {
          __canvas: {
            registries: { commands: { invoke: (i: string) => Promise<unknown> } };
          };
        }
      ).__canvas.registries.commands.invoke(`paged.panel.hide.${id}`);
    }, PANEL_ID);
    await expect(html).toBeHidden({ timeout: 5_000 });

    await problem.first().click();
    await expect(html).toBeVisible({ timeout: 5_000 });
  });

  // W-06 — the asset-store door is WIRED in the editor (main.tsx injects
  // createEditorAssetSource → `host.assets.getFontFace` + the capability
  // gate + the budget are LIVE, and `supports("assets.fonts@1")` is
  // true), but the editor's v1 provider serves NULL: document face bytes
  // are not reachable on the main thread (DESIGN.md §13.4 — the engine
  // has no font-bytes read-back yet). So the preview stays HONEST — the
  // substitution badge shows in its `substituting` state and NEVER flips
  // to "document fonts shown". This is the honest null-path spec the
  // task calls for (the real-bytes path is unreachable today).
  test("AC-WEB-6 — asset door is wired but serves null: the font badge stays HONEST (never flips to 'shown')", async ({
    page,
  }) => {
    await invokeCommand(page, INSERT_COMMAND);
    const css = page.locator("[data-web-css] [data-code-input]");
    await expect(css).toBeVisible({ timeout: 5_000 });

    // Use a family name in the CSS so the substitution badge appears.
    // (The door + gate are LIVE — main.tsx injects the asset source, so
    // the bundle's `supports("assets.fonts@1")` is true and the gate
    // passes — but the v1 provider serves null, which the badge proves
    // below: it never flips to "shown".)
    await css.fill('p { font-family: "Helvetica Neue", sans-serif; }');

    const badge = page.locator("[data-web-font-badge]");
    await expect(badge).toBeVisible({ timeout: 5_000 });
    // HONEST: substituting, NEVER the W-06 "shown" flip (no bytes served).
    await expect(badge).toHaveAttribute("data-badge-state", "substituting", {
      timeout: 5_000,
    });
    await expect(badge).toContainText("substituted in preview");

    // And the sandboxed preview carries NO injected `@font-face`
    // (no object-URL face was composed — the null-path proof). The
    // iframe keeps sandbox="" regardless.
    const previewHandle = page.locator("[data-web-preview]");
    await expect(previewHandle).toHaveAttribute("sandbox", "");
    const srcdoc = await previewHandle.getAttribute("srcdoc");
    expect(srcdoc ?? "").not.toContain("@font-face");
    expect(srcdoc ?? "").not.toContain("blob:");
  });
});
