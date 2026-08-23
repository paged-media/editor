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

// Comments panel — INERT AT HEAD, and this spec pins exactly that
// (audit 17082026 B8/B9: the row was green via the panel-sweep mount
// smoke + styleguide shots of OTHER panels). The registry says
// `planned` ("collaboration backend"); the implementation is the
// brand's honest ComingSoon shell. The behaviour to protect is the
// HONESTY: the declared empty state renders, and there is NO
// fake-interactive chrome that could dead-end a designer. When the
// collaboration backend lands, this spec MUST be replaced by a real
// threaded-comments behaviour test.

import { test, expect } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

test.describe("Comments panel (honest stub)", () => {
  test("AC-COMMENTS-1 — the declared ComingSoon empty state, with zero interactive chrome @feat:editor-shell.panels.comments @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await openPanel(page, "paged.comments");

    const panel = page.locator("[data-comments-panel]");
    await expect(panel).toBeVisible();

    // The declared empty state — visibly a stub, with its promise
    // named (the collaboration backend), not a blank pane.
    const stub = panel.locator("[data-coming-soon]");
    await expect(stub).toBeVisible();
    await expect(stub).toContainText("No comments yet");
    await expect(stub).toContainText("collaboration backend");

    // No fake data and no dead interactive chrome: the panel offers
    // nothing clickable/typable while the backend does not exist.
    await expect(
      panel.locator("button, input, select, textarea"),
    ).toHaveCount(0);
  });
});
