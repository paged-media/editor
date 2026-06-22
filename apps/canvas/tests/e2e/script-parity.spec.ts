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

// E2E op suite — script parity. The paged.* scripting surface (the
// automation / plugin / AI entry point) must produce the EXACT same
// document state as the equivalent wire mutation the panels emit.
// For each representative op: apply via client.mutate, dump the model,
// undo; then apply via paged.* (executeScript) and assert the dump is
// byte-for-byte identical — the two surfaces stay in lockstep.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import { dumpElement } from "./harness/model-dump";
import { mutate, script } from "./harness/ui";

function refStr(ref: ElementRef): string {
  return `${ref.kind}:${ref.id}`;
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

test.describe("E2E script parity", () => {
  let fx: LoadedFixture;
  let rect: ElementRef;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    rect = fx.frames.find((f) => f.ref.kind === "rectangle")!.ref;
  });

  test("AC-E2E-SCRIPT-1 — paged.set(frameOpacity) matches the wire mutation byte-for-byte @feat:scripting.mutation-parity @feat:scripting.property-readwrite @level:happy", async ({
    page,
  }) => {
    // Wire path.
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: rect,
        path: "frameOpacity",
        value: { type: "length", value: 63 },
      },
    });
    const wireDump = await dumpElement(page, rect);
    await undo(page);

    // Script path — same op through the Boa host.
    await script(
      page,
      `paged.set(${JSON.stringify(refStr(rect))}, "frameOpacity", 63);`,
    );
    const scriptDump = await dumpElement(page, rect);

    expect(
      scriptDump,
      "paged.set produced a different model than client.mutate",
    ).toBe(wireDump);
  });

  test("AC-E2E-SCRIPT-2 — paged.set(frameStrokeWeight) matches the wire mutation byte-for-byte @feat:scripting.mutation-parity @feat:scripting.property-readwrite @level:happy", async ({
    page,
  }) => {
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: rect,
        path: "frameStrokeWeight",
        value: { type: "length", value: 5 },
      },
    });
    const wireDump = await dumpElement(page, rect);
    await undo(page);

    await script(
      page,
      `paged.set(${JSON.stringify(refStr(rect))}, "frameStrokeWeight", 5);`,
    );
    const scriptDump = await dumpElement(page, rect);

    expect(scriptDump).toBe(wireDump);
  });

  test("AC-E2E-SCRIPT-3 — paged.undo() reverses a scripted edit to the baseline @feat:scripting.mutation-parity @feat:scripting.property-readwrite @level:happy", async ({
    page,
  }) => {
    const baseline = await dumpElement(page, rect);
    await script(
      page,
      `paged.set(${JSON.stringify(refStr(rect))}, "frameOpacity", 22);`,
    );
    expect(await dumpElement(page, rect)).not.toBe(baseline);
    await script(page, `paged.undo();`);
    expect(
      await dumpElement(page, rect),
      "paged.undo() did not restore the model",
    ).toBe(baseline);
  });
});
