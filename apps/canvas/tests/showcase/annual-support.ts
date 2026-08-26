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

// Shared authoring vocabulary for the annual's chapter modules.
//
// The specimen conventions live here so every chapter speaks them the
// same way: spec labels sit in the OUTSIDE margin on the Annotations
// layer under the Spec-Notes condition (toggle the condition off and
// the ledger becomes a clean annual); prose lands on the Content layer;
// plates on Background. Every helper resolves names through the
// throwing lookups — a fixture drift fails on the first page that
// touches it.

import {
  CONDITION,
  LAYER,
  STYLE,
  contentBox,
  isRecto,
  MARGIN_OUTSIDE_PT,
  TRIM_W_PT,
} from "./names-annual";
import type { PageContext } from "./types";

/** A paragraph to pour: text + the paragraph style applied to it. */
export interface Para {
  text: string;
  style?: string;
  /** Character style applied to a [start, end) slice of THIS paragraph. */
  charRanges?: Array<{ start: number; end: number; style: string }>;
}

/**
 * A text frame with styled paragraphs, on the Content layer.
 * Returns the frame id and its story id.
 */
export async function proseFrame(
  ctx: PageContext,
  pageIndex: number,
  box: [number, number, number, number],
  paras: Para[],
): Promise<{ frameId: string; storyId: string }> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(pageIndex)];
  const frameId = await doc.textFrame(pageId, box);
  const storyId = await doc.storyOf(pageId, box);
  let offset = 0;
  for (const [i, para] of paras.entries()) {
    const text = i === paras.length - 1 ? para.text : `${para.text}\n`;
    await doc.insertText(storyId, text, offset);
    const start = offset;
    const end = offset + para.text.length;
    if (para.style) {
      await doc.applyStyle(
        storyId,
        start,
        end,
        await doc.paragraphStyle(para.style),
        "paragraph",
      );
    }
    for (const r of para.charRanges ?? []) {
      await doc.applyStyle(
        storyId,
        start + r.start,
        start + r.end,
        await doc.characterStyle(r.style),
        "character",
      );
    }
    offset += text.length;
  }
  await assignLayer(ctx, "textFrame", frameId, LAYER.content);
  return { frameId, storyId };
}

/**
 * The specimen label: a small mono annotation in the OUTSIDE margin,
 * Annotations layer, tagged Spec-Notes. `lines[0]` is the specimen
 * number ("Specimen No. 12"), the rest the op/path/row citations.
 */
export async function specLabel(
  ctx: PageContext,
  pageIndex: number,
  lines: string[],
): Promise<string> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(pageIndex)];
  const recto = isRecto(pageIndex);
  const x0 = recto ? TRIM_W_PT - MARGIN_OUTSIDE_PT + 4 : 8;
  const box: [number, number, number, number] = [
    x0,
    contentBox(pageIndex)[1],
    x0 + MARGIN_OUTSIDE_PT - 12,
    contentBox(pageIndex)[1] + 16 * lines.length + 8,
  ];
  const frameId = await doc.textFrame(pageId, box);
  const storyId = await doc.storyOf(pageId, box);
  const text = lines.join("\n");
  await doc.insertText(storyId, text, 0);
  await doc.applyStyle(
    storyId,
    0,
    text.length,
    await doc.paragraphStyle(STYLE.specLabel),
    "paragraph",
  );
  const conditionId = await doc.condition(CONDITION.specNotes);
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(storyId, 0, text.length),
    "appliedConditions",
    { type: "text", value: conditionId },
  );
  await assignLayer(ctx, "textFrame", frameId, LAYER.annotations);
  return frameId;
}

/**
 * A margin honesty note (◪): same placement discipline as the spec
 * label, Margin Note style, pointing at the Limits appendix.
 */
export async function marginNote(
  ctx: PageContext,
  pageIndex: number,
  text: string,
): Promise<string> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(pageIndex)];
  const recto = isRecto(pageIndex);
  const x0 = recto ? TRIM_W_PT - MARGIN_OUTSIDE_PT + 4 : 8;
  const y0 = contentBox(pageIndex)[3] - 120;
  const box: [number, number, number, number] = [
    x0,
    y0,
    x0 + MARGIN_OUTSIDE_PT - 12,
    y0 + 110,
  ];
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
  const conditionId = await ctx.doc.condition(CONDITION.specNotes);
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(storyId, 0, full.length),
    "appliedConditions",
    { type: "text", value: conditionId },
  );
  await assignLayer(ctx, "textFrame", frameId, LAYER.annotations);
  return frameId;
}

/** Assign one element to a NAMED layer (ItemLayer, protocol 62). */
export async function assignLayer(
  ctx: PageContext,
  kind: string,
  id: string,
  layerName: string,
): Promise<void> {
  const layerId = await ctx.doc.layerId(layerName);
  await ctx.doc.assignLayer(kind, id, layerId);
}

/** A filled rectangle on a named layer. `swatchName` resolves live. */
export async function plate(
  ctx: PageContext,
  pageIndex: number,
  box: [number, number, number, number],
  swatchName: string,
  layerName: string = LAYER.background,
): Promise<string> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(pageIndex)];
  const id = await doc.rectangle(pageId, box);
  await doc.setProperty("rectangle", id, "frameFillColor", {
    type: "colorRef",
    value: await doc.swatch(swatchName),
  });
  await assignLayer(ctx, "rectangle", id, layerName);
  return id;
}
