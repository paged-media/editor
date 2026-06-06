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
    // (selected) new frame.
    const html = page.locator("[data-web-html]");
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
    const html = page.locator("[data-web-html]");
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
    await page.evaluate((id) => {
      (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (i: string) => Promise<unknown> } } };
        }
      ).__canvas.registries.commands.invoke(`${id}.hide`);
    }, PANEL_ID);
    await expect(html).toBeHidden({ timeout: 5_000 });
    await openPanel(page, PANEL_ID);
    await expect(page.locator("[data-web-html]")).toHaveValue(
      "<h1>Price list</h1>",
      { timeout: 5_000 },
    );
  });

  test("AC-WEB-3 — <script> surfaces the policy error; removing it clears diagnostics", async ({
    page,
  }) => {
    await invokeCommand(page, INSERT_COMMAND);
    const html = page.locator("[data-web-html]");
    await expect(html).toBeVisible({ timeout: 5_000 });

    await html.fill("<p>ok</p>\n<script>alert(1)</script>");
    const diagnostics = page.locator("[data-web-diagnostics]");
    await expect(diagnostics).toContainText("never executes", {
      timeout: 5_000,
    });

    await html.fill("<p>ok</p>");
    await expect(diagnostics).toBeHidden({ timeout: 5_000 });
  });
});
