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

// Shared vocabulary for the story + scripts chapters (135/140).
//
// Geometry follows the annual contract (AUTHORING.md "Geometry
// order"): every box handed to a driver or annual-support helper is
// page-space (x0, y0, x1, y1) — the driver converts to the wire's
// IDML order internally. Raw Bounds VALUES passed directly on the
// wire (frameTextWrapOffsets, frameInsetSpacing, a frameBounds read)
// stay wire-ordered [top, left, bottom, right].
//
// What earns a place here beyond the shared helpers: pour helpers
// that keep the two text address spaces straight (insertText offsets
// are story-local BYTES; applyStyle offsets are CONTIGUOUS CHARS with
// no character between paragraphs), a caption shorthand, and the
// read doors the oracles use (story summaries, element properties).

import type { Page } from "@playwright/test";

import { script } from "../../../e2e/harness/ui";
import { assignLayer } from "../../annual-support";
import { LAYER, STYLE } from "../../names-annual";
import type { Bounds, ShowcaseDoc } from "../../driver";
import type { PageContext } from "../../types";

export function pageIdOf(ctx: PageContext, pageIndex: number): string {
  const at = ctx.pageIndexes.indexOf(pageIndex);
  if (at < 0) {
    throw new Error(`page index ${pageIndex} is not owned by this module`);
  }
  return ctx.pageIds[at];
}

/** A paragraph for {@link prose} / {@link pourParas}. */
export interface AsciiPara {
  text: string;
  style?: string;
  charRanges?: Array<{ start: number; end: number; style: string }>;
}

/**
 * Multi-paragraph prose in a fresh frame on the Content layer.
 * BMP-only (style ranges count UTF-16 units as chars); the byte/char
 * offset split is handled inside {@link pourParas}.
 */
export async function prose(
  ctx: PageContext,
  pageIndex: number,
  bounds: Bounds,
  paras: AsciiPara[],
): Promise<{ frameId: string; storyId: string }> {
  for (const para of paras) {
    if (/[\uD800-\uDFFF]/.test(para.text)) {
      throw new Error(
        `prose() is BMP-only (char offsets are UTF-16-unit-counted): ${para.text.slice(0, 40)}`,
      );
    }
  }
  const { doc } = ctx;
  const pageId = pageIdOf(ctx, pageIndex);
  const frameId = await doc.textFrame(pageId, bounds);
  const storyId = await doc.storyOf(pageId, bounds);
  await pourParas(doc, storyId, paras);
  await assignLayer(ctx, "textFrame", frameId, LAYER.content);
  return { frameId, storyId };
}

/**
 * Pour paragraphs into an EXISTING story (a thread chain's).
 *
 * Two address spaces, handled separately on purpose: `insertText`
 * offsets are story-local BYTES (each paragraph break costs one `\n`
 * byte), while `applyStyle` offsets are CONTIGUOUS CHARS with no
 * character between paragraphs (paged-mutate apply/paragraph.rs walks
 * `para_start = previous para_end`). Conflating the two drifts one
 * position per paragraph and three per em dash — so this helper keeps
 * a byte cursor for the pours and a char cursor for the styling.
 */
export async function pourParas(
  doc: ShowcaseDoc,
  storyId: string,
  paras: AsciiPara[],
): Promise<void> {
  let byteOffset = 0;
  let charOffset = 0;
  for (const [i, para] of paras.entries()) {
    const text = i === paras.length - 1 ? para.text : `${para.text}\n`;
    await doc.insertText(storyId, text, byteOffset);
    const start = charOffset;
    const end = charOffset + para.text.length;
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
    byteOffset += Buffer.byteLength(text, "utf8");
    charOffset += para.text.length;
  }
}

/**
 * ONE paragraph in a fresh frame — the safe door for RTL/CJK text.
 * A single `insertText` at offset 0 sidesteps the byte-vs-char offset
 * split entirely; style ranges are char offsets, which for BMP text
 * equal JS string indexes.
 */
export async function pourOne(
  ctx: PageContext,
  pageIndex: number,
  bounds: Bounds,
  text: string,
  styleName: string,
): Promise<{ frameId: string; storyId: string }> {
  const { doc } = ctx;
  const pageId = pageIdOf(ctx, pageIndex);
  const frameId = await doc.textFrame(pageId, bounds);
  const storyId = await doc.storyOf(pageId, bounds);
  await doc.insertText(storyId, text, 0);
  await doc.applyStyle(
    storyId,
    0,
    text.length,
    await doc.paragraphStyle(styleName),
    "paragraph",
  );
  await assignLayer(ctx, "textFrame", frameId, LAYER.content);
  return { frameId, storyId };
}

/** A Caption-styled note on the Content layer. */
export async function caption(
  ctx: PageContext,
  pageIndex: number,
  bounds: Bounds,
  text: string,
): Promise<string> {
  const { frameId } = await pourOne(ctx, pageIndex, bounds, text, STYLE.caption);
  return frameId;
}

/** Run `fn` with its ops tallied as transient (demonstrated-then-removed). */
export async function transient<T>(
  doc: ShowcaseDoc,
  fn: () => Promise<T>,
): Promise<T> {
  if (doc.ledger) return doc.ledger.transient(fn);
  return fn();
}

/** One story summary as `paged.stories()` reports it. */
export interface StorySummaryRead {
  selfId: string;
  characterCount: number;
  paragraphCount: number;
  overset?: boolean;
  oversetAt?: { paragraph: number; line: number } | null;
}

export async function storySummaries(page: Page): Promise<StorySummaryRead[]> {
  const out = await script(page, "paged.stories()");
  return JSON.parse(out[0] ?? "[]") as StorySummaryRead[];
}

/** One property entry off the element-properties read door. */
export async function readEntry(
  page: Page,
  ref: { kind: string; id: string },
  path: string,
): Promise<{ type: string; value: unknown } | null> {
  return page.evaluate(
    async ({ ref, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value: unknown }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(ref);
      return (
        (props?.entries.find((e) => e.path === p)?.value as {
          type: string;
          value: unknown;
        } | null) ?? null
      );
    },
    { ref, p: path },
  );
}
