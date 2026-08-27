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

// The parameter table — p60. For each of the eight families, a row of
// four small squares: every square wears the family's full base
// battery (effect-families.ts — the same settings as the contact
// sheet), with exactly ONE knob overridden per square. Read across a
// row and you see what one path buys.
//
// Two margin notes live on this page, stacked clear of the folio: a
// transparency group's raster bounds are the frame's geometry padded
// half a point (wide overhangs can clip in raster while PDF keeps
// them), and the satin-invert record — the registry says the
// rasterizer ignores the flag, but this plate's inverted square
// prints visibly darker, so the note records the drift rather than
// repeating the stale row.

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { CHAR, CONDITION, LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import {
  EFFECT_FAMILIES,
  batteryOps,
  type EffectSwatches,
} from "./effect-families";

const PAGE = p(60);

/**
 * A second honesty note with an explicit box — annual-support's
 * marginNote owns one slot (y 690) and would overlap itself if this
 * page called it twice; the second note stacks just above the
 * spec-label band, same style, condition and layer discipline.
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

  const head = await proseFrame(ctx, PAGE, [60, 54, 492, 86], [
    { text: "One parameter at a time", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // Table geometry: label column at 60, four 60 pt tile cells from
  // x 190, 64 pt row pitch — tight enough that the stacked notes
  // below clear the master's folio band at y 647.
  const ROW_Y0 = 96;
  const ROW_PITCH = 64;
  const TILE_X0 = 190;
  const TILE_PITCH = 68;

  for (const [r, family] of EFFECT_FAMILIES.entries()) {
    const y = ROW_Y0 + r * ROW_PITCH;

    const rowLabel = await proseFrame(ctx, PAGE, [60, y, 182, y + 58], [
      {
        text: family.label,
        style: STYLE.caption,
        charRanges: [
          { start: 0, end: family.label.length, style: CHAR.smallCaps },
        ],
      },
    ]);
    elements.push(rowLabel.frameId);

    for (const [j, variant] of family.variants(sw).entries()) {
      const tx = TILE_X0 + j * TILE_PITCH;
      const square = await doc.rectangle(pageId, [
        tx + 10,
        y,
        tx + 50,
        y + 40,
      ]);
      elements.push(square);
      await doc.batch([
        setOn("rectangle", square, "frameFillColor", {
          type: "colorRef",
          value: sw.vermilion,
        }),
        ...batteryOps("rectangle", square, family.base(sw)),
        // The one knob this square turns.
        setOn(
          "rectangle",
          square,
          variant.write.path,
          variant.write.value,
        ),
        setOn("rectangle", square, "itemLayer", {
          type: "text",
          value: contentLayer,
        }),
      ]);
      const value = await proseFrame(
        ctx,
        PAGE,
        [tx, y + 42, tx + 64, y + 58],
        [{ text: variant.label, style: STYLE.specValue }],
      );
      elements.push(value.frameId);
    }
  }

  // ── the two recorded limits ─────────────────────────────────────
  elements.push(
    await noteAt(
      ctx,
      [60, 608, 492, 634],
      "A transparency group's raster bounds are the frame's geometry padded half a point: a wide stroke or a generous shadow can clip in raster output while the PDF path keeps it. A recorded defect, not a policy → Appendix A.",
    ),
  );
  elements.push(
    await marginNote(
      ctx,
      PAGE,
      "The satin row's registry entry still records invert as ignored by the rasterizer (W1.8); on this build the inverted square prints visibly darker — the flag reaches the compositor now, and it is the record that has drifted → Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, PAGE, [
      "Specimen No. 87",
      "8 families × 4 variants · full battery + one knob each",
      "every frame-effect per-field path, twice over",
    ]),
  );

  return {
    title: "The parameter table",
    covers: [
      "effects-transparency.drop-shadow",
      "effects-transparency.inner-shadow",
      "effects-transparency.glows",
      "effects-transparency.bevel-emboss",
      "effects-transparency.satin",
      "effects-transparency.feather",
    ],
    elements,
    notes: [
      "satin invert: registry records it as ignored, but the inverted tile renders visibly darker on this build — record drift, margin-noted",
      "transparency-group raster bounds clip wide overhangs that PDF keeps (margin-noted, recorded defect)",
      "feather compositing darkens the vermilion fill at some width/corner settings on this build — engine render behaviour, shown as rendered",
    ],
  };
}
