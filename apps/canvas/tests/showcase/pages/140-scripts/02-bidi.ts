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

// Bidirectional text (p42): real Arabic and Hebrew sentences, plus a
// mixed line with Latin and digits nested inside the RTL run. The
// Arabic is the primary exhibit, set in the registered Noto Sans
// Arabic face; the Hebrew line asks for a face this build does not
// register, and the fonts read-out is the honest oracle for what the
// renderer substituted.

import { expect } from "@playwright/test";

import { marginNote, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { caption, pourOne, prose } from "../135-story/00-support";

// "Arabic writing runs from right to left."
const ARABIC =
  "الكتابة العربية تجري من اليمين إلى اليسار.";
// "Hebrew writing runs from right to left."
const HEBREW =
  "כתיבה עברית רצה מימין לשמאל.";
// "This line mixes Arabic with the word paged 2.0 and the digits 123
// in two directions."
const MIXED =
  "يمزج هذا السطر العربية مع الكلمة paged 2.0 والأرقام 123 في اتجاهين.";

const HEBREW_FAMILY = "Noto Sans Hebrew";

interface FontRead {
  family: string;
  referenceCount?: number;
  isMissing?: boolean;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const page = p(42);
  const elements: string[] = [];

  const head = await prose(ctx, page, [60, 104, 492, 130], [
    { text: "Right to left", style: STYLE.head1 },
  ]);
  const intro = await prose(ctx, page, [60, 134, 492, 192], [
    {
      text:
        "A bidirectional line is stored in logical order — the order it " +
        "is spoken — and painted in visual order. The renderer reorders " +
        "the runs at layout: Arabic and Hebrew read right to left, while " +
        "digits and Latin words nested inside them keep their own " +
        "left-to-right direction.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const rightAlign = async (storyId: string, chars: number) => {
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(storyId, 0, chars),
      "paragraphJustification",
      { type: "text", value: "RightAlign" },
    );
  };
  const applyFamily = async (storyId: string, chars: number, family: string) => {
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(storyId, 0, chars),
      "characterFontFamily",
      { type: "text", value: family },
    );
  };

  // ── Arabic: the primary exhibit ───────────────────────────────────
  const arabic = await pourOne(ctx, page, [60, 210, 492, 258], ARABIC, STYLE.body);
  await applyFamily(arabic.storyId, ARABIC.length, "Noto Sans Arabic");
  await rightAlign(arabic.storyId, ARABIC.length);
  expect(await doc.storyChars(arabic.storyId)).toBe(ARABIC.length);
  elements.push(arabic.frameId);
  elements.push(
    await caption(
      ctx,
      page,
      [60, 262, 492, 284],
      "Arabic — Noto Sans Arabic, right-aligned. The glyphs join and the " +
        "line runs from the right margin.",
    ),
  );

  // ── Hebrew: the honest substitution ───────────────────────────────
  const hebrew = await pourOne(ctx, page, [60, 300, 492, 348], HEBREW, STYLE.body);
  await applyFamily(hebrew.storyId, HEBREW.length, HEBREW_FAMILY);
  await rightAlign(hebrew.storyId, HEBREW.length);
  elements.push(hebrew.frameId);
  // Compose, then ask the fonts collection what happened: the family
  // the Hebrew asks for is not registered, and the engine says so.
  await doc.renderPage(page);
  const fonts = (await doc.designer.collection("fonts")) as unknown as FontRead[];
  const hebrewFont = fonts.find((f) => f.family === HEBREW_FAMILY);
  expect(
    hebrewFont,
    `the fonts collection does not list ${HEBREW_FAMILY} after it was applied`,
  ).toBeTruthy();
  expect(
    hebrewFont?.isMissing,
    "the build unexpectedly resolved a Hebrew face — update this exhibit " +
      "to assert the real rendering instead of a substitution",
  ).toBe(true);
  elements.push(
    await caption(
      ctx,
      page,
      [60, 352, 492, 382],
      "Hebrew — asks for Noto Sans Hebrew, which this build does not " +
        "register; the fonts read-out reports the family missing, so what " +
        "paints is the renderer's substitute. See the margin.",
    ),
  );

  // ── the mixed line: Latin + digits inside RTL ─────────────────────
  const mixed = await pourOne(ctx, page, [60, 398, 492, 446], MIXED, STYLE.body);
  await applyFamily(mixed.storyId, MIXED.length, "Noto Sans Arabic");
  await rightAlign(mixed.storyId, MIXED.length);
  elements.push(mixed.frameId);
  elements.push(
    await caption(
      ctx,
      page,
      [60, 450, 492, 480],
      "Mixed direction — the word paged, a version number and the digits " +
        "123 ride inside the Arabic sentence, each keeping left-to-right " +
        "order while the line around them runs right to left.",
    ),
  );

  const note = await marginNote(
    ctx,
    page,
    "No Hebrew face ships with this build: the Hebrew line is set by a " +
      "substitute the engine reports as a missing-font diagnostic. The " +
      "Arabic is the primary exhibit of this page. → Appendix A",
  );
  elements.push(note);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 61",
      "bidi reorder (renderer)",
      "characterFontFamily",
      "fonts: isMissing oracle",
    ]),
  );

  return {
    title: "Bidirectional text",
    covers: ["typography.bidi", "typography.font-selection"],
    elements,
  };
}
