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

// E2E — the C-9 caret read door's EDITOR BACKEND (the reader main.tsx
// injects into every bundle host as `textCaret`, behind
// `host.text.caret()`). The caret lives in editor state (the
// text-editing layer), so this is the half only the editor can prove:
// the injected reader surfaces the LIVE content selection as
// `{ storyId, offset }` in the engine text-op offset convention (the
// `ContentSelection` story-local offsets `insertText.offset` consumes).
//
// Exposed for tests as `__textCaret` (the `__consent`/`__secrets`
// affordance pattern) — no caret-consuming bundle exists yet, and the
// pinned plugin-sdk canary predates the door, so the facade end
// (`host.text.caret()` + supports flag + no-backend default) is
// unit-proven in plugin-sdk text-caret.spec.ts. The contract's honest
// gaps are pinned here: a RANGE answers its START (where a replace
// inserts); a CELL-QUALIFIED caret answers null (cell-local offsets
// must not leak as story-local).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadFixture, type LoadedFixture } from "./harness/fixtures";
import { setCaret } from "./harness/ui";

type Caret = { storyId: string; offset: number } | null;

/** Read the injected C-9 backend (the exact function the bundle hosts
 *  receive). Poll-friendly: the content-selection REF updates on the
 *  provider's re-render, one tick after setContentSelection. */
async function readCaret(page: Page): Promise<Caret> {
  return page.evaluate(() =>
    (
      globalThis as unknown as {
        __textCaret: { read: () => Caret };
      }
    ).__textCaret.read(),
  );
}

/** Drive the shared content-selection state (the same writer clicks +
 *  useTextEditing use), including null / cell-qualified forms the
 *  harness `setCaret` doesn't cover. */
async function setSelection(page: Page, sel: unknown): Promise<void> {
  await page.evaluate((s) => {
    (
      globalThis as unknown as {
        __canvas: { setContentSelection: (s: unknown) => void };
      }
    ).__canvas.setContentSelection(s);
  }, sel);
}

test.describe("C-9 — the injected text-caret reader", () => {
  let fx: LoadedFixture;
  let storyId: string;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "text");
    expect(fx.firstStory, "text fixture has a story").toBeTruthy();
    storyId = fx.firstStory!.selfId;
    // The door is injected by the plugin-bundles mount (the same effect
    // that builds the host options).
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            typeof (globalThis as unknown as { __textCaret?: unknown })
              .__textCaret !== "undefined",
        ),
      )
      .toBe(true);
  });

  test("surfaces the live caret as {storyId, offset}; range answers its start; clears to null @feat:plugin-platform.text-caret-door @level:happy", async ({
    page,
  }) => {
    // No active text caret → the honest null.
    expect(await readCaret(page)).toBeNull();

    // A collapsed caret surfaces its offset — the SAME story-local
    // value an insertText at the caret would consume.
    await setCaret(page, storyId, 3);
    await expect
      .poll(() => readCaret(page), { timeout: 5_000 })
      .toEqual({ storyId, offset: 3 });

    // The caret MOVES between reads (typing/clicks) — the reader is a
    // live per-call read, never a snapshot.
    await setCaret(page, storyId, 5);
    await expect
      .poll(() => readCaret(page), { timeout: 5_000 })
      .toEqual({ storyId, offset: 5 });

    // A RANGE selection answers its START — where a replace inserts.
    await setCaret(page, storyId, 2, 6);
    await expect
      .poll(() => readCaret(page), { timeout: 5_000 })
      .toEqual({ storyId, offset: 2 });

    // Leaving text editing clears the caret → null again.
    await setSelection(page, null);
    await expect.poll(() => readCaret(page), { timeout: 5_000 }).toBeNull();
  });

  test("a cell-qualified caret answers null — cell-local offsets never leak as story-local @feat:plugin-platform.text-caret-door @level:edge", async ({
    page,
  }) => {
    // The v35 cell qualifier makes start/end CELL-LOCAL; handing them to
    // a bundle as story-local offsets would route its insert into the
    // wrong stream. The documented v1 gap: the reader answers null.
    // (The READER reads only editor state; the setter's worker
    // round-trip tolerates an unresolvable table address — the caret
    // geometry query just answers nothing and is caught.)
    await setSelection(page, {
      storyId,
      start: 0,
      end: 0,
      cell: { tableId: "t-none", row: 0, col: 0 },
    });
    await expect.poll(() => readCaret(page), { timeout: 5_000 }).toBeNull();

    // And the reader recovers to a body caret afterwards.
    await setCaret(page, storyId, 1);
    await expect
      .poll(() => readCaret(page), { timeout: 5_000 })
      .toEqual({ storyId, offset: 1 });
  });
});
