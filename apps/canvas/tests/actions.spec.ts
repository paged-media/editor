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

// Actions — record / replay a command sequence.
//
// Two tiers, for two different claims.
//
//  · The NODE tier proves the classifier, because that is the piece
//    that decides whether a replay is honest. `actions/model.ts`
//    imports nothing at runtime, so it is importable straight from
//    here (the `object-commands.spec.ts` convention).
//
//  · The BROWSER tier proves the tap. The claim under test is not
//    "the panel renders" — it is that the recorder sees a command
//    invoked from anywhere, and that a document edit which does NOT
//    go through a command is COUNTED rather than silently dropped.
//    That second assertion is the whole point of the feature's
//    scoping, so it gets a test.

import { expect, test } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyPayload,
  looksLikeDocumentId,
  planReplay,
  toDemoScript,
  parseLibrary,
  ACTIONS_SCHEMA_VERSION,
  type ActionStep,
  type PagedAction,
} from "../../../packages/shell/src/actions/model";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

const step = (over: Partial<ActionStep> = {}): ActionStep => ({
  command: "paged.object.group",
  title: "Group",
  verdict: "contextual",
  ...over,
});

const action = (
  steps: ActionStep[],
  over: Partial<PagedAction> = {},
): PagedAction => ({
  id: "a1",
  name: "Test",
  createdAt: 0,
  steps,
  uncaptured: { gestures: 0, directEdits: 0 },
  includeDocumentBound: false,
  ...over,
});

test.describe("Actions — payload classification (pure)", () => {
  test("AC-ACT-1 — no payload is contextual: it replays against the replay-time selection @feat:editor-shell.actions @level:happy", () => {
    expect(classifyPayload(undefined)).toEqual({ verdict: "contextual" });
  });

  test("AC-ACT-2 — a plain payload is portable and is CLONED off the caller @feat:editor-shell.actions @level:happy", () => {
    const payload = { amount: 12, unit: "pt" };
    const out = classifyPayload(payload);
    expect(out.verdict).toBe("portable");
    // The recorder must not hold the caller's object: a panel that
    // reuses one payload object across invocations would otherwise
    // rewrite history.
    expect(out.payload).not.toBe(payload);
    expect(out.payload).toEqual(payload);
  });

  test("AC-ACT-3 — an ElementId anywhere in the payload makes the step document-bound @feat:editor-shell.actions @level:edge", () => {
    expect(classifyPayload({ kind: "rectangle", id: "ua365e1" }).verdict).toBe(
      "documentBound",
    );
    // Nested, and behind an array — the walk has to find it.
    expect(
      classifyPayload({ targets: [{ kind: "group", id: "u1" }] }).verdict,
    ).toBe("documentBound");
  });

  test("AC-ACT-4 — engine self-id STRINGS are document-bound; ordinary words are not @feat:editor-shell.actions @level:edge", () => {
    // The three shapes that actually appear on the wire.
    expect(looksLikeDocumentId("u0f396d")).toBe(true); // PageId
    expect(looksLikeDocumentId("textFrame:ua365e1")).toBe(true);
    expect(looksLikeDocumentId("Color/uPagedSheetChart3366CC")).toBe(true);
    // Named library entries travel between documents — not ids.
    expect(looksLikeDocumentId("Color/Black")).toBe(false);
    expect(looksLikeDocumentId("Swatch/None")).toBe(false);
    // The heuristic's digit requirement is what keeps vocabulary out.
    // Without it, every one of these would be flagged.
    expect(looksLikeDocumentId("underline")).toBe(false);
    expect(looksLikeDocumentId("uppercase")).toBe(false);
    expect(looksLikeDocumentId("paged.properties")).toBe(false);
    expect(looksLikeDocumentId(42)).toBe(false);
  });

  test("AC-ACT-5 — an unserializable payload is recorded as unreplayable, not dropped @feat:editor-shell.actions @level:edge", () => {
    expect(classifyPayload(() => {}).verdict).toBe("unserializable");
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(classifyPayload(cycle).verdict).toBe("unserializable");
  });
});

test.describe("Actions — replay plan (pure)", () => {
  test("AC-ACT-6 — document-bound steps are skipped by default and named @feat:editor-shell.actions @level:happy", () => {
    const plan = planReplay(
      action([
        step(),
        step({
          verdict: "documentBound",
          payload: { kind: "group", id: "u1" },
        }),
      ]),
    );
    expect(plan.run.map((p) => p.index)).toEqual([0]);
    expect(plan.skip).toHaveLength(1);
    expect(plan.skip[0].reason).toBe("documentBound");
  });

  test("AC-ACT-7 — the opt-in runs them @feat:editor-shell.actions @level:edge", () => {
    const plan = planReplay(
      action(
        [
          step({
            verdict: "documentBound",
            payload: { kind: "group", id: "u1" },
          }),
        ],
        { includeDocumentBound: true },
      ),
    );
    expect(plan.run).toHaveLength(1);
    expect(plan.skip).toHaveLength(0);
  });

  test("AC-ACT-8 — disabled, failed and unserializable steps never replay @feat:editor-shell.actions @level:edge", () => {
    const plan = planReplay(
      action([
        step({ disabled: true }),
        step({ failed: true }),
        step({ verdict: "unserializable" }),
      ]),
    );
    expect(plan.run).toHaveLength(0);
    expect(plan.skip.map((s) => s.reason)).toEqual([
      "disabled",
      "failedWhileRecording",
      "unserializable",
    ]);
  });
});

test.describe("Actions — projections + persistence (pure)", () => {
  test("AC-ACT-9 — an action projects onto the shipped automation surface @feat:editor-shell.actions @level:happy", () => {
    // `editor.runCommand` is the demo/automation layer's real entry
    // point (packages/shell/src/demo/automation.ts), so the emitted
    // script is executable, not illustrative.
    const src = toDemoScript(
      action([
        step(),
        step({ command: "paged.view.zoomFit", title: "Fit document" }),
      ]),
    );
    expect(src).toContain('await editor.runCommand("paged.object.group");');
    expect(src).toContain('await editor.runCommand("paged.view.zoomFit");');
  });

  test("AC-ACT-10 — the script states what the recording could not capture @feat:editor-shell.actions @level:edge", () => {
    const src = toDemoScript(
      action([step()], { uncaptured: { gestures: 3, directEdits: 5 } }),
    );
    expect(src).toContain("3 canvas gesture(s)");
    expect(src).toContain("5 direct edit(s)");
  });

  test("AC-ACT-11 — a malformed stored library is DROPPED, never repaired @feat:editor-shell.actions @level:edge", () => {
    expect(parseLibrary({ schema: 999, actions: [] }).actions).toEqual([]);
    expect(parseLibrary(null).actions).toEqual([]);
    expect(
      parseLibrary({
        schema: ACTIONS_SCHEMA_VERSION,
        // A half-understood action would replay something nobody
        // recorded, so an unknown verdict disqualifies the whole entry.
        actions: [{ ...action([step({ verdict: "bogus" as never })]) }],
      }).actions,
    ).toEqual([]);
    expect(
      parseLibrary({
        schema: ACTIONS_SCHEMA_VERSION,
        actions: [action([step()])],
      }).actions,
    ).toHaveLength(1);
  });
});

test.describe("Actions — the command tap (browser)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.evaluate(() =>
      (
        globalThis as unknown as {
          __canvas: { openPanel: (id: string) => void };
        }
      ).__canvas.openPanel("paged.actions"),
    );
    await expect(page.locator('[data-actions-panel="ready"]')).toBeVisible();
  });

  test("AC-ACT-12 — record → stop → play captures and replays command invocations @feat:editor-shell.actions @level:journey", async ({
    page,
  }) => {
    await page.locator('[data-cockpit-action="actions-record"]').click();
    await expect(page.locator("[data-actions-recording]")).toBeVisible();

    // Invoked through the registry — the same door the menu bar, the
    // palette and the keybinding dispatcher all use.
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            registries: { commands: { invoke(id: string): Promise<unknown> } };
          };
        }
      ).__canvas.registries.commands;
      await c.invoke("paged.view.zoom100");
      await c.invoke("paged.view.zoomFit");
    });

    await expect(page.locator("[data-actions-step-count]")).toHaveText("2");

    await page.locator("[data-actions-name]").fill("Zoom pair");
    await page.locator('[data-cockpit-action="actions-stop"]').click();

    await expect(page.getByText("Zoom pair")).toBeVisible();
    // Both steps carry no payload, so both are classified `contextual`
    // — the verdict that says "replays against the replay-time
    // selection", and the one that makes an action portable at all.
    await expect(page.locator("[data-actions-step]")).toHaveCount(2);
    await expect(
      page.locator('[data-actions-verdict="contextual"]'),
    ).toHaveCount(2);

    await page.locator('[data-cockpit-action^="actions-play-"]').click();
    await expect(page.locator("[data-actions-report]")).toBeVisible();
    await expect(page.locator("[data-actions-report-step]")).toHaveCount(2);
    // No step reports an error.
    await expect(page.locator("[data-actions-report]")).not.toContainText(
      "failed:",
    );
  });

  test("AC-ACT-13 — an edit that bypasses the command registry is COUNTED, not silently dropped @feat:editor-shell.actions @level:edge", async ({
    page,
  }) => {
    // The load-bearing honesty test. `client.mutate` is the door
    // gestures, typing and panel fields go through; none of them can
    // reach the command registry. The recorder must therefore say a
    // change happened that it could not capture — a recording that
    // looked complete while missing this is the failure mode the
    // whole scoping exists to prevent.
    await page.locator('[data-cockpit-action="actions-record"]').click();
    await page.evaluate(async () => {
      const canvas = globalThis as unknown as {
        __canvas: { client: { mutate(m: unknown): Promise<unknown> } };
      };
      await canvas.__canvas.client.mutate({
        op: "insertPage",
        args: { afterPageId: null, masterId: null },
      });
    });

    await expect(page.locator("[data-actions-uncaptured]")).toContainText(
      "direct edit",
    );
    // …and it produced no step, because it is not a command.
    await expect(page.locator("[data-actions-step-count]")).toHaveText("0");
  });

  test("AC-ACT-14 — record/stop/play are themselves commands, and the recorder does not record them @feat:editor-shell.actions @level:edge", async ({
    page,
  }) => {
    // Without the deny-list, starting a recording from the command
    // palette would make the recording's first step "start recording".
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            registries: { commands: { invoke(id: string): Promise<unknown> } };
          };
        }
      ).__canvas.registries.commands;
      await c.invoke("paged.actions.record");
      await c.invoke("paged.view.zoomFit");
    });
    await expect(page.locator("[data-actions-recording]")).toBeVisible();
    await expect(page.locator("[data-actions-step-count]")).toHaveText("1");
  });
});
