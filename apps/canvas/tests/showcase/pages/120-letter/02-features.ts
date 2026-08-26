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

// The feature specimen — one OpenType feature per row, both states
// side by side, every row labelled with the property path it used.
//
// The honest core of this spread, established by reading the engine
// rather than the wishlist: the shaper receives OpenType features ONLY
// from the discrete OTF toggles a run or a character style carries
// (paged-text ShapingFeatures), and no wire door writes those discrete
// toggles — `characterOtfFeatures` stores an opaque authoring tag
// list the shaper never reads, `setStyleProperty` on a character
// style carries size/tracking/fill only, and a paragraph style's
// OTFFigureStyle is not merged into run resolution at all
// (paged-scene `merge_below_paragraph` has no otf arm). So the rows
// that truly toggle are the ones the composer itself drives —
// ligatures on/off, case, position — and every GSUB-only row is
// printed twice, identically, and says so.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { CHAR, STYLE, contentBox, p } from "../../names-annual";
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

  /** Pour one specimen row: a caption label + sample paragraphs.
   *  Returns the story and the char offset where each para starts. */
  const row = async (
    pageIndex: number,
    box: [number, number, number, number],
    label: string,
    samples: Array<{ text: string; style: string }>,
  ): Promise<{ storyId: string; starts: number[] }> => {
    const paras = [
      { text: label, style: STYLE.caption },
      ...samples.map((s) => ({ text: s.text, style: s.style })),
    ];
    const frame = await proseFrame(ctx, pageIndex, box, paras);
    elements.push(frame.frameId);
    const starts: number[] = [];
    let off = 0;
    for (const para of paras) {
      starts.push(off);
      off += para.text.length + 1;
    }
    return { storyId: frame.storyId, starts };
  };

  /** [start, end) of the `index`-th " | "-separated segment. */
  const seg = (
    start: number,
    text: string,
    index: number,
  ): [number, number] => {
    const parts = text.split(" | ");
    let off = 0;
    for (let i = 0; i < index; i += 1) off += parts[i].length + 3;
    return [start + off, start + off + parts[index].length];
  };

  /** Face + size + leading over a range — the font-selection paths. */
  const face = async (
    storyId: string,
    start: number,
    end: number,
    family: string,
    size: number,
    fontStyle?: string,
  ) => {
    await set(storyId, start, end, "characterFontFamily", txt(family));
    if (fontStyle) {
      await set(storyId, start, end, "characterFontStyle", txt(fontStyle));
    }
    await set(storyId, start, end, "characterFontSize", len(size));
    await set(storyId, start, end, "characterLeading", len(19));
  };

  const [vx0, vy0, vx1] = contentBox(p(20));
  const [rx0, ry0, rx1] = contentBox(p(21));

  const vHead = await proseFrame(ctx, p(20), [vx0, vy0, vx1, vy0 + 30], [
    { text: "The feature specimen", style: STYLE.head1 },
  ]);
  elements.push(vHead.frameId);

  const vRow = (i: number): [number, number, number, number] => [
    vx0,
    vy0 + 38 + i * 106,
    vx1,
    vy0 + 38 + i * 106 + 100,
  ];
  const rRow = (i: number): [number, number, number, number] => [
    rx0,
    ry0 + 38 + i * 90,
    rx1,
    ry0 + 38 + i * 90 + 84,
  ];

  // ── Row 1 · standard ligatures — genuinely toggled ──────────────
  {
    const sample =
      "fine offices affirm floral scripts | fine offices affirm floral scripts";
    const r = await row(
      p(20),
      vRow(0),
      "liga · characterLigatures — left ON (the default), right OFF",
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "EB Garamond", 15);
    const [offStart, offEnd] = seg(s, sample, 1);
    await set(r.storyId, offStart, offEnd, "characterLigatures", flag(false));
  }

  // ── Row 2 · discretionary ligatures — authoring metadata ────────
  {
    const sample = "distinct strategist acts | distinct strategist acts";
    const r = await row(
      p(20),
      vRow(1),
      'dlig · characterOtfFeatures="dlig" — authoring metadata; both halves print identically',
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "EB Garamond", 15);
    const [dStart, dEnd] = seg(s, sample, 1);
    await set(r.storyId, dStart, dEnd, "characterOtfFeatures", txt("dlig"));
  }

  // ── Row 3 · case — style, path, and the one that renders ────────
  {
    const sample = "Letterforms | Letterforms | Letterforms | letter-rhythm";
    const r = await row(
      p(20),
      vRow(2),
      "characterCase · plain | Small Caps style | SmallCaps path | AllCaps path on lowercase source",
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "EB Garamond", 15);
    const [aStart, aEnd] = seg(s, sample, 1);
    await doc.applyStyle(
      r.storyId,
      aStart,
      aEnd,
      await doc.characterStyle(CHAR.smallCaps),
      "character",
    );
    const [bStart, bEnd] = seg(s, sample, 2);
    await set(r.storyId, bStart, bEnd, "characterCase", txt("SmallCaps"));
    const [cStart, cEnd] = seg(s, sample, 3);
    await set(r.storyId, cStart, cEnd, "characterCase", txt("AllCaps"));
  }

  // ── Row 4 · figure styles — carried by styles, not by the shaper ─
  {
    const sampleA = "0123456789 · 31,556,952 — Annual Body, ProportionalOldStyle";
    const sampleB = "0123456789 · 31,556,952 — Table Number, TabularLining";
    const r = await row(
      p(20),
      vRow(3),
      "figures · OTFFigureStyle rides these paragraph styles' definitions; run resolution never reads it — and onum via characterOtfFeatures is metadata",
      [
        { text: sampleA, style: STYLE.body },
        { text: sampleB, style: STYLE.tableNumber },
      ],
    );
    const s = r.starts[1];
    await set(r.storyId, s, s + 10, "characterOtfFeatures", txt("onum"));
  }

  // ── Row 5 · fractions — authoring metadata ──────────────────────
  {
    const sample = "1/2 3/4 7/8 22/7 | 1/2 3/4 7/8 22/7";
    const r = await row(
      p(20),
      vRow(4),
      'frac · characterOtfFeatures="frac" · JetBrains Mono — authoring metadata',
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "JetBrains Mono", 13);
    const [fStart, fEnd] = seg(s, sample, 1);
    await set(r.storyId, fStart, fEnd, "characterOtfFeatures", txt("frac"));
  }

  // ── recto ───────────────────────────────────────────────────────
  const rHead = await proseFrame(ctx, p(21), [rx0, ry0, rx1, ry0 + 30], [
    { text: "The feature specimen, continued", style: STYLE.head1 },
  ]);
  elements.push(rHead.frameId);

  // ── Row 6 · ordinals — GSUB metadata vs the metric alternative ──
  {
    const sample = "1st 2nd 3rd 4th | 1st 2nd 3rd 4th | 1st 2nd 3rd 4th";
    const r = await row(
      p(21),
      rRow(0),
      'ordn · plain | characterOtfFeatures="ordn" (metadata) | characterPosition="OTSuperscript" on the suffixes (rendered, metric)',
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "EB Garamond", 15);
    const [mStart, mEnd] = seg(s, sample, 1);
    await set(r.storyId, mStart, mEnd, "characterOtfFeatures", txt("ordn"));
    const [pStart] = seg(s, sample, 2);
    const third = sample.split(" | ")[2];
    for (const m of third.matchAll(/(\d+)(st|nd|rd|th)/g)) {
      const sufStart = pStart + (m.index ?? 0) + m[1].length;
      await set(
        r.storyId,
        sufStart,
        sufStart + m[2].length,
        "characterPosition",
        txt("OTSuperscript"),
      );
    }
  }

  // ── Row 7 · superscript / subscript — rendered ──────────────────
  {
    const sample = "E = mc2 | H2O | Fe3+ | log2 n";
    const r = await row(
      p(21),
      rRow(1),
      "characterPosition · Superscript and Subscript, position-metric size and shift",
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "EB Garamond", 15);
    const sup = (at: number, count: number) =>
      set(r.storyId, s + at, s + at + count, "characterPosition", txt("Superscript"));
    const sub = (at: number, count: number) =>
      set(r.storyId, s + at, s + at + count, "characterPosition", txt("Subscript"));
    await sup(sample.indexOf("mc2") + 2, 1);
    await sub(sample.indexOf("H2O") + 1, 1);
    await sup(sample.indexOf("Fe3+") + 2, 2);
    await sub(sample.indexOf("log2") + 3, 1);
  }

  // ── Row 8 · swash — authoring metadata ──────────────────────────
  {
    const sample = "Rare Kingdoms Answer | Rare Kingdoms Answer";
    const r = await row(
      p(21),
      rRow(2),
      'swsh · EB Garamond Italic · characterOtfFeatures="swsh" — authoring metadata',
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "EB Garamond", 15, "Italic");
    const [wStart, wEnd] = seg(s, sample, 1);
    await set(r.storyId, wStart, wEnd, "characterOtfFeatures", txt("swsh"));
  }

  // ── Row 9 · stylistic sets — authoring metadata ─────────────────
  {
    const sample = "Quirky Regard gently | Quirky Regard gently";
    const r = await row(
      p(21),
      rRow(3),
      'ss01 · characterOtfFeatures="ss01" — authoring metadata',
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "EB Garamond", 15);
    const [xStart, xEnd] = seg(s, sample, 1);
    await set(r.storyId, xStart, xEnd, "characterOtfFeatures", txt("ss01"));
  }

  // ── Row 10 · slashed zero — authoring metadata ──────────────────
  {
    const sample = "0 100 2026 0x0F | 0 100 2026 0x0F";
    const r = await row(
      p(21),
      rRow(4),
      'zero · JetBrains Mono (its zero is slashed by design) · characterOtfFeatures="zero" — authoring metadata',
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "JetBrains Mono", 13);
    const [zStart, zEnd] = seg(s, sample, 1);
    await set(r.storyId, zStart, zEnd, "characterOtfFeatures", txt("zero"));
  }

  // ── Row 11 · historical forms — not even a discrete toggle ──────
  {
    const sample = "his historic listens | his historic listens";
    const r = await row(
      p(21),
      rRow(5),
      'hist · characterOtfFeatures="hist" — metadata; the discrete OTF lane carries no hist flag at all',
      [{ text: sample, style: STYLE.body }],
    );
    const s = r.starts[1];
    await face(r.storyId, s, s + sample.length, "EB Garamond", 15);
    const [hStart, hEnd] = seg(s, sample, 1);
    await set(r.storyId, hStart, hEnd, "characterOtfFeatures", txt("hist"));
  }

  elements.push(
    await marginNote(
      ctx,
      p(20),
      "characterOtfFeatures stores an opaque authoring tag list the shaper never reads; the raster obeys only the discrete OTF toggles carried by runs and character styles, and no wire door writes those. Small caps pass through with original case (P-12). Rows so marked print both states identically → Appendix A.",
    ),
  );
  elements.push(
    await marginNote(
      ctx,
      p(21),
      "The GSUB rows here demonstrate the authoring surface, not the substitution: the tag list persists, exports and reads back unchanged. The ordinal and position rows are metric transforms the composer does perform → Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, p(20), [
      "Specimen No. 14",
      "characterLigatures / Case",
      "characterOtfFeatures",
      "characterFontFamily / Style",
      "characterFontSize / Leading",
      "characterPosition",
    ]),
  );

  notes.push(
    "characterOtfFeatures is authoring metadata only — the shaper consumes discrete OTF toggles (run/character-style), and no wire door writes those discrete flags",
    "characterCase SmallCaps passes text through unchanged (smcp not driven, P-12); AllCaps renders",
    "paragraph-style OTFFigureStyle never reaches run resolution (paged-scene merge_below_paragraph has no otf arm) — figure-style rows rely on the style definitions only",
  );

  return {
    title: "The feature specimen",
    covers: [
      "typography.ligatures-opentype",
      "typography.capitalization",
      "typography.position-super-subscript",
      "typography.font-selection",
      "typography.leading",
      "stories-text.style-apply-range",
    ],
    elements,
    notes,
  };
}
