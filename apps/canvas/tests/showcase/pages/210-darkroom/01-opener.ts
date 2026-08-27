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

// Ch.15 opener (p87, C-Opener recto) — the number, the title, and the
// chapter's law in the deck: a raster correction in paged.image is
// session state, and the darkroom's craft is the loop that makes it
// permanent. Below the deck, the pipeline as a five-station diagram —
// place → ingest → adjust → composite → commit — drawn from the
// fixture's own swatches, with the one station that writes the
// document set in the chapter's accent ink.

import {
  assignLayer,
  plate,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

// Station sub-captions are SHORT on purpose: the label column under
// each box is 88 pt, and the first proof render showed longer lines
// colliding across columns. The legend paragraph below the rail
// carries the full sentences.
const STATIONS: Array<{ name: string; what: string; accent: boolean }> = [
  { name: "PLACE", what: "link + fitting", accent: false },
  { name: "INGEST", what: "decode to session", accent: false },
  { name: "ADJUST", what: "GPU kernel chain", accent: false },
  { name: "COMPOSITE", what: "Stage-A preview", accent: false },
  { name: "COMMIT", what: "bytes to document", accent: true },
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const page = p(87);
  const elements: string[] = [];

  const number = await proseFrame(ctx, page, [48, 96, 220, 186], [
    { text: "15", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [48, 190, 480, 242], [
    { text: "The Darkroom", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [48, 254, 456, 352], [
    {
      text:
        "Every correction in this chapter is honest about where it lives. " +
        "An adjustment in paged.image is session state — a scene layer " +
        "composited over the frame, gone the moment the document reloads. " +
        "What persists is the loop: adjust the pixels, export them through " +
        "the bundle's own encoder, and commit the exported bytes back into " +
        "the frame as inline image data. Every photograph on the pages " +
        "that follow went through that loop before it was allowed to stay.",
      style: STYLE.deck,
    },
  ]);
  elements.push(number.frameId, title.frameId, deck.frameId);

  // ── the pipeline, as furniture: five stations on a rail ──────────
  // Station boxes are 76 pt wide on an 86 pt pitch across the 432 pt
  // measure; the rail is a 1.5 pt slate rule behind them. The commit
  // station — the one that changes the DOCUMENT rather than the
  // session — carries the chapter's vermilion.
  const railY = 396;
  const rail = await plate(
    ctx,
    page,
    [52, railY + 18, 476, railY + 19.5],
    SWATCH.slate,
    LAYER.content,
  );
  elements.push(rail);
  for (const [i, st] of STATIONS.entries()) {
    const x0 = 52 + i * 87;
    const box = await plate(
      ctx,
      page,
      [x0, railY, x0 + 76, railY + 38],
      st.accent ? SWATCH.vermilion : SWATCH.paperWarm,
      LAYER.content,
    );
    await doc.setProperty("rectangle", box, "frameStrokeColor", {
      type: "colorRef",
      value: await doc.swatch(st.accent ? SWATCH.vermilion : SWATCH.slate),
    });
    await doc.setProperty("rectangle", box, "frameStrokeWeight", {
      type: "length",
      value: 0.75,
    });
    const label = await proseFrame(
      ctx,
      page,
      [x0 - 4, railY + 44, x0 + 84, railY + 96],
      [
        { text: st.name, style: STYLE.specLabel },
        { text: st.what, style: STYLE.caption },
      ],
    );
    elements.push(box, label.frameId);
  }

  const legend = await proseFrame(ctx, page, [48, 512, 456, 610], [
    {
      text:
        "Place writes a link and a fitting; ingest decodes the placed " +
        "bytes into the plugin's session; adjust runs the registered " +
        "kernel chain on the GPU; composite paints the result over the " +
        "frame as a Stage-A scene layer. Four of the five stations touch " +
        "only the session. Commit is the exception and the point: the " +
        "exported pixels re-enter the document through replaceImageBytes, " +
        "the inline lane the container round trip preserves.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(legend.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 130",
      "the darkroom loop: place → ingest → adjust → composite → commit",
      "commit = replaceImageBytes (inline, persistent)",
    ]),
  );

  return {
    title: "Ch.15 opener — The Darkroom",
    covers: [],
    elements,
  };
}
