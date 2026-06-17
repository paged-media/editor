// Journey: the command palette.
//
// Cmd/Ctrl+K is the keyboard-driven command surface a power user reaches
// for. The journey proves the binding opens the palette and Escape
// dismisses it — the foundational interaction the palette feature is.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · command palette", () => {
  test("Cmd+K opens the command palette; Escape dismisses it @feat:editor-shell.command-palette @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const palette = page.locator("[data-palette-footer]");
    await expect(palette).toBeHidden();

    // The registry binds BOTH Cmd+K and Ctrl+K (PALETTE_TOGGLE_KEYBINDING
    // + _CTRL); press the platform one.
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+k" : "Control+k",
    );
    await expect(palette).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });
});
