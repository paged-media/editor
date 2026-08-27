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

// The contact sheet and the heroes — B-Body spread p58–p59.
//
// Verso: eight identical base tiles (a vermilion rounded square on a
// Paper Warm ground plate), one per effect family, each wearing that
// family's FULL battery at expressive settings — the settings live in
// effect-families.ts, which doubles as the path checklist.
//
// Recto: two hero compositions that layer families instead of isolating
// them — display type wearing shadow and glow on a slate field, then
// feathered forms sinking into a tinted band — plus the gradient
// feather (frameGradientFeather, the whole-struct ninth instrument) as
// its own exhibit.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { CHAR, LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import {
  EFFECT_FAMILIES,
  batteryOps,
  type EffectSwatches,
} from "./effect-families";

const VERSO = p(58);
const RECTO = p(59);

/** Rounded-corner writes for the contact-sheet square (IDML corner
 *  tokens; option + radius per corner, the shape the live-corner
 *  presets bake). */
function roundedCornerOps(
  kind: string,
  id: string,
): Array<{ op: string; args: unknown }> {
  const corners = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"];
  return corners.flatMap((c) => [
    {
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: `frameCornerOption${c}`,
        value: { type: "text", value: "RoundedCorner" },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: `frameCornerRadius${c}`,
        value: { type: "length", value: 10 },
      },
    },
  ]);
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const versoId = ctx.pageIds[0];
  const rectoId = ctx.pageIds[1];
  const elements: string[] = [];

  const sw: EffectSwatches = {
    ink: await doc.swatch(SWATCH.ink),
    vermilion: await doc.swatch(SWATCH.vermilion),
    paperWarm: await doc.swatch(SWATCH.paperWarm),
    slate: await doc.swatch(SWATCH.slate),
  };
  const contentLayer = await doc.layerId(LAYER.content);

  const setOn = (kind: string, id: string, path: string, value: unknown) => ({
    op: "setElementProperty",
    args: { elementId: { kind, id }, path, value },
  });
  const onContent = (kind: string, id: string) =>
    setOn(kind, id, "itemLayer", { type: "text", value: contentLayer });

  // ── verso: the contact sheet ────────────────────────────────────
  const head = await proseFrame(ctx, VERSO, [60, 54, 492, 88], [
    { text: "Eight families, one square", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  for (const [i, family] of EFFECT_FAMILIES.entries()) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 60 + col * (210 + 12);
    const y = 100 + row * 128;

    // The ground plate delimits the tile; the square carries the family.
    elements.push(
      await plate(ctx, VERSO, [x, y, x + 210, y + 100], SWATCH.paperWarm),
    );
    const square = await doc.rectangle(versoId, [
      x + 73,
      y + 18,
      x + 137,
      y + 82,
    ]);
    elements.push(square);
    await doc.batch([
      setOn("rectangle", square, "frameFillColor", {
        type: "colorRef",
        value: sw.vermilion,
      }),
      ...roundedCornerOps("rectangle", square),
      ...batteryOps("rectangle", square, family.base(sw)),
      onContent("rectangle", square),
    ]);

    const label = await proseFrame(
      ctx,
      VERSO,
      [x, y + 103, x + 210, y + 123],
      [
        {
          text: family.label,
          style: STYLE.caption,
          charRanges: [
            { start: 0, end: family.label.length, style: CHAR.smallCaps },
          ],
        },
      ],
    );
    elements.push(label.frameId);
  }

  elements.push(
    await specLabel(ctx, VERSO, [
      "Specimen No. 85",
      "8 families · the full battery each",
      "frameDropShadow* / frameInnerShadow* / frameOuterGlow* / frameInnerGlow*",
      "frameBevel* / frameSatin* / frameFeather* / frameDirectionalFeather*",
    ]),
  );

  // ── recto: the heroes ───────────────────────────────────────────
  const headR = await proseFrame(ctx, RECTO, [48, 54, 480, 88], [
    { text: "Effects in anger", style: STYLE.head1 },
  ]);
  elements.push(headR.frameId);

  // Hero one — display type wearing shadow and glow on a slate field.
  // The glow is Screen + paper-warm because the ground is DARK here;
  // the contact sheet's multiply-slate recipe would vanish.
  elements.push(
    await plate(ctx, RECTO, [48, 100, 480, 320], SWATCH.slate, LAYER.content),
  );
  const umbra = await proseFrame(ctx, RECTO, [84, 128, 456, 264], [
    { text: "Umbra", style: STYLE.chapterNumber },
  ]);
  elements.push(umbra.frameId);
  await doc.batch([
    setOn("textFrame", umbra.frameId, "frameDropShadow", {
      type: "bool",
      value: true,
    }),
    setOn("textFrame", umbra.frameId, "frameDropShadowMode", {
      type: "text",
      value: "Drop",
    }),
    setOn("textFrame", umbra.frameId, "frameDropShadowXOffset", {
      type: "length",
      value: 6,
    }),
    setOn("textFrame", umbra.frameId, "frameDropShadowYOffset", {
      type: "length",
      value: 8,
    }),
    setOn("textFrame", umbra.frameId, "frameDropShadowSize", {
      type: "length",
      value: 12,
    }),
    setOn("textFrame", umbra.frameId, "frameDropShadowOpacity", {
      type: "length",
      value: 85,
    }),
    setOn("textFrame", umbra.frameId, "frameDropShadowColor", {
      type: "colorRef",
      value: sw.ink,
    }),
    setOn("textFrame", umbra.frameId, "frameOuterGlowEnabled", {
      type: "bool",
      value: true,
    }),
    setOn("textFrame", umbra.frameId, "frameOuterGlowBlendMode", {
      type: "text",
      value: "Screen",
    }),
    setOn("textFrame", umbra.frameId, "frameOuterGlowColor", {
      type: "colorRef",
      value: sw.paperWarm,
    }),
    setOn("textFrame", umbra.frameId, "frameOuterGlowOpacity", {
      type: "length",
      value: 90,
    }),
    setOn("textFrame", umbra.frameId, "frameOuterGlowSpread", {
      type: "length",
      value: 15,
    }),
    setOn("textFrame", umbra.frameId, "frameOuterGlowSize", {
      type: "length",
      value: 16,
    }),
  ]);
  // The bevelled moon — two more families layered on one oval.
  const moon = await doc.oval(rectoId, [344, 136, 452, 244]);
  elements.push(moon);
  await doc.batch([
    setOn("oval", moon, "frameFillColor", {
      type: "colorRef",
      value: sw.vermilion,
    }),
    ...batteryOps(
      "oval",
      moon,
      EFFECT_FAMILIES.find((f) => f.key === "bevel-emboss")!.base(sw),
    ),
    ...batteryOps(
      "oval",
      moon,
      EFFECT_FAMILIES.find((f) => f.key === "satin")!.base(sw),
    ),
    onContent("oval", moon),
  ]);
  const capHero1 = await proseFrame(ctx, RECTO, [48, 324, 480, 346], [
    {
      text: "Display type carrying drop shadow and a screened glow; the moon layers bevel and satin on one oval.",
      style: STYLE.caption,
    },
  ]);
  elements.push(capHero1.frameId);

  // Hero two — feathered forms sinking into a tinted band.
  elements.push(
    await plate(ctx, RECTO, [48, 358, 480, 538], SWATCH.vermilionTint, LAYER.content),
  );
  const cloud = await doc.oval(rectoId, [76, 378, 268, 518]);
  const veil = await doc.rectangle(rectoId, [232, 390, 452, 508]);
  elements.push(cloud, veil);
  await doc.batch([
    setOn("oval", cloud, "frameFillColor", {
      type: "colorRef",
      value: sw.slate,
    }),
    setOn("oval", cloud, "frameFeatherEnabled", { type: "bool", value: true }),
    setOn("oval", cloud, "frameFeatherWidth", { type: "length", value: 18 }),
    setOn("oval", cloud, "frameFeatherCornerType", {
      type: "text",
      value: "Diffusion",
    }),
    setOn("rectangle", veil, "frameFillColor", {
      type: "colorRef",
      value: sw.vermilion,
    }),
    setOn("rectangle", veil, "frameDirectionalFeatherEnabled", {
      type: "bool",
      value: true,
    }),
    setOn("rectangle", veil, "frameDirectionalFeatherTopWidth", {
      type: "length",
      value: 24,
    }),
    setOn("rectangle", veil, "frameDirectionalFeatherBottomWidth", {
      type: "length",
      value: 24,
    }),
    setOn("rectangle", veil, "frameDirectionalFeatherLeftWidth", {
      type: "length",
      value: 4,
    }),
    setOn("rectangle", veil, "frameDirectionalFeatherRightWidth", {
      type: "length",
      value: 4,
    }),
    setOn("rectangle", veil, "frameInnerShadowEnabled", {
      type: "bool",
      value: true,
    }),
    setOn("rectangle", veil, "frameInnerShadowBlendMode", {
      type: "text",
      value: "Multiply",
    }),
    setOn("rectangle", veil, "frameInnerShadowColor", {
      type: "colorRef",
      value: sw.ink,
    }),
    setOn("rectangle", veil, "frameInnerShadowOpacity", {
      type: "length",
      value: 70,
    }),
    setOn("rectangle", veil, "frameInnerShadowAngle", {
      type: "length",
      value: 90,
    }),
    setOn("rectangle", veil, "frameInnerShadowDistance", {
      type: "length",
      value: 8,
    }),
    setOn("rectangle", veil, "frameInnerShadowSize", {
      type: "length",
      value: 14,
    }),
    onContent("oval", cloud),
    onContent("rectangle", veil),
  ]);
  const capHero2 = await proseFrame(ctx, RECTO, [48, 542, 480, 564], [
    {
      text: "A feathered slate cloud and a vermilion veil losing its top and bottom edges to the directional feather, shaded from within.",
      style: STYLE.caption,
    },
  ]);
  elements.push(capHero2.frameId);

  // The ninth instrument — gradient feather, whole-struct.
  const fade = await doc.rectangle(rectoId, [48, 576, 480, 614]);
  elements.push(fade);
  await doc.batch([
    setOn("rectangle", fade, "frameFillColor", {
      type: "colorRef",
      value: sw.vermilion,
    }),
    setOn("rectangle", fade, "frameGradientFeather", {
      type: "gradientFeather",
      value: {
        gradientType: "Linear",
        angleDeg: 0,
        stops: [
          { stopColor: null, locationPct: 0, alphaPct: 100, midpointPct: 50 },
          { stopColor: null, locationPct: 100, alphaPct: 0, midpointPct: 50 },
        ],
      },
    }),
    onContent("rectangle", fade),
  ]);
  const capFade = await proseFrame(ctx, RECTO, [48, 618, 480, 638], [
    {
      text: "frameGradientFeather — the fade is alpha, not ink: one bar, opaque to absent.",
      style: STYLE.caption,
    },
  ]);
  elements.push(capFade.frameId);

  elements.push(
    await specLabel(ctx, RECTO, [
      "Specimen No. 86",
      "frameGradientFeather · whole-struct",
      "textFrame effects · layered families",
    ]),
  );

  return {
    title: "The contact sheet and the heroes",
    covers: [
      "effects-transparency.drop-shadow",
      "effects-transparency.inner-shadow",
      "effects-transparency.glows",
      "effects-transparency.bevel-emboss",
      "effects-transparency.satin",
      "effects-transparency.feather",
      "effects-transparency.gradient-feather",
    ],
    elements,
  };
}
