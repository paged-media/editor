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
  CHAR,
  CONDITION,
  LAYER,
  STYLE,
  contentBox,
  MARGIN_BOTTOM_PT,
  TRIM_H_PT,
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
  // THREE offset spaces, deliberately — the engine's recorded offset
  // conventions (plugin-doc documented the split; the annual re-found
  // both halves visually): insertText addresses UTF-8 BYTES including
  // separators; applyStyle addresses CONTIGUOUS characters — i.e. the
  // text with paragraph separators NOT counted (an italic that started
  // one glyph late per preceding paragraph proved it). Track all,
  // never mix.
  const bytes = (t: string): number => new TextEncoder().encode(t).length;
  let byteOffset = 0;
  let contiguousOffset = 0;
  for (const [i, para] of paras.entries()) {
    const text = i === paras.length - 1 ? para.text : `${para.text}\n`;
    await doc.insertText(storyId, text, byteOffset);
    const start = contiguousOffset;
    const end = contiguousOffset + para.text.length;
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
    byteOffset += bytes(text);
    contiguousOffset += para.text.length;
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
  // The apparatus BAND: spec citations live in the deep bottom margin
  // (81 pt — the annual's designed home for them), full content width,
  // one joined line. The outside-margin sliver wrapped 6.5 pt mono
  // character-by-character; a pro moves the apparatus, not the margin.
  const cb = contentBox(pageIndex);
  const y0 = TRIM_H_PT - 46;
  const box: [number, number, number, number] = [cb[0], y0, cb[2], y0 + 15];
  const frameId = await doc.textFrame(pageId, box);
  const storyId = await doc.storyOf(pageId, box);
  const text = lines.join("  \u00b7  ");
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
  // Second line of the apparatus band (below the spec citation).
  const cb = contentBox(pageIndex);
  const y0 = TRIM_H_PT - 30;
  const box: [number, number, number, number] = [cb[0], y0, cb[2], y0 + 28];
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
  // U+25EA exists only in JetBrains Mono of the annual's palette — in
  // the note's own EB Garamond it painted tofu on every margin note in
  // the book (the appendix agent caught it compiling the ledger).
  await doc.applyStyle(
    storyId,
    0,
    1,
    await doc.characterStyle(CHAR.codeInline),
    "character",
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
