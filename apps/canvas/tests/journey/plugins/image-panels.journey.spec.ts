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

// Journey: the 2026-08-06 panel wave — CHANNELS, PATHS and BRUSH PRESETS.
//
// Each of the three was proven inside the bundle (Rust + glue specs) and
// nowhere else. That is the same blind spot the selection wave had: a
// green bundle suite only proves the bundle agrees with itself, and the
// question a journey answers is whether the section is reachable, wired
// and truthful in the REAL host.
//
// EVERYTHING HERE RUNS ON THE CPU LANE. The three sections were chosen
// for this wave precisely because their payloads are engine STATE —
// channel statistics, selection coverage, an inserted scene element —
// rather than rendered pixels, so none of it is GPU-gated. A journey
// that skips wholesale proves nothing on the lane that actually runs.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";
import { treeIds } from "../../e2e/harness/viewport";

type Page = import("@playwright/test").Page;

const ADJ_PANEL = "media.paged.image.panel.adjustments";

const CMD = {
  selectAll: "media.paged.image.command.selectAll",
  deselect: "media.paged.image.command.deselect",
  toPath: "media.paged.image.command.selectionToPath",
  fromPath: "media.paged.image.command.pathToSelection",
  channelToSelection: "media.paged.image.command.channelToSelection",
  loadBrushes: "media.paged.image.command.loadBrushLibrary",
} as const;

/** The panel's Source row — proves the engine decoded the import. */
async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "Source row not found";
  });
}

async function coverage(page: Page): Promise<number | null> {
  const el = page.locator("[data-image-selection-coverage]");
  if ((await el.count()) === 0) return null;
  const text = (await el.first().textContent()) ?? "";
  const n = Number.parseFloat(text.replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

/** Ingest the synthesized gradient PNG into a drawn frame. */
async function ingest(page: Page, name: string) {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  const frame = await designer.drawRectangle({
    x0: 90,
    y0: 120,
    x1: 360,
    y1: 320,
  });
  expect(frame, "drew a target frame").not.toBe("");
  await designer.selectElement("rectangle", frame);
  const importer = await designer.importImage({ name });
  expect(importer, "the raster importer resolved + ran").toContain(
    "media.paged.image.importer.raster",
  );
  await designer.openPanel(ADJ_PANEL);
  await expect
    .poll(() => sourceReadout(page), { timeout: 15_000 })
    .toEqual(expect.stringContaining(name));
  return { designer, frame };
}

test.describe("journey · paged.image panels", () => {
  test("the Channels list reads the ingested image, and a channel becomes the selection @feat:image.channels.readout @feat:image.channels.to-selection @feat:image.editor.ingest @level:gesture", async ({
    page,
  }) => {
    const { designer } = await ingest(page, "channels-sample.png");

    // ── 1. THE READOUT. Five rows — R/G/B/A plus the derived luma —
    //    each carrying real numbers from the engine's own reduction.
    //    The importer's fixture is a diagonal gradient, so no channel is
    //    flat and "unmeasured" anywhere would be a wiring failure. ──
    const rows = page.locator("[data-image-channel-stats]");
    await expect(rows).toHaveCount(5, { timeout: 15_000 });
    for (const name of ["red", "green", "blue", "alpha", "luma"]) {
      await expect(
        page.locator(`[data-image-channel-stats="${name}"]`),
      ).toContainText("mean");
    }
    // Alpha is opaque throughout a synthesized PNG — a channel readout
    // that reported otherwise would be reducing the wrong axis.
    await expect(
      page.locator('[data-image-channel-stats="alpha"]'),
    ).toContainText("255–255");

    // ── 2. CHANNEL → SELECTION. The gradient's luma spans the range, so
    //    loading it must give a PARTIAL coverage — strictly between
    //    nothing and everything. That is the assertion a thresholding
    //    implementation fails, and it is why a channel load is worth
    //    having: this is a luminosity mask. ──
    expect(await coverage(page), "no selection yet").toBeNull();
    await designer.runCommand(CMD.channelToSelection);
    await expect.poll(() => coverage(page), { timeout: 15_000 }).not.toBeNull();
    const luma = await coverage(page);
    expect(luma, "a gradient's luma selects partially").toBeGreaterThan(1);
    expect(luma).toBeLessThan(99);

    // ── 3. And the panel says WHY it is partial, where the designer is
    //    standing rather than in a changelog. ──
    await expect(page.getByText("no threshold")).toBeVisible();
  });

  test("a selection becomes a real vector path, and a path becomes a selection @feat:image.paths.selection-to-path @feat:image.paths.path-to-selection @feat:image.selection.mask-tools @level:gesture", async ({
    page,
  }) => {
    const { designer } = await ingest(page, "paths-sample.png");

    const polygonsBefore = await designer.count("polygon");

    // ── 1. SELECTION → PATH. Select-all traces the image border, which
    //    is one contour, so exactly one polygon must appear — in the
    //    DOCUMENT, as a host element, not as plugin-private state. ──
    await designer.runCommand(CMD.selectAll);
    await expect
      .poll(() => coverage(page), { timeout: 15_000 })
      .toBeGreaterThan(99);
    await designer.runCommand(CMD.toPath);
    await expect
      .poll(() => designer.count("polygon"), { timeout: 15_000 })
      .toBe(polygonsBefore + 1);

    // ── 2. It is an ORDINARY element from here on — which is the whole
    //    point of tracing into the DOCUMENT rather than into a private
    //    path list: the polygon has a real element id, so the Pen, the
    //    direct-selection tools and the Pathfinder all address it. ──
    const polygons = await treeIds(page, "polygon");
    const traced = polygons.at(-1)?.id ?? "";
    expect(traced, "the traced path has a real element id").not.toBe("");

    // ── 3. PATH → SELECTION, the return trip. Deselect FIRST, so a
    //    surviving selection cannot be mistaken for a reloaded one —
    //    that is the failure mode that would let this test pass while
    //    the conversion did nothing at all. ──
    await designer.runCommand(CMD.deselect);
    await expect.poll(() => coverage(page), { timeout: 15_000 }).toBeNull();

    // With nothing but the image frame selected the command DECLINES
    // rather than guessing which element was meant.
    await designer.runCommand(CMD.fromPath);
    await expect.poll(() => coverage(page), { timeout: 5_000 }).toBeNull();

    // Select the traced polygon and load it back. It was traced FROM the
    // whole image, so the selection it produces covers the whole image —
    // the round trip, and an arithmetic one rather than "something
    // changed".
    await designer.selectElement("polygon", traced);
    await designer.runCommand(CMD.fromPath);
    await expect
      .poll(() => coverage(page), { timeout: 15_000 })
      .toBeGreaterThan(95);
  });

  test("the Brush presets section offers the .abr loader and states its scope @feat:image.editor.brush-presets @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    // SCOPE, stated: this drives everything about the section EXCEPT
    // choosing a file, because the load goes through the host's own file
    // picker and a journey cannot answer an OS dialog. What it does
    // prove is that the section is mounted, the command is registered
    // and reachable from the palette, and the pre-load text tells the
    // truth about what an `.abr` is. The parse → parameter mapping is
    // covered where real bytes CAN be fed to the shipped reader: the
    // bundle's own specs.
    const { designer } = await ingest(page, "brushes-sample.png");

    await expect(page.locator("[data-image-abr-load]")).toBeVisible();
    await expect(page.locator("[data-image-abr-load]")).toBeEnabled();
    // Nothing loaded is a STATE with its own text, not an empty list.
    await expect(page.getByText("No library loaded")).toBeVisible();
    await expect(page.getByText("parameters, not pixels")).toBeVisible();
    // No library ⇒ no Close button and no preset rows.
    await expect(page.locator("[data-image-abr-close]")).toHaveCount(0);
    await expect(page.locator("[data-image-abr-presets]")).toHaveCount(0);

    // The command exists and running it does not throw — with the stub
    // picker answering nothing, the honest outcome is "no library
    // chosen" and the section stays in its pre-load state.
    await designer.runCommand(CMD.loadBrushes);
    await expect(page.getByText("No library loaded")).toBeVisible();
  });
});
