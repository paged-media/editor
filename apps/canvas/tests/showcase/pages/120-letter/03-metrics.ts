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

// Kerning, tracking, scale, skew — the metric transforms the composer
// performs itself, shown as ramps: five tracking values, the scale
// pair, a false italic, baseline shifts, three kerning methods, and
// the two paint decorations. Everything on this page renders; the one
// recorded limit is optical kerning, which falls back to metrics.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

const len = (value: number) => ({ type: "length", value }) as const;
const txt = (value: string) => ({ type: "text", value }) as const;
const flag = (value: boolean) => ({ type: "bool", value }) as const;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];

  const set = (
    storyId: string,
    start: number,
    end: number,
    path: string,
    value: unknown,
  ) =>
    doc.setProperty(
      "storyRange",
      doc.storyRangeId(storyId, start, end),
      path,
      value,
    );

  /** Pour a caption + samples block; returns story + para starts. */
  const block = async (
    box: [number, number, number, number],
    caption: string,
    samples: string[],
  ): Promise<{ storyId: string; starts: number[] }> => {
    const paras = [
      { text: caption, style: STYLE.caption },
      ...samples.map((text) => ({ text, style: STYLE.body })),
    ];
    const frame = await proseFrame(ctx, p(22), box, paras);
    elements.push(frame.frameId);
    const starts: number[] = [];
    let off = 0;
    for (const para of paras) {
      starts.push(off);
      off += para.text.length + 1;
    }
    return { storyId: frame.storyId, starts };
  };

  /** EB Garamond at 14/19 over a whole sample paragraph. */
  const face = async (storyId: string, start: number, text: string) => {
    await set(storyId, start, start + text.length, "characterFontFamily", txt("EB Garamond"));
    await set(storyId, start, start + text.length, "characterFontSize", len(14));
    await set(storyId, start, start + text.length, "characterLeading", len(19));
  };

  const [x0, y0, x1] = contentBox(p(22));

  const head = await proseFrame(ctx, p(22), [x0, y0, x1, y0 + 30], [
    { text: "Metal that moves", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── tracking ramp: -50 .. +200 thousandths of an em ─────────────
  {
    const values = [-50, 0, 50, 120, 200];
    const samples = values.map((v) => `letterforms breathe (${v >= 0 ? "+" : ""}${v})`);
    const b = await block(
      [x0, y0 + 38, x1, y0 + 196],
      "characterTracking · thousandths of an em, five stops",
      samples,
    );
    for (const [i, sample] of samples.entries()) {
      const s = b.starts[i + 1];
      await face(b.storyId, s, sample);
      await set(b.storyId, s, s + sample.length, "characterTracking", len(values[i]));
    }
  }

  // ── horizontal / vertical scale ─────────────────────────────────
  {
    const samples = ["condensed to 70", "expanded to 130", "tall at 160"];
    const b = await block(
      [x0, y0 + 204, x1, y0 + 310],
      "characterHorizontalScale 70 / 130 · characterVerticalScale 160",
      samples,
    );
    for (const [i, sample] of samples.entries()) {
      const s = b.starts[i + 1];
      await face(b.storyId, s, sample);
    }
    const h70 = b.starts[1];
    await set(b.storyId, h70, h70 + samples[0].length, "characterHorizontalScale", len(70));
    const h130 = b.starts[2];
    await set(b.storyId, h130, h130 + samples[1].length, "characterHorizontalScale", len(130));
    const v160 = b.starts[3];
    await set(b.storyId, v160, v160 + samples[2].length, "characterVerticalScale", len(160));
  }

  // ── skew + baseline shift ───────────────────────────────────────
  {
    const skewed = "a false italic, twelve degrees of skew";
    const shifted = "steady high steady low steady";
    const b = await block(
      [x0, y0 + 318, x1, y0 + 400],
      "characterSkew 12 · characterBaselineShift +4 / -4",
      [skewed, shifted],
    );
    const sk = b.starts[1];
    await face(b.storyId, sk, skewed);
    await set(b.storyId, sk, sk + skewed.length, "characterSkew", len(12));
    const sh = b.starts[2];
    await face(b.storyId, sh, shifted);
    const hi = sh + shifted.indexOf("high");
    await set(b.storyId, hi, hi + 4, "characterBaselineShift", len(4));
    const lo = sh + shifted.indexOf("low");
    await set(b.storyId, lo, lo + 3, "characterBaselineShift", len(-4));
  }

  // ── kerning methods ─────────────────────────────────────────────
  {
    const samples = [
      "WAVE To AVATAR Yield — Metrics",
      "WAVE To AVATAR Yield — Optical",
      "WAVE To AVATAR Yield — None",
    ];
    const methods = ["Metrics", "Optical", "None"];
    const b = await block(
      [x0, y0 + 408, x1, y0 + 514],
      "characterKerningMethod · the pair fitting the composer applies",
      samples,
    );
    for (const [i, sample] of samples.entries()) {
      const s = b.starts[i + 1];
      await face(b.storyId, s, sample);
      await set(b.storyId, s, s + sample.length, "characterKerningMethod", txt(methods[i]));
    }
  }

  // ── the paint decorations ───────────────────────────────────────
  {
    const under = "underlined for the record";
    const struck = "struck from the record";
    const b = await block(
      [x0, y0 + 522, x1, y0 + 585],
      "characterUnderline · characterStrikethru — paint-only, no reflow",
      [under, struck],
    );
    const u = b.starts[1];
    await face(b.storyId, u, under);
    await set(b.storyId, u, u + under.length, "characterUnderline", flag(true));
    const st = b.starts[2];
    await face(b.storyId, st, struck);
    await set(b.storyId, st, st + struck.length, "characterStrikethru", flag(true));
  }

  elements.push(
    await marginNote(
      ctx,
      p(22),
      "Optical kerning falls back to metrics — the middle kerning sample and the first render identically by design of the current composer → Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, p(22), [
      "Specimen No. 15",
      "characterTracking / Skew",
      "characterH/VScale",
      "characterBaselineShift",
      "characterKerningMethod",
      "characterUnderline / Strikethru",
    ]),
  );

  notes.push(
    "optical kerning falls back to metrics (recorded limit, margin note)",
  );

  return {
    title: "Kerning, tracking, scale, skew",
    covers: [
      "typography.tracking-kerning",
      "typography.baseline-shift",
      "typography.scale-skew",
      "typography.vertical-scale",
      "typography.underline-strikethru",
    ],
    elements,
    notes,
  };
}
