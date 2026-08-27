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

// Gradients, opacity, masks — p56, the closing page of Ink & Light.
//
//   · createGradient LIVE, twice: "Ink Dawn" (Linear, three stops on
//     fixture swatches) and "Ink Halo" (Radial). Stops reference
//     existing palette entries by self-id — GradientStopSpec.stopColor
//     is a Color/<id> reference, so no scratch swatches are needed.
//   · editGradient with a VISIBLE proof: the dawn band is snapshotted,
//     re-specified to end in Screen Blue, and polled for a repaint.
//   · deleteGradient on a scratch ramp — the transient pattern.
//   · Gradient geometry paths: frameGradientFillAngle/Length on the
//     fill exhibits, frameGradientStrokeAngle/Length on the stroke one.
//   · frameOpacity ramp: six vermilion chips, 100 → 10, straddling a
//     slate band so transparency reads against two grounds.
//   · applyOpacityMask BOTH modes: Luminosity (the fixture's Annual
//     Ramp as mask artwork) and Alpha (a feathered ink oval, inverted).
//     releaseOpacityMask runs on a scratch pair, transiently.
//
// Three recorded limits, three margin notes (stacked in the apparatus
// band so none overlaps): masks are certified on the CPU rasterizer,
// masks have no IDML element, and no authoring door mints a sweep/conic
// gradient (GradientSpec is Linear | Radial only).

import {
  assignLayer,
  marginNote,
  plate,
  proseFrame,
  specLabel,
} from "../../annual-support";
import {
  CONDITION,
  GRADIENT_RAMP,
  LAYER,
  STYLE,
  SWATCH,
  p,
} from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

const PAGE = p(56);

/**
 * A second/third honesty note with an explicit box — same style,
 * condition and layer discipline as annual-support's marginNote, which
 * owns exactly one slot (y 690) and would overlap itself if called
 * twice on one page. This page carries three recorded limits, so the
 * extra notes stack above the spec-label band.
 */
async function noteAt(
  ctx: PageContext,
  box: [number, number, number, number],
  text: string,
): Promise<string> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(PAGE)];
  const frameId = await doc.textFrame(pageId, box);
  const storyId = await doc.storyOf(pageId, box);
  const full = `◪ ${text}`;
  await doc.insertText(storyId, full, 0);
  await doc.applyStyle(
    storyId,
    0,
    full.length,
    await doc.paragraphStyle(STYLE.marginNote),
    "paragraph",
  );
  const conditionId = await doc.condition(CONDITION.specNotes);
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(storyId, 0, full.length),
    "appliedConditions",
    { type: "text", value: conditionId },
  );
  await assignLayer(ctx, "textFrame", frameId, LAYER.annotations);
  return frameId;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const elements: string[] = [];
  const notes: string[] = [];

  const paperWarm = await doc.swatch(SWATCH.paperWarm);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const slate = await doc.swatch(SWATCH.slate);
  const screenBlue = await doc.swatch(SWATCH.screenBlue);
  const ink = await doc.swatch(SWATCH.ink);
  const contentLayer = await doc.layerId(LAYER.content);

  const head = await proseFrame(ctx, PAGE, [60, 54, 492, 90], [
    { text: "Gradients, opacity, masks", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);
  const intro = await proseFrame(ctx, PAGE, [60, 94, 492, 150], [
    {
      text: "Everything on this page is light-work: two gradients minted on the wire while you watch, one of them edited after the fact; a ramp of vanishing vermilion; and two soft masks, one read by its luminance and one by its alpha.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // ── the gradients, minted live ──────────────────────────────────
  // Stops reference fixture swatches by self-id; the name lookup
  // afterwards is the creation proof (it throws when absent).
  await doc.mutate("createGradient", {
    spec: {
      selfId: null,
      name: "Ink Dawn",
      kind: "Linear",
      stops: [
        { stopColor: paperWarm, locationPct: 0, midpointPct: null },
        { stopColor: vermilion, locationPct: 55, midpointPct: null },
        { stopColor: slate, locationPct: 100, midpointPct: null },
      ],
    },
  });
  const dawn = await doc.gradient("Ink Dawn");
  await doc.mutate("createGradient", {
    spec: {
      selfId: null,
      name: "Ink Halo",
      kind: "Radial",
      stops: [
        { stopColor: paperWarm, locationPct: 0, midpointPct: null },
        { stopColor: vermilion, locationPct: 60, midpointPct: null },
        { stopColor: slate, locationPct: 100, midpointPct: null },
      ],
    },
  });
  const halo = await doc.gradient("Ink Halo");

  // Exhibit A — the linear band, with the fill-axis geometry paths.
  const band = await doc.rectangle(pageId, [60, 156, 492, 204]);
  elements.push(band);
  const setOn = (kind: string, id: string, path: string, value: unknown) => ({
    op: "setElementProperty",
    args: { elementId: { kind, id }, path, value },
  });
  await doc.batch([
    setOn("rectangle", band, "frameFillColor", {
      type: "colorRef",
      value: dawn,
    }),
    setOn("rectangle", band, "frameGradientFillAngle", {
      type: "length",
      value: 8,
    }),
    setOn("rectangle", band, "frameGradientFillLength", {
      type: "length",
      value: 400,
    }),
    setOn("rectangle", band, "itemLayer", {
      type: "text",
      value: contentLayer,
    }),
  ]);
  const capA = await proseFrame(ctx, PAGE, [60, 208, 492, 230], [
    {
      text: "Ink Dawn, linear — minted paper → vermilion → slate, then edited on press: the cold end you see is the editGradient, not the mint.",
      style: STYLE.caption,
    },
  ]);
  elements.push(capA.frameId);

  // Exhibit B — the radial halo on an oval.
  const haloOval = await doc.oval(pageId, [60, 238, 266, 330]);
  elements.push(haloOval);
  await doc.batch([
    setOn("oval", haloOval, "frameFillColor", {
      type: "colorRef",
      value: halo,
    }),
    setOn("oval", haloOval, "frameGradientFillLength", {
      type: "length",
      value: 110,
    }),
    setOn("oval", haloOval, "itemLayer", { type: "text", value: contentLayer }),
  ]);

  // Exhibit C — the same dawn as STROKE paint, with the stroke-axis
  // geometry paths.
  const strokeBox = await doc.rectangle(pageId, [286, 238, 492, 330]);
  elements.push(strokeBox);
  await doc.batch([
    setOn("rectangle", strokeBox, "frameFillColor", {
      type: "colorRef",
      value: paperWarm,
    }),
    setOn("rectangle", strokeBox, "frameStrokeColor", {
      type: "colorRef",
      value: dawn,
    }),
    setOn("rectangle", strokeBox, "frameStrokeWeight", {
      type: "length",
      value: 10,
    }),
    setOn("rectangle", strokeBox, "frameGradientStrokeAngle", {
      type: "length",
      value: 90,
    }),
    setOn("rectangle", strokeBox, "frameGradientStrokeLength", {
      type: "length",
      value: 160,
    }),
    setOn("rectangle", strokeBox, "itemLayer", {
      type: "text",
      value: contentLayer,
    }),
  ]);
  const capB = await proseFrame(ctx, PAGE, [60, 338, 266, 360], [
    { text: "Ink Halo, radial fill.", style: STYLE.caption },
  ]);
  const capC = await proseFrame(ctx, PAGE, [286, 338, 492, 360], [
    { text: "The dawn again, as a 10 pt gradient stroke.", style: STYLE.caption },
  ]);
  elements.push(capB.frameId, capC.frameId);

  // ── editGradient, with a pixel proof ────────────────────────────
  // Snapshot, re-specify the resident gradient, poll for the repaint:
  // the band and the stroke both swing to Screen Blue.
  const beforeEdit = await doc.renderPage(PAGE);
  await doc.mutate("editGradient", {
    gradientId: dawn,
    spec: {
      selfId: dawn,
      name: "Ink Dawn",
      kind: "Linear",
      stops: [
        { stopColor: paperWarm, locationPct: 0, midpointPct: 30 },
        { stopColor: vermilion, locationPct: 35, midpointPct: null },
        { stopColor: screenBlue, locationPct: 100, midpointPct: null },
      ],
    },
  });
  await doc.expectRenderChanged(PAGE, beforeEdit);

  // ── the opacity ramp ────────────────────────────────────────────
  // Chips straddle a slate band so every step reads against two
  // grounds — paper above, slate below.
  elements.push(await plate(ctx, PAGE, [60, 364, 492, 388], SWATCH.slate));
  const rampOps: Array<{ op: string; args: unknown }> = [];
  const chipIds: string[] = [];
  const OPACITIES = [100, 80, 60, 40, 20, 10] as const;
  for (const [i, pct] of OPACITIES.entries()) {
    const x = 60 + i * 72;
    const chip = await doc.rectangle(pageId, [x, 356, x + 56, 396]);
    chipIds.push(chip);
    rampOps.push(
      setOn("rectangle", chip, "frameFillColor", {
        type: "colorRef",
        value: vermilion,
      }),
      setOn("rectangle", chip, "frameOpacity", {
        type: "length",
        value: pct,
      }),
      setOn("rectangle", chip, "itemLayer", {
        type: "text",
        value: contentLayer,
      }),
    );
  }
  await doc.batch(rampOps);
  elements.push(...chipIds);
  const capRamp = await proseFrame(ctx, PAGE, [60, 400, 492, 422], [
    {
      text: "frameOpacity · 100 · 80 · 60 · 40 · 20 · 10 — the same vermilion, surrendering to both grounds at once.",
      style: STYLE.caption,
    },
  ]);
  elements.push(capRamp.frameId);

  // ── the opacity masks, both modes ───────────────────────────────
  // Luminosity: the fixture's own Annual Ramp (vermilion → paper) as
  // mask artwork over a vermilion plate — the plate survives where the
  // ramp runs light and dies where it runs dark.
  const lumTarget = await doc.rectangle(pageId, [60, 424, 266, 536]);
  const lumMask = await doc.rectangle(pageId, [60, 424, 266, 536]);
  elements.push(lumTarget);
  await doc.batch([
    setOn("rectangle", lumTarget, "frameFillColor", {
      type: "colorRef",
      value: vermilion,
    }),
    setOn("rectangle", lumTarget, "itemLayer", {
      type: "text",
      value: contentLayer,
    }),
    setOn("rectangle", lumMask, "frameFillColor", {
      type: "colorRef",
      value: await doc.gradient(GRADIENT_RAMP),
    }),
  ]);
  await doc.mutate("applyOpacityMask", {
    targetId: { kind: "rectangle", id: lumTarget },
    maskId: { kind: "rectangle", id: lumMask },
    maskType: "luminosity",
    invert: false,
  });

  // Alpha, inverted: a feathered ink oval punches a soft window
  // through a slate plate — the mask's alpha, not its lightness, is
  // what the compositor reads.
  const alphaTarget = await doc.rectangle(pageId, [286, 424, 492, 536]);
  const alphaMask = await doc.oval(pageId, [316, 442, 462, 520]);
  elements.push(alphaTarget);
  await doc.batch([
    setOn("rectangle", alphaTarget, "frameFillColor", {
      type: "colorRef",
      value: slate,
    }),
    setOn("rectangle", alphaTarget, "itemLayer", {
      type: "text",
      value: contentLayer,
    }),
    setOn("oval", alphaMask, "frameFillColor", {
      type: "colorRef",
      value: ink,
    }),
    setOn("oval", alphaMask, "frameFeatherEnabled", {
      type: "bool",
      value: true,
    }),
    setOn("oval", alphaMask, "frameFeatherWidth", {
      type: "length",
      value: 12,
    }),
  ]);
  await doc.mutate("applyOpacityMask", {
    targetId: { kind: "rectangle", id: alphaTarget },
    maskId: { kind: "oval", id: alphaMask },
    maskType: "alpha",
    invert: true,
  });

  const capLum = await proseFrame(ctx, PAGE, [60, 540, 266, 578], [
    {
      text: "Luminosity mask — the Annual Ramp as artwork: vermilion survives the light end, dies in the dark.",
      style: STYLE.caption,
    },
  ]);
  const capAlpha = await proseFrame(ctx, PAGE, [286, 540, 492, 578], [
    {
      text: "Alpha mask, inverted — a feathered oval punches a soft window through the slate.",
      style: STYLE.caption,
    },
  ]);
  elements.push(capLum.frameId, capAlpha.frameId);

  // ── the transient battery ───────────────────────────────────────
  // deleteGradient and releaseOpacityMask are destructive doors:
  // scratch → apply → delete, tallied transient, zero stray refs.
  const runTransient = (fn: () => Promise<void>): Promise<void> =>
    doc.ledger ? doc.ledger.transient(fn) : fn();
  await runTransient(async () => {
    await doc.mutate("createGradient", {
      spec: {
        selfId: null,
        name: "Ink Scratch",
        kind: "Linear",
        stops: [
          { stopColor: paperWarm, locationPct: 0, midpointPct: null },
          { stopColor: slate, locationPct: 100, midpointPct: null },
        ],
      },
    });
    const scratch = await doc.gradient("Ink Scratch");
    await doc.mutate("deleteGradient", { gradientId: scratch });
    const remaining = (await doc.designer.collection("gradients")) as Array<{
      selfId: string;
      name?: string;
    }>;
    if (remaining.some((g) => g.name === "Ink Scratch")) {
      throw new Error("deleteGradient left the scratch ramp in the palette");
    }

    // A scratch mask pair for releaseOpacityMask; the released items
    // are ordinary frames again, so deleteFrame can clear both.
    const a = await doc.rectangle(pageId, [400, 596, 460, 628]);
    const b = await doc.rectangle(pageId, [420, 604, 480, 636]);
    await doc.mutate("applyOpacityMask", {
      targetId: { kind: "rectangle", id: a },
      maskId: { kind: "rectangle", id: b },
      maskType: "alpha",
      invert: false,
    });
    await doc.mutate("releaseOpacityMask", {
      targetId: { kind: "rectangle", id: a },
    });
    await doc.mutate("deleteFrame", { frameId: a });
    await doc.mutate("deleteFrame", { frameId: b });
  });

  // ── the three recorded limits ───────────────────────────────────
  elements.push(
    await noteAt(
      ctx,
      [60, 584, 492, 608],
      "The renderer owns a sweep/conic gradient paint, but no authoring door mints one: GradientSpec is Linear | Radial only, and conic colour reaches a page only through paged.web's bake. Recorded, not faked → Appendix A.",
    ),
  );
  elements.push(
    await noteAt(
      ctx,
      [60, 610, 492, 636],
      "The masked pairs are certified on the CPU rasterizer, the fidelity path of record; GPU-lane soft-mask compositing arrived later, and canvases before it show these pairs unmasked → Appendix A.",
    ),
  );
  elements.push(
    await marginNote(
      ctx,
      PAGE,
      "IDML has no opacity-mask element. The .paged container keeps both pairs verbatim; the IDML twin cannot, and the export ledger names every masked item as lost — loudly, by design → Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, PAGE, [
      "Specimen No. 82",
      "createGradient ×2 · editGradient · deleteGradient",
      "frameGradientFill*/Stroke* · frameOpacity",
      "applyOpacityMask ×2 · releaseOpacityMask",
      "demonstrated, not resident",
    ]),
  );

  notes.push(
    "sweep/conic gradient paint exists in the renderer with no authoring door — GradientSpec is Linear|Radial (margin-noted)",
    "opacity masks certified on the CPU lane; IDML export names masked items as lost (margin-noted; the assembly asserts the loss list)",
  );

  return {
    title: "Gradients, opacity, masks",
    covers: [
      "color-swatches.gradients",
      "color-swatches.fill-stroke-apply",
      "effects-transparency.opacity",
      "effects-transparency.opacity-mask",
    ],
    elements,
    notes,
  };
}
