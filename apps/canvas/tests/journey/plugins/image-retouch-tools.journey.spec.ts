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

// Journey: the paged.image rail tools that had no journey — move, paint
// bucket, gradient, red eye, the toning trio (dodge / burn / sponge), the
// blur and sharpen brushes, the spot healing brush and the patch tool.
//
// Each tool is armed through its contributed activation command and
// driven by a real gesture on the frame, in document pt converted through
// `screenPoint` (the space `drawRectangle` takes).
//
// LANE SPLIT. Every one of these writes pixels through a WGSL dispatch and
// no CPU path ships, so the PIXEL proof — the page render changes, and the
// edit is one journal step — runs on the GPU lane. What the CPU lane CAN
// prove is that the gesture got all the way through: the tool armed, its
// frame fit resolved, the press reached the session, and the session
// refused it by name ("Paint bucket is a GPU-only kernel", "painting is
// GPU-only"). A tool that registered but whose gesture died earlier — the
// shape of the rail's old dead-affordance defect — produces no line at
// all, so the refusal is a real assertion, not a formality.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";
import {
  FRAME,
  armTool,
  clickPt,
  compositeBaseline,
  dragPt,
  ingest,
  primeStatus,
  settledRender,
  statusText,
  undoDepth,
} from "./image-helpers";

type Page = import("@playwright/test").Page;

const TOOL = {
  move: "media.paged.image.tool.move",
  bucket: "media.paged.image.tool.bucket",
  gradient: "media.paged.image.tool.gradient",
  redEye: "media.paged.image.tool.redEye",
  dodge: "media.paged.image.tool.dodge",
  burn: "media.paged.image.tool.burn",
  sponge: "media.paged.image.tool.sponge",
  blur: "media.paged.image.tool.blur",
  sharpen: "media.paged.image.tool.sharpen",
  spotHeal: "media.paged.image.tool.spotHeal",
  patch: "media.paged.image.tool.patch",
  marqueeRect: "media.paged.image.tool.marqueeRect",
} as const;

/** A short scribble across the middle of the frame. */
const STROKE: Array<[number, number]> = [
  [FRAME.x0 + 50, FRAME.y0 + 60],
  [FRAME.x0 + 90, FRAME.y0 + 90],
  [FRAME.x0 + 130, FRAME.y0 + 70],
  [FRAME.x0 + 170, FRAME.y0 + 100],
  [FRAME.x0 + 200, FRAME.y0 + 80],
];

/**
 * GPU lane: the gesture is one journal step and the page render moves.
 * Returns the settled render the next step measures against.
 */
async function expectEdit(
  designer: Designer,
  page: Page,
  before: Uint8Array,
  depth: number,
  what: string,
): Promise<Uint8Array> {
  await expect
    .poll(() => undoDepth(page), { timeout: 30_000, message: `${what} is one journal step` })
    .toBeGreaterThan(depth);
  await designer.expectRenderChangesFrom(before, { timeout: 20_000 });
  return settledRender(designer, page);
}

/** CPU lane: after a primed status, the gesture's refusal names it. */
async function expectRefusal(page: Page, line: string): Promise<void> {
  await expect.poll(() => statusText(page), { timeout: 15_000 }).toContain(line);
}

test.describe("journey · paged.image retouch tools", () => {
  test("move, paint bucket, gradient and red eye each edit the image from a gesture on the frame @feat:image.editor.move-tool @feat:image.editor.paint-bucket @feat:image.editor.gradient-tool @feat:image.editor.red-eye @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(5 * 60_000);
    const designer = new Designer(page);
    // A red pupil on grey: the only image where red eye has red to find,
    // and flat enough grey for the bucket to flood.
    const { empty } = await ingest(designer, page, "tools-sample.png", "red-eye");
    const gpu = await designer.gpuActive();
    let before = gpu ? await compositeBaseline(designer, page, empty) : null;

    const cx = (FRAME.x0 + FRAME.x1) / 2;
    const cy = (FRAME.y0 + FRAME.y1) / 2;
    const steps: Array<{
      tool: string;
      what: string;
      refusal: string;
      act: () => Promise<void>;
    }> = [
      {
        // Red eye first, while the pupil is still red: a box round the
        // centre darkens it.
        tool: TOOL.redEye,
        what: "red eye",
        refusal: "Red eye is a GPU-only kernel",
        act: () =>
          dragPt(page, [
            [cx - 45, cy - 45],
            [cx, cy],
            [cx + 45, cy + 45],
          ]),
      },
      {
        // No selection: the drag moves the whole active layer.
        tool: TOOL.move,
        what: "move",
        refusal: "Move is a GPU-only kernel",
        act: () =>
          dragPt(page, [
            [cx, cy],
            [cx + 20, cy + 10],
            [cx + 40, cy + 20],
          ]),
      },
      {
        // Near a corner, on the grey skin.
        tool: TOOL.bucket,
        what: "paint bucket",
        refusal: "Paint bucket is a GPU-only kernel",
        act: () => clickPt(page, cx + 70, cy + 60),
      },
      {
        tool: TOOL.gradient,
        what: "gradient",
        refusal: "Gradient is a GPU-only kernel",
        act: () =>
          dragPt(page, [
            [FRAME.x0 + 30, cy],
            [cx, cy],
            [FRAME.x1 - 30, cy],
          ]),
      },
    ];

    for (const s of steps) {
      await armTool(designer, s.tool);
      if (!before) {
        await primeStatus(designer, page);
        await s.act();
        await expectRefusal(page, s.refusal);
        continue;
      }
      const depth = await undoDepth(page);
      await s.act();
      before = await expectEdit(designer, page, before, depth, s.what);
    }
    if (!gpu) {
      test.skip(
        true,
        "all four write pixels through WGSL kernels (no CPU path); arming, frame fit and the gesture→session refusal ran on this lane. Run `pnpm --filter paged-canvas test:journeys:gpu` for the pixels",
      );
    }
  });

  test("dodge, burn and sponge tone the image under the stroke @feat:image.editor.dodge-burn @feat:image.editor.paint @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(5 * 60_000);
    const designer = new Designer(page);
    // Flat mid-tone colour blocks: room to lighten, to darken, and
    // saturation for the sponge to take away.
    const { empty } = await ingest(designer, page, "tone-sample.png", "blocks");
    const gpu = await designer.gpuActive();
    let before = gpu ? await compositeBaseline(designer, page, empty) : null;

    // The options are on the panel whichever tool is in hand.
    await expect(page.locator("[data-image-tone-title]")).toBeVisible();
    await expect(page.locator("[data-image-tone-range]")).toHaveCount(1);
    await expect(page.locator("[data-image-tone-exposure]")).toHaveCount(1);
    await expect(page.locator("[data-image-tone-sponge]")).toHaveCount(1);

    for (const [tool, what] of [
      [TOOL.dodge, "dodge"],
      [TOOL.burn, "burn"],
      [TOOL.sponge, "sponge"],
    ] as const) {
      await armTool(designer, tool);
      if (!before) {
        await primeStatus(designer, page);
        await dragPt(page, STROKE);
        await expectRefusal(page, "painting is GPU-only");
        continue;
      }
      const depth = await undoDepth(page);
      await dragPt(page, STROKE);
      before = await expectEdit(designer, page, before, depth, what);
    }
    if (!gpu) {
      test.skip(
        true,
        "toning strokes are GPU dabs (no CPU path); arming, frame fit and the stroke→session refusal ran on this lane. Run `pnpm --filter paged-canvas test:journeys:gpu` for the pixels",
      );
    }
  });

  test("the blur and sharpen brushes rewrite the stroked pixels @feat:image.editor.blur-sharpen-brush @feat:image.editor.paint @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(5 * 60_000);
    const designer = new Designer(page);
    // Noise: a blur on a smooth ramp stays inside the differ's tolerance;
    // on noise it cannot.
    const { empty } = await ingest(designer, page, "brush-filter-sample.png", "noise");
    const gpu = await designer.gpuActive();
    let before = gpu ? await compositeBaseline(designer, page, empty) : null;

    // Each on its own band of the frame, so the sharpen does not only
    // re-touch pixels the blur already settled.
    const band = (dy: number): Array<[number, number]> =>
      STROKE.map(([x, y]) => [x, y + dy - 40]);
    for (const [tool, what, path] of [
      [TOOL.blur, "blur brush", band(0)],
      [TOOL.sharpen, "sharpen brush", band(90)],
    ] as const) {
      await armTool(designer, tool);
      if (!before) {
        await primeStatus(designer, page);
        await dragPt(page, path);
        await expectRefusal(page, "painting is GPU-only");
        continue;
      }
      const depth = await undoDepth(page);
      await dragPt(page, path);
      before = await expectEdit(designer, page, before, depth, what);
    }
    if (!gpu) {
      test.skip(
        true,
        "the brush filters are GPU dabs (no CPU path); arming, frame fit and the stroke→session refusal ran on this lane. Run `pnpm --filter paged-canvas test:journeys:gpu` for the pixels",
      );
    }
  });

  test("the spot healing brush removes a blemish it is dragged over @feat:image.editor.spot-heal @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(4 * 60_000);
    const designer = new Designer(page);
    // The tool's own use case: one dark spot on a smooth image. The source
    // search needs an offset that clears the WHOLE stroke, so the stroke
    // is short — a long scribble across noise can leave the search with
    // no clear source (see the note at the end of this file).
    const { empty } = await ingest(designer, page, "blemish-sample.png", "blemish");
    const gpu = await designer.gpuActive();
    const before = gpu ? await compositeBaseline(designer, page, empty) : null;

    await armTool(designer, TOOL.spotHeal);
    const over: Array<[number, number]> = [
      [215, 220],
      [225, 220],
      [235, 220],
    ];
    if (!before) {
      await primeStatus(designer, page);
      await dragPt(page, over);
      await expectRefusal(page, "painting is GPU-only");
      test.skip(
        true,
        "the heal is a GPU composite (no CPU path); arming, frame fit and the stroke→session refusal ran on this lane. Run `pnpm --filter paged-canvas test:journeys:gpu` for the pixels",
      );
    }
    const depth = await undoDepth(page);
    await dragPt(page, over);
    // The heal lands on release, after the engine searches its source.
    await expectEdit(designer, page, before!, depth, "spot heal");
  });

  test("the patch tool asks for a selection, then replaces it from where it is dragged @feat:image.editor.patch @feat:image.selection.mask-tools @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(4 * 60_000);
    const designer = new Designer(page);
    // Noise, not flat blocks: the patch HEALS what it copies into its
    // surroundings, and a flat source healed into a flat surround comes
    // back as the surround — a correct patch that no differ can see.
    const { empty } = await ingest(designer, page, "patch-sample.png", "noise");
    const gpu = await designer.gpuActive();
    const before = gpu ? await compositeBaseline(designer, page, empty) : null;

    // ── 1. NO SELECTION — the tool says what it needs instead of doing
    //    nothing. This is session logic ahead of any kernel, so it is
    //    asserted on both lanes. ──
    await armTool(designer, TOOL.patch);
    await dragPt(page, [
      [FRAME.x0 + 60, FRAME.y0 + 50],
      [FRAME.x0 + 120, FRAME.y0 + 90],
    ]);
    await expectRefusal(page, "Patch needs a selection");

    // ── 2. SELECT a box in the image's upper left with the rectangular
    //    marquee (the image spans x 125–325 pt; see image-helpers). ──
    await armTool(designer, TOOL.marqueeRect);
    await dragPt(page, [
      [145, 145],
      [170, 165],
      [195, 185],
    ]);
    await expect
      .poll(() => page.locator("[data-image-selection-bounds]").count(), {
        timeout: 15_000,
        message: "the marquee made a selection",
      })
      .toBe(1);

    // ── 3. PATCH — drag it down and right, still inside the image: the
    //    selected area is replaced from there (and healed into its
    //    surroundings). ──
    await armTool(designer, TOOL.patch);
    const drag: Array<[number, number]> = [
      [170, 165],
      [215, 205],
      [260, 245],
    ];
    if (!before) {
      await primeStatus(designer, page);
      await dragPt(page, drag);
      await expectRefusal(page, "Patch is a GPU-only kernel");
      test.skip(
        true,
        "the patch is a GPU kernel (no CPU path); the no-selection refusal, the marquee and the drag→session refusal ran on this lane. Run `pnpm --filter paged-canvas test:journeys:gpu` for the pixels",
      );
    }
    const depth = await undoDepth(page);
    await dragPt(page, drag);
    await expect
      .poll(() => statusText(page), { timeout: 20_000 })
      .toContain("Patch applied");
    await expectEdit(designer, page, before!, depth, "patch");
  });
});

// NOTE — the spot healing brush on noise. The first version of the spot-heal
// step dragged a long scribble across a NOISE image. The stroke was
// journaled (undo depth +1) and the status line said "Painted 15 dabs into
// layer “Background” — undoable", yet the page did not change by a single
// pixel. That is what the engine's `brush_stroke_commit` does when
// `resolve_spot_heal` returns `false` ("the search finds no source that
// clears the hole"): the result is ignored, so a heal that found nothing
// still spends an undo step and the session reports a paint. The
// step above uses the tool's real case (a short stroke over one blemish);
// the silent no-op is reported to the plugin rather than encoded here.
