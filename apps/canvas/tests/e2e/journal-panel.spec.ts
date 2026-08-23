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


// The Journal panel (ADR 025) — the local flight recorder's surface.
//
// Two things are worth a spec here, and the second is the one that matters:
//
//   1. The panel exists, opens, and lists what the journal recorded.
//   2. THE EXPORT PREVIEW CANNOT CONTAIN USER CONTENT. The design's whole
//      privacy claim is that document text and file paths are structurally
//      unrepresentable rather than filtered, and the dialog's live preview is
//      what makes that claim checkable BY THE USER. A unit test already pins
//      the serializer; this pins the thing a person actually sees.
//
// Also asserts the "What this cannot see" section is present and NOT collapsed
// behind a disclosure triangle — a reader who mistakes absence of evidence for
// evidence of absence is the failure mode the whole section exists to prevent,
// and a future tidy-up that hides it would silently defeat it.

import { expect, test } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";

const SECRET_TEXT = "the quick brown fox jumps";
const SECRET_PATH = "/Users/alice/Documents/Q4 Financials CONFIDENTIAL.idml";

test.describe("journal panel @feat:editor-shell.panels", () => {
  test("AC-JRN-1 — the panel opens and reports what was recorded @level:smoke", async ({
    page,
  }) => {
    await openCanvas(page);
    await openPanel(page, "paged.journal");

    const panel = page.locator("[data-journal-panel]");
    await expect(panel).toHaveCount(1);

    // Booting the app activates eight bundles, so the journal is never empty
    // by the time the panel can be opened.
    await expect(panel.locator("[data-journal-summary]")).toContainText(
      /\d+ entr(y|ies)/,
    );
    await expect(
      panel.locator('[data-journal-entry][data-journal-code="plugin.activate"]').first(),
    ).toBeVisible();
  });

  test("AC-JRN-2 — 'What this cannot see' is present and NOT collapsed @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await openPanel(page, "paged.journal");

    const uncaptured = page.locator("[data-journal-uncaptured]");
    await expect(uncaptured).toBeVisible();
    await expect(uncaptured).toContainText("What this cannot see");

    // The counted half is rendered inline (no <details> wrapper around it):
    // only the structural blind-spot LIST is allowed to be collapsible.
    const collapsedCounted = uncaptured.locator(
      "details [data-journal-uncaptured-row]",
    );
    await expect(collapsedCounted).toHaveCount(0);

    // The declared blind spots are always shipped, never an empty list.
    await expect(uncaptured.locator("[data-journal-blindspots]")).toBeVisible();
  });

  test("AC-JRN-3 — the export preview cannot contain user text or paths @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await openPanel(page, "paged.journal");

    // Push content at the journal the way a real failure would: an uncaught
    // error and a rejected promise whose messages embed a document name and a
    // disk path. Both reach the global handlers this design installed.
    await page.evaluate(
      ([text, path]) => {
        window.dispatchEvent(
          new ErrorEvent("error", {
            error: new TypeError(`failed to open ${path}`),
            message: `failed to open ${path}`,
          }),
        );
        window.dispatchEvent(
          new PromiseRejectionEvent("unhandledrejection", {
            promise: Promise.resolve(),
            reason: new RangeError(`${text} — ${path}`),
            cancelable: true,
          }),
        );
      },
      [SECRET_TEXT, SECRET_PATH],
    );

    await page.locator("[data-journal-export]").click();
    const preview = page.locator("[data-journal-preview]");
    await expect(preview).toBeVisible();

    const text = (await preview.textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);

    // The claim, pinned where the user can see it.
    expect(text).not.toContain(SECRET_TEXT);
    expect(text).not.toContain(SECRET_PATH);
    expect(text).not.toContain("alice");
    expect(text).not.toContain("CONFIDENTIAL");

    // Not vacuous: the errors WERE recorded, reduced to their kind.
    expect(text).toContain("shell.window.error");
    expect(text).toContain("typeerror");
    expect(text).toContain("rangeerror");

    // And the bundle declares its own blind spots.
    expect(text).toContain("blindSpots");
  });

  test("AC-JRN-4 — the opt-in sections are off until ticked @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await openPanel(page, "paged.journal");
    await page.locator("[data-journal-export]").click();

    const preview = page.locator("[data-journal-preview]");
    await expect(preview).toBeVisible();
    expect(await preview.textContent()).not.toContain('"crash"');

    // Ticking crash adds the section — and only then.
    await page.locator("[data-journal-include-crash]").check();
    await expect(preview).toContainText('"crash"');
  });
});
