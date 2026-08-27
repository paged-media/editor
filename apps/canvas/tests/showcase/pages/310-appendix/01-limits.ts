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

// THE LIMITS LEDGER — p127–p130 (A·1–A·4), the appendix the whole book
// has been pointing at. Every ◪ margin note in the annual ends
// "→ Appendix A"; this is Appendix A. The table is COMPILED, not
// typed: at build time the support layer reads every `marginNote(`
// call back out of the page-module sources, resolves each note's
// folio through the chapter specs, dedupes near-identical recordings,
// and classifies each entry ◪ (demonstrated to a recorded limit) or
// □ (not modelled by declaration) from its own wording. The entries
// pour as ONE story threaded through eight two-column frames across
// the four pages — set with reference-page restraint, in the Index
// Entry face, compacted to their first clause with the full wording
// left in the margins they came from.
//
// A·4 closes with the campaign's ENGINE-FINDING roll: the ten deeper
// seams the margin notes point at, one line each.

import { expect } from "@playwright/test";

import { script } from "../../../e2e/harness/ui";
import { assignLayer, proseFrame, specLabel, type Para } from "../../annual-support";
import { CHAR, LAYER, STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { compileLimits, type Limit } from "./00-support";

/** Compact a limit to its leading clause — the ledger prints the
 *  distillation; the full wording stands in the folio's own margin. */
function compact(text: string, max = 108): string {
  if (text.length <= max) return text;
  const clause = /^(.{50,}?[.;])\s/.exec(text)?.[1];
  if (clause && clause.length <= max) return clause.replace(/[.;]$/, "");
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))} …`;
}

/** The ten deeper seams — the campaign's engine findings, each one
 *  the root the surface notes point at. One line each, Specimen-style. */
const ENGINE_FINDINGS: string[] = [
  "facing-spread coordinate seam — inserts re-base page-local anchors by the spread origin; transforms speak stored coords.",
  "wasm 0.62 one-batch regroup regression — updateRepeat / redefineSymbol's dissolve-and-regroup batch is refused; green on protocol 60.",
  "paragraph-granularity cross-frame flow — a split paragraph carries one line over and scatters the rest one line per frame.",
  "no ignore-text-wrap door — a wrap contour excludes every intersecting frame; the self-seated pull quote is inexpressible.",
  "position-keyed line-breaker sliver — certain exact rects compose character-wrapped while an identical rect a row down sets clean.",
  "characterOtfFeatures is authoring-only — the tag list stores and round-trips; the shaper never reads it.",
  "in-chain mutation cost scaling — ~3.8 s per op against the full book vs ~1 s solo; recompose scales with content.",
  "DuckDB date-ingest refusal — the provider's serde refuses any result set carrying a DATE column, whole.",
  "unstyled DOCX pour paint — synthesized styles apply over the story but the paint shows one face and size.",
  "export-center missing plugin exporters — the plugin section never renders its rows; save-backs ride the exporter registry.",
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];

  const limits = compileLimits();
  const partial = limits.filter((l) => l.glyph === "◪").length;
  const declared = limits.length - partial;
  notes.push(
    `limits compiled from sources: ${limits.length} (◪ ${partial} · □ ${declared})`,
  );

  // ── A·1 head + introduction ──────────────────────────────────────
  const head = await proseFrame(ctx, p(127), [48, 54, 480, 88], [
    { text: "Appendix A — The Limits Ledger", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // The classification glyphs live in JetBrains Mono (Code Inline) —
  // the serif faces carry ■ but not ◪, and a ledger whose two classes
  // both print as tofu would classify nothing.
  const glyphRanges = (
    text: string,
  ): Array<{ start: number; end: number; style: string }> => {
    const out: Array<{ start: number; end: number; style: string }> = [];
    for (const [i, ch] of [...text].entries()) {
      if (ch === "◪" || ch === "□") {
        out.push({ start: i, end: i + 1, style: CHAR.codeInline });
      }
    }
    return out;
  };
  const introParas: Para[] = [
    {
      text:
        "A recorded limit is a demonstration that says where it stops. Every page of this annual that showed a feature partially, or met an edge the engine declares rather than hides, set a ◪ note in its margin and pointed here. This ledger is those margins, gathered: compiled at build time from the page sources themselves — every marginNote call read back out of the modules, deduplicated, its folio resolved through the chapter plan — because a limits appendix that was typed by hand would itself be a claim nobody checked.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        `The annual prints them for the same reason it prints specimen labels: a specimen that hides its edges is an advertisement. ${limits.length} limits stand recorded — ${partial} marked ◪, demonstrated to a recorded boundary, and ${declared} marked □, absences the platform declares by design rather than failures it met. Each entry is compacted to its leading clause; the full wording stands in the margin of the folio cited beside it.`,
      style: STYLE.body,
    },
  ];
  for (const para of introParas) para.charRanges = glyphRanges(para.text);
  const intro = await proseFrame(ctx, p(127), [48, 96, 480, 248], introParas);
  elements.push(intro.frameId);

  // ── eight columns, A·1 → A·4, each with its OWN story ────────────
  // NOT one threaded chain, deliberately: a paragraph that crosses a
  // frame boundary scatters its overflow one line per frame (the
  // recorded cross-frame-flow finding — entry three of the roll
  // below), and a ledger set through that seam strands orphan lines
  // at every column top. Entries are therefore dealt to columns by a
  // conservative line budget (44 chars/line against a measured ~55,
  // so a column underfills rather than oversets) and poured one story
  // per column; every column's overset flag is then asserted false.
  const boxes: Array<{ page: number; box: [number, number, number, number] }> = [
    { page: p(127), box: [48, 260, 258, 630] },
    { page: p(127), box: [270, 260, 480, 630] },
    { page: p(128), box: [60, 64, 270, 630] },
    { page: p(128), box: [282, 64, 492, 630] },
    { page: p(129), box: [48, 64, 258, 630] },
    { page: p(129), box: [270, 64, 480, 630] },
    { page: p(130), box: [60, 64, 270, 330] },
    { page: p(130), box: [282, 64, 492, 330] },
  ];

  // Consecutive folios print as a range ("23–30"): a note whose module
  // declares no exact page resolves to its chapter's spread, and eight
  // comma-separated folios would claim a precision the source lacks.
  const folioList = (l: Limit): string => {
    const runs: string[] = [];
    let start = 0;
    for (let i = 1; i <= l.physicals.length; i += 1) {
      if (i < l.physicals.length && l.physicals[i] === l.physicals[i - 1] + 1) {
        continue;
      }
      runs.push(
        i - start > 2
          ? `${l.folios[start]}–${l.folios[i - 1]}`
          : l.folios.slice(start, i).join(", "),
      );
      start = i;
    }
    return runs.join(", ");
  };
  const entryText = (l: Limit): string =>
    `${l.glyph} ${compact(l.text)} · ${folioList(l)}`;

  const CHARS_PER_LINE = 44;
  const LEADING = 13;
  const estLines = (text: string): number =>
    Math.ceil(text.length / CHARS_PER_LINE);
  const budgets = boxes.map((b) => Math.floor((b.box[3] - b.box[1]) / LEADING));

  // Deal entries to columns against the budgets, in book order.
  const perColumn: string[][] = boxes.map(() => []);
  let col = 0;
  let used = 0;
  for (const l of limits) {
    const text = entryText(l);
    const lines = estLines(text);
    while (col < boxes.length && used + lines > budgets[col]) {
      col += 1;
      used = 0;
    }
    if (col >= boxes.length) {
      throw new Error(
        `the limits ledger overflows its eight columns at entry ` +
          `${JSON.stringify(text.slice(0, 60))} — widen the budget, never cut`,
      );
    }
    perColumn[col].push(text);
    used += lines;
  }

  // Pour each column: one insertText, one paragraph applyStyle, one
  // batch for the Code Inline classification glyphs.
  const indexEntry = await doc.paragraphStyle(STYLE.indexEntry);
  const codeInline = await doc.characterStyle(CHAR.codeInline);
  const columnStories: string[] = [];
  for (const [i, b] of boxes.entries()) {
    const entries = perColumn[i];
    // No frame for an empty column — an invisible empty frame would
    // still win hit tests over anything placed in its area later.
    if (entries.length === 0) continue;
    const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(b.page)];
    const frameId = await doc.textFrame(pageId, b.box);
    await assignLayer(ctx, "textFrame", frameId, LAYER.content);
    elements.push(frameId);
    const storyId = await doc.storyOf(pageId, b.box);
    columnStories.push(storyId);
    const text = entries.join("\n");
    await doc.insertText(storyId, text, 0);
    const contiguous = [...text.replace(/\n/g, "")].length;
    await doc.applyStyle(storyId, 0, contiguous, indexEntry, "paragraph");
    const glyphOps: Array<{ op: string; args: unknown }> = [];
    let at = 0;
    for (const entry of entries) {
      glyphOps.push({
        op: "applyStyle",
        args: {
          storyId,
          start: at,
          end: at + 1,
          style: codeInline,
          scope: "character",
        },
      });
      at += entry.length;
    }
    await doc.mutate("batch", { ops: glyphOps });
  }

  // The whole ledger must be ON the pages — a truncated appendix of
  // honesty notes would be its own joke. Render first: the overset
  // flag derives from build diagnostics.
  for (const page of ctx.pageIndexes) await doc.renderPage(page);
  const summaries = JSON.parse(
    (await script(ctx.page, "paged.stories()"))[0] ?? "[]",
  ) as Array<{ selfId: string; overset?: boolean }>;
  for (const storyId of columnStories) {
    expect(
      summaries.find((s) => s.selfId === storyId)?.overset ?? false,
      "a limits column oversets — nothing recorded may be cut",
    ).toBe(false);
  }

  // ── A·4: the engine-finding roll — two static columns of five.
  //    When the ledger never reaches A·4's columns (the conservative
  //    deal often ends on A·3), the roll rises to the top of the page
  //    instead of leaving a half-page hole above itself. ─────────────
  const p130Empty =
    perColumn[6].length === 0 && perColumn[7].length === 0;
  const lift = p130Empty ? 260 : 0;
  const rollHead = await proseFrame(
    ctx,
    p(130),
    [60, 348 - lift, 492, 396 - lift],
    [
      { text: "The engine findings", style: STYLE.head2 },
      {
        text:
          "Ten of the notes above are surface readings of deeper seams. The campaign's own roll:",
        style: STYLE.bodySmall,
      },
    ],
  );
  elements.push(rollHead.frameId);
  const rollA = await proseFrame(
    ctx,
    p(130),
    [60, 404 - lift, 270, 634 - lift],
    ENGINE_FINDINGS.slice(0, 5).map((f) => ({ text: f, style: STYLE.specValue })),
  );
  const rollB = await proseFrame(
    ctx,
    p(130),
    [282, 404 - lift, 492, 634 - lift],
    ENGINE_FINDINGS.slice(5).map((f) => ({ text: f, style: STYLE.specValue })),
  );
  elements.push(rollA.frameId, rollB.frameId);

  elements.push(
    await specLabel(ctx, p(127), [
      "Specimen No. 193",
      "compiled from pages/**/*.ts at build time",
      `${limits.length} limits · ◪ ${partial} · □ ${declared}`,
    ]),
  );

  return {
    title: "Appendix A — the limits ledger, compiled from the sources",
    covers: [],
    elements,
    notes,
  };
}
