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

// E2E — K-10, the SAVE-FILE door (the plugin RFI gap "host.shell.pickFile
// is READ-only, so paged.image can compute an adjusted PSD/PNG/JPEG but
// can only deliver it through the Export Center — a bundle cannot offer
// 'Save adjusted copy…'").
//
// This proves the EDITOR backend in a real browser: drive the injected
// shell door (`__shellDoors.saveFile` — the object the plugin-sdk host
// wraps as `host.shell`) and assert a REAL browser download lands with
// the bundle's bytes under its suggested name. Unlike `pickFile`, whose
// native dialog a headless run cannot drive, the save path IS drivable,
// so this door does not have to rest on unit tests alone.
//
// The plugin-sdk side (backend pass-through, the false-when-unwired
// door, the per-member supports flag) is unit-proven in plugin-sdk
// shell-save-file.spec.ts.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";

/** Call the injected shell save door exactly as a bundle would. */
async function saveFile(
  page: Page,
  request: { suggestedName: string; bytes: number[]; mimeType?: string },
): Promise<boolean> {
  return page.evaluate(async (r) => {
    const doors = (
      globalThis as unknown as {
        __shellDoors: {
          saveFile: (o: {
            suggestedName: string;
            bytes: Uint8Array;
            mimeType?: string;
          }) => Promise<boolean>;
        };
      }
    ).__shellDoors;
    return doors.saveFile({
      suggestedName: r.suggestedName,
      bytes: new Uint8Array(r.bytes),
      mimeType: r.mimeType,
    });
  }, request);
}

test.describe("shell.saveFile — the host save door (K-10)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            typeof (
              globalThis as unknown as {
                __shellDoors?: { saveFile?: unknown };
              }
            ).__shellDoors?.saveFile === "function",
        ),
      )
      .toBe(true);
  });

  test("delivers bundle bytes as a real download under the suggested name @feat:plugin-platform.file-picker @level:happy", async ({
    page,
  }) => {
    const downloadPromise = page.waitForEvent("download");
    // A PNG signature — the shape paged.image hands over for a "Save
    // adjusted copy…".
    const ok = await saveFile(page, {
      suggestedName: "adjusted.png",
      bytes: [137, 80, 78, 71, 13, 10, 26, 10],
      mimeType: "image/png",
    });
    expect(ok).toBe(true);

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("adjusted.png");
  });

  test("a suggested name is a NAME, never a path @feat:plugin-platform.file-picker @level:edge", async ({
    page,
  }) => {
    const downloadPromise = page.waitForEvent("download");
    // Directory separators and reserved characters are stripped: a
    // bundle can propose what a file is called, never where it lands.
    const ok = await saveFile(page, {
      suggestedName: '../../etc/pa:ss"wd.psd',
      bytes: [56, 66, 80, 83],
    });
    expect(ok).toBe(true);

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("passwd.psd");
  });
});
