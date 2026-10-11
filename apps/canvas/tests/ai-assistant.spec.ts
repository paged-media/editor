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

// The AI Assistant card in the Properties panel (ADR 221), with the proxy
// stubbed: a suggestion sends the selection and the diagnosis to Claude,
// the agent's script changes the document, the summary shows, and Undo
// reverts exactly Claude's change — but not after the user edited since.

import { test, expect, type Page, type Route } from "@playwright/test";

import { loadIdml, openCanvas, openPanel } from "./fidelity/canvas-driver";
import { FIXTURE, opacity, SUMMARY_TURN, TEXT_FRAME_ID, TOOL_TURN } from "./ai-fixtures";

async function selectFrame(page: Page): Promise<void> {
  await page.evaluate((id) => {
    const c = (globalThis as unknown as { __canvas: { setElementSelection(ids: unknown[], mode: string): void } }).__canvas;
    c.setElementSelection([{ kind: "textFrame", id }], "replace");
  }, TEXT_FRAME_ID);
}

async function stubClaude(page: Page, sent: Array<{ mode: string | null; prompt: unknown }>): Promise<void> {
  await page.route("**/api/ai/v1/messages", async (route: Route) => {
    const req = route.request();
    const body = req.postDataJSON() as { messages: Array<{ content: unknown }> };
    sent.push({ mode: req.headers()["x-paged-ai-mode"] ?? null, prompt: body.messages[0]!.content });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sent.length % 2 === 1 ? TOOL_TURN : SUMMARY_TURN });
  });
}

test.describe("AI Assistant card", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.properties");
    await selectFrame(page);
  });

  test("a suggestion runs Claude on the selection, and Undo reverts it @feat:editor-shell.ai-assistant @feat:editor-shell.panels.properties @level:happy", async ({ page }) => {
    const sent: Array<{ mode: string | null; prompt: unknown }> = [];
    await stubClaude(page, sent);
    const card = page.locator("[data-ai-assistant]");
    await expect(card.locator("[data-powered-by-claude]")).toBeVisible();
    await expect(card.locator("[data-ai-diagnosis]")).not.toBeEmpty();
    const before = await opacity(page);

    await card.locator("[data-ai-suggestion]").first().click();
    await expect(card.locator("[data-ai-summary]")).toHaveText("Set the frame's opacity to 40%.");
    expect(await opacity(page)).toBe(40);

    expect(sent[0]!.mode).toBe("assist");
    expect(String(sent[0]!.prompt)).toContain(`textFrame:${TEXT_FRAME_ID}`);
    expect(String(sent[0]!.prompt)).toMatch(/Request: /);

    await card.locator("[data-action=ai-undo]").click();
    await expect(card).toHaveAttribute("data-ai-assistant-state", "idle");
    expect(await opacity(page)).toEqual(before);
  });

  test("Undo refuses once the document was edited after Claude @feat:editor-shell.ai-assistant @feat:editor-shell.panels.properties @level:edge", async ({ page }) => {
    await stubClaude(page, []);
    const card = page.locator("[data-ai-assistant]");
    await card.locator("[data-ai-input]").fill("make it lighter");
    await card.locator("[data-ai-input]").press("Enter");
    await expect(card.locator("[data-ai-summary]")).toBeVisible();

    // The user edits after Claude finished.
    await page.evaluate(
      (id) => (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<unknown> } } }).__canvas.client.executeScript(`paged.set("textFrame:${id}", "frameOpacity", 70)`),
      TEXT_FRAME_ID,
    );
    await card.locator("[data-action=ai-undo]").click();
    await expect(card.locator("[data-ai-error]")).toContainText("changed after Claude's edit");
    expect(await opacity(page)).toBe(70);
  });
});
