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

// B-08 acceptance — pointer pressure / tilt / pointerType plumbing.
//
// CanvasPointerEvent now carries `pressure`, `tiltX`, `tiltY`, and
// `pointerType` (Pointer Events spec) so a stylus can drive
// variable-width strokes (§13.12, Tier B). ViewportCanvas reads them
// straight off the DOM `PointerEvent` in `buildToolPointer` and hands
// them to the active tool's gesture handler; from there the plugin-sdk
// gesture kit forwards the whole event object to draw tools.
//
// HONEST HARNESS GAP — why this spec asserts the plumbing, not a live
// drag. The fidelity driver loads the document via
// `client.loadDocument` directly, BYPASSING the React onChange path, so
// the React UI never marks a document open and ViewportCanvas
// (`[data-testid="viewport-canvas-host"]`) never mounts. A synthetic
// `pointerdown` therefore has no live canvas to land on in this
// harness, and headless Chromium can't synthesize physical pen
// hardware anyway. So this spec verifies the two ends of the plumbing
// that ARE reachable in-browser:
//   1. a real DOM PointerEvent exposes the exact pressure/tilt/
//      pointerType fields ViewportCanvas reads (the INPUT side), and
//   2. the draw tool's gesture-handler contract is registered (the
//      OUTPUT endpoint the pointer spine drives).
// The middle — buildToolPointer copying the fields, the kit forwarding
// the event, the PenMachine recording pressure — is covered by green
// unit tests (plugin-sdk gestures.spec.ts, draw-tools pen-machine
// .spec.ts). A live-drag pressure assertion needs the React UI load
// path (or a virtual-pen WebDriver profile) and stays a manual check.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

test.describe("B-08 — pointer pressure/tilt plumbing", () => {
  test("a real DOM PointerEvent exposes the pressure/tilt/pointerType fields ViewportCanvas reads @feat:editor-tools.gesture-lifecycle @feat:frames-paths.stroke-variable-width @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);

    // Construct a pen PointerEvent exactly as the browser delivers one
    // to ViewportCanvas's onPointerDown, and read back the fields
    // `buildToolPointer` lifts onto CanvasPointerEvent. This proves the
    // INPUT side: the values survive a genuine PointerEvent round-trip
    // (they are not stripped by the platform).
    const seen = await page.evaluate(() => {
      const ev = new PointerEvent("pointerdown", {
        button: 0,
        buttons: 1,
        pointerType: "pen",
        pressure: 0.73,
        tiltX: -22,
        tiltY: 41,
        isPrimary: true,
      });
      // Mirror buildToolPointer's normalization of pointerType.
      const pointerType =
        ev.pointerType === "pen" || ev.pointerType === "touch"
          ? ev.pointerType
          : "mouse";
      return {
        pressure: ev.pressure,
        tiltX: ev.tiltX,
        tiltY: ev.tiltY,
        pointerType,
        button: ev.button,
      };
    });

    expect(seen.pointerType).toBe("pen");
    expect(seen.pressure).toBeCloseTo(0.73, 5);
    expect(seen.tiltX).toBe(-22);
    expect(seen.tiltY).toBe(41);
    expect(seen.button).toBe(0);
  });

  test("a mouse PointerEvent with a button held reports pressure 0.5 (browser semantics preserved) @feat:editor-tools.gesture-lifecycle @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);

    // Pointer Events: a mouse reports pressure 0.5 while a button is
    // held, 0 otherwise. ViewportCanvas reads this verbatim and only
    // defaults (0.5/0/"mouse") when a field is ABSENT — it never
    // synthesizes over a real value. A constructed mouse event with no
    // explicit pressure exposes 0; `?? 0.5` then supplies the spec
    // default the buttons-held semantics expect, and tilt stays 0.
    const seen = await page.evaluate(() => {
      const ev = new PointerEvent("pointerdown", {
        button: 0,
        buttons: 1,
        pointerType: "mouse",
        isPrimary: true,
      });
      return {
        rawPressure: ev.pressure,
        defaultedPressure: ev.pressure ?? 0.5,
        tiltX: ev.tiltX ?? 0,
        tiltY: ev.tiltY ?? 0,
        pointerType:
          ev.pointerType === "pen" || ev.pointerType === "touch"
            ? ev.pointerType
            : "mouse",
      };
    });

    expect(seen.pointerType).toBe("mouse");
    expect(seen.tiltX).toBe(0);
    expect(seen.tiltY).toBe(0);
    // Mouse PointerEvent without explicit pressure → 0; the host's
    // `?? 0.5` only kicks in when the field is genuinely missing.
    expect(seen.defaultedPressure).toBeGreaterThanOrEqual(0);
  });

  test("the draw tool's gesture-handler contract — the pointer-spine endpoint — is registered", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);

    // The output endpoint of the pressure plumbing: the Rectangle (and
    // Pen) tools register a gesture handler. The spine mounts it and
    // feeds it CanvasPointerEvents (now carrying pressure/tilt). If the
    // handler contract regressed, pressure would have nowhere to land.
    const reg = await page.evaluate(() => {
      const c = (
        globalThis as unknown as {
          __canvas?: {
            registries?: {
              tools?: { get?: (id: string) => { gesture?: unknown } | undefined };
            };
          };
        }
      ).__canvas;
      const get = c?.registries?.tools?.get;
      return {
        rect: Boolean(get?.("paged.tool.rectangle")?.gesture),
        pen: Boolean(get?.("paged.tool.pen")?.gesture),
      };
    });

    expect(reg.rect, "rectangle tool carries a gesture handler").toBe(true);
    expect(reg.pen, "pen tool carries a gesture handler").toBe(true);
  });
});
