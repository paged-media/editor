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

// Ch.11 opener (p61, C-Opener recto) — the number, the title, a deck,
// and the brand plates: every fixture swatch as a labeled chip, its
// KIND read live from the swatches collection so the legend cannot
// drift from the palette it describes. The captions carry the two
// specimens the fixture built on purpose: the CMYK-built tint (an RGB
// swatch carrying a TintValue would paint at full strength — TintValue
// only scales through effective_cmyk) and Screen Blue, the deliberate
// RGB warning in a print document.

import { expect } from "@playwright/test";

import { plate, proseFrame, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { chip, swatchList } from "./00-support";

/** The plates, in palette order, with the authored facts the captions
 *  state. The KIND half of each caption is read live at build time. */
const PLATES: Array<{ name: string; fact: string }> = [
  {
    name: SWATCH.ink,
    fact: "CMYK 72/62/58/90 — the editorial black, built rich rather than flat K.",
  },
  {
    name: SWATCH.paperWarm,
    fact: "CMYK 2/3/6/0 — the paper simulation every plate sits on.",
  },
  {
    name: SWATCH.vermilion,
    fact: "a real spot ink, CMYK build 0/85/90/5 — a named separation all the way to the plate; this composite previews its CMYK alternate.",
  },
  {
    name: SWATCH.vermilionTint,
    fact: "a real CMYK-built tint, TintValue 20 on the vermilion build. Deliberately not an RGB tint: TintValue scales only through the CMYK resolve, so an RGB swatch carrying one would paint at full strength.",
  },
  {
    name: SWATCH.slate,
    fact: "CMYK 65/45/30/10 — the annotation ink the spec labels wear.",
  },
  {
    name: SWATCH.labMarigold,
    fact: "Lab 78/15/82 — a true Lab primary, resolved analytically (D50 to D65 Bradford, then sRGB), no profile required.",
  },
  {
    name: SWATCH.screenBlue,
    fact: "RGB 47/111/235 — the deliberate warning specimen: an RGB build in a print document, kept out of the brand group on purpose.",
  },
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const page = p(61);
  const elements: string[] = [];

  const number = await proseFrame(ctx, page, [48, 100, 220, 196], [
    { text: "11", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [48, 200, 480, 252], [
    { text: "The Colour", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [48, 264, 448, 372], [
    {
      text:
        "A document's palette is a contract with a press. This chapter reads " +
        "the annual's seven inks off the live collection, mints and edits new " +
        "ones in front of you, walks the whole library out of the file as " +
        "Adobe Swatch Exchange bytes and back in, and finishes at the " +
        "prepress bench: profiles, proofs, ink aliases, and the defaults a " +
        "fresh frame is born wearing.",
      style: STYLE.deck,
    },
  ]);
  const rule = await plate(ctx, page, [48, 382, 300, 384], SWATCH.vermilion);
  elements.push(number.frameId, title.frameId, deck.frameId, rule);

  // The brand plates. Kind strings come from the engine, not the prose:
  // a fixture drift shows up here as a caption that contradicts itself.
  const live = await swatchList(doc);
  const kindOf = (name: string): string => {
    const hit = live.find((s) => s.name === name);
    if (!hit) throw new Error(`palette has no swatch named ${name}`);
    return hit.kind;
  };

  let y = 402;
  for (const spec of PLATES) {
    const ids = await chip(
      ctx,
      page,
      [48, y, 110, y + 24],
      { name: spec.name },
      [122, y - 4, 480, y + 30],
      `${spec.name} · ${kindOf(spec.name)} · ${spec.fact}`,
    );
    elements.push(...ids);
    y += 33;
  }
  expect(live.map((s) => s.name)).toEqual(
    expect.arrayContaining(PLATES.map((s) => s.name)),
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 90",
      "the brand palette — chips resolved by name",
      "swatches (live read)",
      "frameFillColor",
    ]),
  );

  return {
    title: "Ch.11 opener — The Colour",
    covers: [
      "color-swatches.fill-stroke-apply",
      "color-swatches.process-spot-tint",
      "color-swatches.lab-mixed-ink",
    ],
    elements,
  };
}
