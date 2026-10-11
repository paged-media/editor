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

// Claude in the Script panel (ADR 221), end to end except the model: the
// /api/ai proxy is stubbed with canned SSE turns, so the real browser SDK,
// the real agent loop, the real worker and Boa all run. Asserted: the
// script Claude writes lands in the editor, runs through the undoable
// script door, its result goes back to the model, and the summary and the
// "Powered by Claude" mark show.

import { test, expect, type Route } from "@playwright/test";

import { loadIdml, openCanvas, openPanel } from "./fidelity/canvas-driver";
import { FIXTURE, opacity, SCRIPT, SUMMARY_TURN, textTurn, TOOL_TURN } from "./ai-fixtures";

test.describe("Script panel — Ask Claude", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.script-editor");
  });

  test("Claude's script runs through the script door and its result goes back @feat:scripting.script-editor @level:happy", async ({ page }) => {
    const sent: Array<{ mode: string | null; body: { messages: Array<{ role: string; content: unknown }> } }> = [];
    await page.route("**/api/ai/v1/messages", async (route: Route) => {
      const req = route.request();
      sent.push({ mode: req.headers()["x-paged-ai-mode"] ?? null, body: req.postDataJSON() });
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: sent.length === 1 ? TOOL_TURN : SUMMARY_TURN });
    });

    const panel = page.locator("[data-script-editor]");
    await expect(panel.locator("[data-powered-by-claude]")).toBeVisible();
    await panel.locator("[data-script-ask-input]").fill("make the text frame 40% opaque");
    await panel.locator("[data-action=ask]").click();

    await expect(panel.locator("[data-script-note]").last()).toHaveText("Claude: Set the frame's opacity to 40%.");
    await expect(panel.locator("[data-script-source]")).toHaveValue(SCRIPT);
    await expect(panel.locator("[data-script-log]")).toContainText("opacity set");
    expect(await opacity(page)).toBe(40);

    expect(sent).toHaveLength(2);
    expect(sent[0]!.mode).toBe("script");
    expect(sent[0]!.body.messages[0]).toEqual({ role: "user", content: "make the text frame 40% opaque" });
    // The second turn carries the first script's result back to the model.
    const results = sent[1]!.body.messages.at(-1)!.content as Array<{ type: string; content: string; is_error: boolean }>;
    expect(results[0]!.type).toBe("tool_result");
    expect(results[0]!.is_error).toBe(false);
    expect(JSON.parse(results[0]!.content).output.join("\n")).toContain("opacity set");

    // Claude's write is an ordinary undoable script write.
    await page.evaluate(() => (globalThis as unknown as { __canvas: { client: { undo(): Promise<unknown> } } }).__canvas.client.undo());
    expect(await opacity(page)).not.toBe(40);
  });

  test("an unconfigured deployment says so instead of failing silently @feat:scripting.script-editor @level:edge", async ({ page }) => {
    await page.route("**/api/ai/v1/messages", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ type: "error", error: { type: "ai_unavailable", message: "The AI service is not configured on this deployment." } }) }),
    );
    const panel = page.locator("[data-script-editor]");
    await panel.locator("[data-script-ask-input]").fill("anything");
    await panel.locator("[data-action=ask]").click();
    await expect(panel.locator("[data-script-error]").last()).toContainText("not configured on this deployment");
    await expect(panel.locator("[data-script-ask-input]")).toBeEnabled();
  });

  test("the command palette hands a request to the Ask bar @feat:scripting.script-editor @feat:editor-shell.command-palette @level:happy", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/ai/v1/messages", (route: Route) => {
      calls++;
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: calls === 1 ? TOOL_TURN : SUMMARY_TURN });
    });
    await page.evaluate(() =>
      (globalThis as unknown as { __canvas: { registries: { commands: { invoke(id: string, payload?: unknown): Promise<unknown> } } } }).__canvas.registries.commands.invoke(
        "paged.ai.ask",
        "make the text frame 40% opaque",
      ),
    );
    const panel = page.locator("[data-script-editor]");
    await expect(panel.locator("[data-script-note]").first()).toHaveText("You: make the text frame 40% opaque");
    await expect(panel.locator("[data-script-note]").last()).toHaveText("Claude: Set the frame's opacity to 40%.");
    expect(await opacity(page)).toBe(40);
  });

  test("a script asks Claude for text through paged.invoke @feat:scripting.script-editor @level:happy", async ({ page }) => {
    const sent: Array<{ mode: string | null; content: unknown }> = [];
    await page.route("**/api/ai/v1/messages", async (route: Route) => {
      const req = route.request();
      sent.push({ mode: req.headers()["x-paged-ai-mode"] ?? null, content: (req.postDataJSON() as { messages: Array<{ content: unknown }> }).messages[0]!.content });
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: textTurn("Spring into tea") });
    });
    const run = await page.evaluate(() =>
      (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[]; error: string | null }> } } }).__canvas.client.executeScript(
        'const t = JSON.parse(await paged.invoke("paged.ai.complete", { prompt: "A four-word headline" })); console.log(t);',
      ),
    );
    expect(run.error).toBeNull();
    expect(run.output).toEqual(["[log] Spring into tea"]);
    expect(sent).toEqual([{ mode: "complete", content: "A four-word headline" }]);
  });
});
