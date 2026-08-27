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

// Ch.18 opener (p109, C-Opener recto) — the publishing-FROM-data
// thesis, with the chapter's raw material printed as a source specimen:
// the order book CSV itself, set as code, before any engine touches it.
// The pages that follow put that same file through the paged.data
// pipeline — register, query, bind, resolve, lower — and everything the
// reader meets there is checkable against these lines.

import { readFileSync } from "node:fs";

import { plate, proseFrame, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { CSV_FIXTURE } from "./00-support";

/** The specimen excerpt: header + first rows, each line cut to the
 *  measure (a wrapped CSV reads as soup; an elided one reads as data). */
function csvExcerpt(maxLines: number, maxChars: number): string[] {
  const lines = readFileSync(CSV_FIXTURE, "utf8").trimEnd().split("\n");
  const shown = lines.slice(0, maxLines).map((l) =>
    l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l,
  );
  shown.push(`… ${lines.length - maxLines} more rows`);
  return shown;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const page = p(109);

  const number = await proseFrame(ctx, page, [48, 100, 220, 196], [
    { text: "18", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [48, 200, 480, 252], [
    { text: "The Catalog", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [48, 264, 456, 406], [
    {
      text:
        "A catalog is not a page decorated with numbers; it is a database " +
        "wearing typography. This chapter publishes FROM data rather than " +
        "decorating WITH it: a forty-eight-row order book registers with a " +
        "real query engine, its columns become bindings whose expressions " +
        "the engine writes, and what lands on these pages — live fields, a " +
        "native table, four barcode symbologies drawn as page geometry — is " +
        "resolved content, not pasted text. Where the shipped surfaces stop " +
        "short of the engine underneath, the margin says so.",
      style: STYLE.deck,
    },
  ]);
  const rule = await plate(ctx, page, [48, 416, 300, 418], SWATCH.vermilion);

  const sourceHead = await proseFrame(ctx, page, [48, 434, 480, 448], [
    {
      text: "The source, before any engine touches it — annual-orders.csv:",
      style: STYLE.caption,
    },
  ]);
  const excerpt = await proseFrame(
    ctx,
    page,
    [48, 456, 480, 640],
    csvExcerpt(7, 76).map((text) => ({ text, style: STYLE.codeBlock })),
  );

  const label = await specLabel(ctx, page, [
    "Specimen No. 176",
    "chapter opener",
    "C-Opener master",
    "paged.data — publishing from a database",
    "source: assets/annual-orders.csv (48 rows, 4 regions)",
  ]);

  return {
    title: "Ch.18 opener — The Catalog",
    covers: [],
    elements: [
      number.frameId,
      title.frameId,
      deck.frameId,
      rule,
      sourceHead.frameId,
      excerpt.frameId,
      label,
    ],
  };
}
