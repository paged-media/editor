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

// The hands-free live demos (public/scripts/*-live.js), which paged.media
// embeds from the playground (website ADR 858): each one must run from top
// to bottom on its own, with no click, no error and no page error, because
// nobody is there to rescue it. A script that fails here would fail in front
// of a reader.

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openCanvas } from "./fidelity/canvas-driver";

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "public", "scripts", "manifest.json"), "utf8")) as {
  scripts: Array<{ id: string }>;
};
const LIVE = manifest.scripts.map((s) => s.id).filter((id) => id.endsWith("-live"));

for (const id of LIVE) {
  test(`live script ${id} runs to the end hands-free`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openCanvas(page, { search: `?script=${id}&autoplay&embed` });
    const chip = page.locator("[data-playground-status]");
    await expect(chip).toHaveAttribute("data-playground-status", /playing|done/, { timeout: 30_000 });
    await expect
      .poll(async () => {
        const status = await chip.getAttribute("data-playground-status");
        if (status === "error") throw new Error(`${id}: ${await chip.getAttribute("data-playground-error")}`);
        return status;
      }, { timeout: 90_000, intervals: [500] })
      .toBe("done");
    expect(errors).toEqual([]);
  });
}
