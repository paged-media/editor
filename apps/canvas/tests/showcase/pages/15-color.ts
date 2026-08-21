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

// Page 15 — colour and transparency.
//
// Four bands, each answering a question a print document has to answer:
//
//   chips     what KINDS of ink can this document carry? A process
//             CMYK build, a spot ink that must stay a named separation
//             all the way to the plate, a tint of that spot, and an RGB
//             build for the screen half of a modern job.
//   gradient  a real `<Gradient>` resource with stops naming swatches,
//             not a raster ramp — with the axis angled, which is the
//             property the Gradient Swatch tool writes.
//   blends    six blend modes over the same accent band, so the page
//             shows the DIFFERENCE between them rather than asserting
//             that a mode was stored.
//   opacity   a five-step ramp over a second band.
//
// A COLOURREF IS A SWATCH ID, NOT A COLOUR. `frameFillColor` resolves
// its value through the document's colour table; a raw hex resolves to
// nothing and the renderer leaves the frame UNPAINTED — a failure that
// looks exactly like "the rectangle was never created". So every ink on
// this page is minted as a real document swatch first and then
// RE-RESOLVED BY NAME through the swatches collection, which is both
// how the rest of the showcase addresses colour and a round-trip check
// that the mint actually landed in the collection a reader can see.

import { expect } from "@playwright/test";

import type { Bounds } from "../driver";
import { COLUMN, STYLE, SWATCH } from "../names";
import type { PageContext, PageReport } from "../types";

/** One ink the page mints and then shows as a chip. */
interface Ink {
  /** Pinned `Self` id, or null when the Designer helper mints it.
   *
   *  The apply layer honours a supplied id verbatim and refuses only a
   *  DUPLICATE, so pinning turns "which of these did I just create"
   *  from a collection-diff race into a fact. The NAME is still what
   *  everything downstream looks the swatch up by. */
  readonly selfId: string | null;
  readonly name: string;
  readonly caption: string;
  /** IDML `Space`: "CMYK" | "RGB" | "LAB" | "Gray". */
  readonly space: string;
  /** Channel values in `space` — 4 for CMYK, 3 for RGB. */
  readonly value: readonly number[];
  /** IDML `Model`: "Process" | "Spot". */
  readonly model: string;
  /** Tint percent, or null for a full-strength ink. */
  readonly tint: number | null;
  /** True → minted through the Designer's swatch helper, the door the
   *  Swatches panel uses. That helper hardcodes RGB/Process, which is
   *  why the other three go through the raw op instead. */
  readonly viaHelper: boolean;
}

/** The inks this page mints, in the order they appear as chips. */
const INKS: readonly Ink[] = [
  {
    selfId: "Color/showcaseProcessBlue",
    name: "Showcase Process Blue",
    caption: "Process · CMYK 78/34/0/6",
    space: "CMYK",
    value: [78, 34, 0, 6],
    model: "Process",
    tint: null,
    viaHelper: false,
  },
  {
    selfId: "Color/showcaseSpotEmber",
    name: "Showcase Spot Ember",
    caption: "Spot · a named separation",
    space: "CMYK",
    value: [0, 72, 88, 0],
    model: "Spot",
    tint: null,
    viaHelper: false,
  },
  {
    selfId: "Color/showcaseEmberTint",
    name: "Showcase Ember 35%",
    caption: "Tint · 35% of the spot",
    space: "CMYK",
    value: [0, 72, 88, 0],
    model: "Process",
    tint: 35,
    viaHelper: false,
  },
  {
    selfId: null,
    name: "Showcase Slate",
    caption: "Process · RGB 58/74/92",
    space: "RGB",
    value: [58, 74, 92],
    model: "Process",
    tint: null,
    viaHelper: true,
  },
];

/** The IDML blend-mode vocabulary this page demonstrates. `Normal` is
 *  first on purpose: without it the row shows five differences and no
 *  baseline to read them against. */
const BLEND_MODES = [
  "Normal",
  "Multiply",
  "Screen",
  "Overlay",
  "Darken",
  "Lighten",
] as const;

const OPACITIES = [100, 80, 60, 40, 20] as const;

const GRADIENT_NAME = "Showcase Blue to Ember";

/** Evenly split `[left, right]` into `count` cells with `gap` between. */
function lanes(
  left: number,
  right: number,
  count: number,
  gap: number,
): Array<[number, number]> {
  const width = (right - left - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => {
    const x = left + i * (width + gap);
    return [x, x + width] as [number, number];
  });
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const elements: string[] = [];

  const live = COLUMN.live;
  const [top, left, , right] = live;
  const caption = await doc.paragraphStyle(STYLE.caption);
  const accent = await doc.swatch(SWATCH.accent);

  /** A caption strip under a band. */
  const label = async (bounds: Bounds, text: string): Promise<string> => {
    const frame = await doc.textFrame(pageId, bounds);
    const story = await doc.storyOf(pageId, bounds);
    await doc.insertText(story, text);
    await doc.applyStyle(story, 0, [...text].length, caption, "paragraph");
    return frame;
  };

  // ── heading ─────────────────────────────────────────────────────
  const headingBounds: Bounds = [top, left, top + 30, right];
  const headingFrame = await doc.textFrame(pageId, headingBounds);
  const headingStory = await doc.storyOf(pageId, headingBounds);
  const headingText = "Colour and transparency";
  await doc.insertText(headingStory, headingText);
  await doc.applyStyle(
    headingStory,
    0,
    [...headingText].length,
    await doc.paragraphStyle(STYLE.heading),
    "paragraph",
  );
  elements.push(headingFrame);

  // ── 1. the inks ─────────────────────────────────────────────────
  // One `createSwatch` each. The RGB build goes through the Designer's
  // helper — the door the swatch panel uses — while the CMYK, spot and
  // tint builds go through the raw op, because that helper hardcodes
  // `space: "RGB"` / `model: "Process"` and so cannot express any of
  // the three kinds this band exists to show.
  const inkIds: string[] = [];
  for (const ink of INKS) {
    if (ink.viaHelper) {
      await doc.designer.createSwatch(ink.name, [
        ink.value[0],
        ink.value[1],
        ink.value[2],
      ]);
    } else {
      await doc.mutate("createSwatch", {
        spec: {
          selfId: ink.selfId,
          name: ink.name,
          space: ink.space,
          value: [...ink.value],
          model: ink.model,
          alternateSpace: null,
          alternateValue: [],
          tint: ink.tint,
          alpha: null,
        },
      });
    }
    // Re-resolve BY NAME. This is the oracle: a mint that did not reach
    // the collection throws here, on the page that made it, instead of
    // surfacing later as an unpainted rectangle.
    inkIds.push(await doc.swatch(ink.name));
  }

  const chipTop = top + 44;
  const chipBottom = chipTop + 60;
  const chipLanes = lanes(left, right, INKS.length, 12);
  const chipOps: Array<{ op: string; args: unknown }> = [];
  for (const [i, [x0, x1]] of chipLanes.entries()) {
    const chip = await doc.rectangle(pageId, [chipTop, x0, chipBottom, x1]);
    elements.push(chip);
    chipOps.push({
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: chip },
        path: "frameFillColor",
        value: { type: "colorRef", value: inkIds[i] },
      },
    });
  }
  await doc.batch(chipOps);
  for (const [i, [x0, x1]] of chipLanes.entries()) {
    elements.push(
      await label([chipBottom + 4, x0, chipBottom + 28, x1], INKS[i].caption),
    );
  }

  // ── 2. the gradient ─────────────────────────────────────────────
  // Stops NAME swatches (`stopColor` is a swatch id), which is why the
  // inks had to exist first. The axis angle is the property the
  // Gradient Swatch tool writes when a user drags across a frame.
  const gradientId = await doc.designer.createGradient(GRADIENT_NAME, [
    inkIds[0],
    inkIds[1],
  ]);
  const barTop = chipBottom + 56;
  const barBottom = barTop + 56;
  const bar = await doc.rectangle(pageId, [barTop, left, barBottom, right]);
  elements.push(bar);
  await doc.batch([
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: bar },
        path: "frameFillColor",
        value: { type: "colorRef", value: gradientId },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: bar },
        path: "frameGradientFillAngle",
        value: { type: "length", value: 12 },
      },
    },
  ]);
  elements.push(
    await label(
      [barBottom + 4, left, barBottom + 28, right],
      `Gradient · ${GRADIENT_NAME}, axis at 12°`,
    ),
  );

  // ── 3. blend modes ──────────────────────────────────────────────
  // Each swatch straddles the accent band's top edge, so every tile
  // shows its mode against TWO grounds — paper above, accent below.
  // A mode that composites wrongly is visible as a tile that matches
  // the Normal tile on both halves.
  const blendBandTop = barBottom + 56;
  const blendBandBottom = blendBandTop + 56;
  const blendBand = await doc.rectangle(pageId, [
    blendBandTop,
    left,
    blendBandBottom,
    right,
  ]);
  elements.push(blendBand);
  await doc.setProperty("rectangle", blendBand, "frameFillColor", {
    type: "colorRef",
    value: accent,
  });

  const blendOps: Array<{ op: string; args: unknown }> = [];
  for (const [i, [x0, x1]] of lanes(
    left,
    right,
    BLEND_MODES.length,
    10,
  ).entries()) {
    const tile = await doc.rectangle(pageId, [
      blendBandTop - 18,
      x0,
      blendBandBottom - 18,
      x1,
    ]);
    elements.push(tile);
    blendOps.push({
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: tile },
        path: "frameFillColor",
        value: { type: "colorRef", value: inkIds[1] },
      },
    });
    blendOps.push({
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: tile },
        // The IDML enum string, verbatim; an empty string would CLEAR
        // the override rather than set a default.
        path: "frameBlendMode",
        value: { type: "text", value: BLEND_MODES[i] },
      },
    });
  }
  await doc.batch(blendOps);
  elements.push(
    await label(
      [blendBandBottom + 4, left, blendBandBottom + 28, right],
      `Blend modes · ${BLEND_MODES.join(" · ")}`,
    ),
  );

  // ── 4. the opacity ramp ─────────────────────────────────────────
  const rampBandTop = blendBandBottom + 56;
  const rampBandBottom = rampBandTop + 56;
  const rampBand = await doc.rectangle(pageId, [
    rampBandTop,
    left,
    rampBandBottom,
    right,
  ]);
  elements.push(rampBand);
  await doc.setProperty("rectangle", rampBand, "frameFillColor", {
    type: "colorRef",
    value: accent,
  });

  const rampOps: Array<{ op: string; args: unknown }> = [];
  for (const [i, [x0, x1]] of lanes(
    left,
    right,
    OPACITIES.length,
    10,
  ).entries()) {
    const step = await doc.rectangle(pageId, [
      rampBandTop - 18,
      x0,
      rampBandBottom - 18,
      x1,
    ]);
    elements.push(step);
    rampOps.push({
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: step },
        path: "frameFillColor",
        value: { type: "colorRef", value: inkIds[0] },
      },
    });
    rampOps.push({
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: step },
        // Percent, 0..=100 — IDML carries transparency in % already, so
        // the value is NOT normalised to 0..1 on the way in.
        path: "frameOpacity",
        value: { type: "length", value: OPACITIES[i] },
      },
    });
    // The last step also carries a FILL TINT, so the page shows the two
    // ways a colour gets lighter — a transparent frame over what is
    // behind it, and an ink laid down at part strength. They are
    // different operations and print differently.
    if (i === OPACITIES.length - 1) {
      rampOps.push({
        op: "setElementProperty",
        args: {
          elementId: { kind: "rectangle", id: step },
          path: "frameFillTint",
          value: { type: "length", value: 40 },
        },
      });
    }
  }
  await doc.batch(rampOps);
  elements.push(
    await label(
      [rampBandBottom + 4, left, rampBandBottom + 28, right],
      `Opacity · ${OPACITIES.map((o) => `${o}%`).join(" · ")}, the last also ` +
        "at a 40% fill tint",
    ),
  );

  // Every ink this page minted is in the swatches collection under the
  // name the captions claim — the check that the page is describing
  // itself accurately.
  const swatchNames = (
    (await doc.designer.collection("swatches")) as unknown as Array<{
      name?: string;
    }>
  ).map((entry) => entry.name);
  for (const ink of INKS) {
    expect(
      swatchNames,
      `the document carries a swatch named ${ink.name}`,
    ).toContain(ink.name);
  }

  notes.push(
    "the spot ink is authored as a named separation (Model=Spot) and " +
      "round-trips as one, but this page renders it through its CMYK " +
      "alternate — a composite proof, not a separations proof. Whether the " +
      "plate stays separate is the Separations panel's evidence, not a " +
      "composite page render's.",
  );

  return {
    title: "Colour and transparency",
    covers: [
      "color-swatches.swatch.crud",
      "color-swatches.process-spot-tint",
      "color-swatches.gradients",
      "color-swatches.fill-stroke-apply",
      "effects-transparency.opacity",
      "effects-transparency.blend-modes",
      "frames-paths.frame.insert",
    ],
    elements,
    notes,
  };
}
