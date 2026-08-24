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

// Journey: the paged.image PAINT lane (brush / pencil / eraser) and the
// SAVE-BACK exporters — the last two pieces of the 2026-08 wave that had no
// journey coverage.
//
// The brush is the Photoshop catalog's P0 rock: dab rasterization, stroke
// interpolation and coverage accumulation on the GPU, driven by a
// host-agnostic machine. Save-back is what makes an edit leave the editor at
// all, and its zero-edit byte-identity claim ("a plain export stays
// byte-identical at identity params") is the kind of promise that should be
// pinned by something other than its own unit test.
//
// Lane split as elsewhere in this directory: tool registration, brush
// options and exporter wiring are host state and run on BOTH lanes; painted
// PIXELS need a GPU because every dab is a WGSL dispatch.

import { expect, test } from "@playwright/test";

import { screenPoint } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const ADJ_PANEL = "media.paged.image.panel.adjustments";

const TOOL = {
  brush: "media.paged.image.tool.brush",
  pencil: "media.paged.image.tool.pencil",
  eraser: "media.paged.image.tool.eraser",
} as const;

const EXPORTER = {
  psd: "media.paged.image.exporter.psd",
  png: "media.paged.image.exporter.png",
  jpeg: "media.paged.image.exporter.jpeg",
} as const;

async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "Source row not found";
  });
}

/** Which tool ids the host rail actually carries — proves the bundle's
 *  `contributeTool` calls reached the registry, not just the manifest. */
async function registeredTools(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: {
            registries: { tools?: { list: () => Array<{ id: string }> } };
          };
        }
      ).__canvas.registries.tools
        ?.list()
        .map((t) => t.id) ?? [],
  );
}

/** Run an exporter through the host registry and report the byte shape. */
async function runExporter(
  page: Page,
  id: string,
): Promise<{ byteLength: number; magic: number[] } | { reason: string }> {
  return page.evaluate(async (exporterId) => {
    const reg = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            exporters?: {
              list: () => Array<{
                id: string;
                export: () =>
                  | Promise<{ bytes: Uint8Array } | null>
                  | { bytes: Uint8Array }
                  | null;
              }>;
            };
          };
        };
      }
    ).__canvas.registries.exporters;
    if (!reg) return { reason: "host serves no exporter registry" };
    const exp = reg.list().find((e) => e.id === exporterId);
    if (!exp) return { reason: `exporter ${exporterId} not registered` };
    const result = await exp.export();
    if (!result) return { reason: "exporter returned null" };
    const b = result.bytes;
    return { byteLength: b.length, magic: [b[0], b[1], b[2], b[3]] };
  }, id);
}

/** Ingest by PLACING an image into a frame and adjusting the selection.
 *
 *  This is deliberately NOT `designer.importImage()`, and the difference
 *  cost an afternoon: both routes put pixels in the session, but only this
 *  one binds `source.elementId` to a page element. Every frame-fit tool —
 *  brush, pencil, eraser, crop — resolves its page↔image transform through
 *  `resolveFrameFit(host, session.state().source)`, which returns null
 *  without that id, and the gesture's `onPointerDown` then returns early.
 *  A stroke driven after a bare `importImage` is silently dropped: no
 *  error, no dab, a 0-pixel diff. */
async function place(
  designer: Designer,
  _page: Page,
  id: string | null = null,
): Promise<string> {
  await designer.open();
  await designer.newDocument();
  const frame =
    id ?? (await designer.drawRectangle({ x0: 90, y0: 120, x1: 350, y1: 320 }));
  expect(frame, "drew a target frame").not.toBe("");
  expect(await designer.placeImageLink(frame), "placed a real image link").toBe(
    true,
  );
  await designer.serveTiledImage(frame);
  await designer.selectElement("rectangle", frame);
  await designer.runCommand("media.paged.image.command.adjustSelected");
  await designer.openPanel(ADJ_PANEL);
  return frame;
}

/** The session-only route: decodes into the panel without binding an
 *  element. Fine for panel-driven work (adjust, fill, layers), wrong for
 *  anything that needs a frame fit — see {@link place}. */
async function ingest(
  designer: Designer,
  page: Page,
  name: string,
): Promise<void> {
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
}

test.describe("journey · paged.image paint", () => {
  test("the brush, pencil and eraser reach the host rail and carry their options @feat:image.editor.paint @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await ingest(designer, page, "paint-sample.png");

    // ── 1. ALL THREE PAINT TOOLS ARE REGISTERED. The catalog prices Brush,
    //    Pencil and Eraser as separate P0 rows, so assert them separately
    //    rather than asserting "some paint tool exists". ──
    const tools = await registeredTools(page);
    for (const [name, id] of Object.entries(TOOL)) {
      expect(tools, `the ${name} tool reached the host rail`).toContain(id);
    }

    // ── 2. THE BRUSH SECTION IS REAL. Colour, blend and pressure are the
    //    dab model's inputs — the panel exposing them is what makes the
    //    engine reachable by a designer rather than only by a test. ──
    for (const hook of ["color", "blend", "pressure"] as const) {
      await expect(
        page.locator(`[data-image-brush-${hook}]`),
        `the brush ${hook} control is present`,
      ).toHaveCount(1);
    }
  });

  // This test was a `fixme` for a while and cost two real findings, both
  // worth keeping because each failed SILENTLY — no error, no dab, a
  // 0-pixel diff:
  //
  //   1. A PLUGIN BUG, now fixed. `importBytes` decoded with
  //      `elementId: null`, so the session held pixels no page element
  //      owned. Every frame-fit tool (brush, pencil, eraser, crop)
  //      resolves through `resolveFrameFit(host, session.state().source)`,
  //      which returns null without that id, and `onPointerDown` then
  //      returns before opening a stroke. The importer now binds the
  //      selected frame the way `ingestSelection` always did.
  //   2. A TEST BUG. `drawRectangle` takes DOCUMENT pt and converts
  //      through `screenPoint`; driving the mouse with raw page
  //      coordinates paints somewhere else entirely. Any journey mixing
  //      the two spaces measures a confident zero.
  //
  // The hover-settle below is real too: `onActivate` resolves the fit with
  // a non-awaited `void ensureFit()`, so a drag issued immediately after
  // arming can still be dropped.
  test("a painted stroke changes the image @feat:image.editor.paint @feat:image.editor.layers @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await ingest(designer, page, "stroke-sample.png");

    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "every dab is a WGSL dispatch (no CPU paint path), so a stroke cannot mark pixels on this lane. The tool-registration half runs here; use `pnpm --filter paged-canvas test:journeys:gpu` for the painted stroke",
      );
    }

    // The placed image already renders (placeImageLink + serveTiledImage),
    // so the baseline needs no Apply — and Apply is DISABLED here anyway,
    // since it commits pending adjustments and a stroke is not one.
    const before = await designer.renderBytes();

    // A plugin tool is armed through its contributed activation command
    // (`paged.tool.activate.<id>` -> tool.setBaseTool); `designer.activate`
    // drives the canvas spine's BUILT-IN tools and does not reach a bundle
    // tool — the same note image-crop carries.
    await designer
      .runCommand(`paged.tool.activate.${TOOL.brush}`)
      .catch(() => {});

    // COORDINATES: `drawRectangle` takes DOCUMENT pt and converts through
    // `screenPoint`, so driving the mouse with raw page coordinates paints
    // somewhere else entirely — which is what made the first version of
    // this test measure 0 pixels. Convert the same way, and stay well
    // inside the frame's 90,120-360,320 pt rect.
    const path = await Promise.all(
      [
        [150, 180],
        [190, 210],
        [230, 190],
        [270, 220],
        [300, 200],
      ].map(([x, y]) => screenPoint(page, x, y)),
    );

    // `onActivate` resolves the frame fit ASYNCHRONOUSLY (`void
    // ensureFit()`) and `onPointerDown` returns early while it is null, so
    // hover first and let it land before pressing.
    await page.mouse.move(path[0].x, path[0].y);
    await page.waitForTimeout(750);

    await page.mouse.down();
    for (const pt of path.slice(1)) {
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(60);
    }
    await page.mouse.up();

    // The stroke commits per GESTURE (Stage-B per-drag is deferred by
    // ADR-018), so the composite lands after pointer-up.
    await expect
      .poll(
        async () =>
          designer.renderDiffPixels(before, await designer.renderBytes()),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(64);
  });

  test("the save-back exporters re-encode the source, and PSD declines a non-PSD source @feat:image.io.save-back @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await ingest(designer, page, "saveback-sample.png");

    // Exporter REGISTRATION and byte emission are host wiring — no GPU
    // needed, so this whole test runs on both lanes.

    // ── PNG / JPEG — "the adjusted result re-encoded in the REQUESTED
    //    format (whatever the source was)", so both must produce bytes
    //    from this PNG source, each with its own signature. Asserting the
    //    magic rather than just a length is what distinguishes a real
    //    encode from a buffer that happens to be non-empty. ──
    const png = await runExporter(page, EXPORTER.png);
    expect(png, "the PNG exporter produced bytes").not.toHaveProperty("reason");
    if (!("reason" in png)) {
      expect(png.byteLength).toBeGreaterThan(0);
      expect(
        png.magic.slice(0, 4),
        "the PNG export starts with the PNG signature",
      ).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }

    const jpeg = await runExporter(page, EXPORTER.jpeg);
    expect(jpeg, "the JPEG exporter produced bytes").not.toHaveProperty(
      "reason",
    );
    if (!("reason" in jpeg)) {
      expect(jpeg.byteLength).toBeGreaterThan(0);
      expect(jpeg.magic.slice(0, 2), "the JPEG export starts with SOI").toEqual(
        [0xff, 0xd8],
      );
    }

    // ── PSD — DECLINES, and that is the correct answer, not a gap. The
    //    PSD lane is a preservation lane: `psdExportBytes()` returns null
    //    unless the session holds a parsed PSD (`state.psd`), because
    //    "Paged never destroys a PSD" means the writer patches an existing
    //    document rather than inventing one from a PNG. Pinned here so the
    //    day it starts emitting bytes for a non-PSD source, someone has to
    //    decide that deliberately. ──
    const psd = await runExporter(page, EXPORTER.psd);
    // eslint-disable-next-line no-console
    console.log(`[journey] paged.image PSD export -> ${JSON.stringify(psd)}`);
    expect(psd, "the PSD exporter IS registered").not.toEqual({
      reason: `exporter ${EXPORTER.psd} not registered`,
    });
    expect(
      psd,
      "PSD export declines a PNG source rather than fabricating a PSD",
    ).toEqual({ reason: "exporter returned null" });
  });
});
