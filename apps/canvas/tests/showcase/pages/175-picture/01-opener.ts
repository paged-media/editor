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

// Ch.13 opener (p71, C-Opener recto) — the number, the title, a deck,
// and the hero: the dolomites photograph, full measure, cut to its
// own 3:2 so the placement is aspect-true without a crop. The frame is
// sized to the image rather than the image distorted to the frame —
// stated in the credit line, which also carries the photographer's
// name, because that is the professional habit even when the licence
// does not demand it. The keyline is the fixture's Plate Frame object
// style, applied by name through appliedObjectStyle.

import { statSync } from "node:fs";

import { assignLayer, proseFrame, specLabel } from "../../annual-support";
import { LAYER, OBJECT_STYLE, STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { photo, replaceBytesFromFile } from "./00-support";

const HERO = photo("pexels-618833-dolomites.jpg");
/** 2200 × 1469 px (checked against the committed file). At the full
 *  432 pt measure that is 288.4 pt tall — the plate deliberately
 *  breaks the bottom margin, as plates in this book may. */
const HERO_W = 2200;
const HERO_H = 1469;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const page = p(71);
  const elements: string[] = [];

  const number = await proseFrame(ctx, page, [48, 96, 220, 186], [
    { text: "13", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [48, 190, 480, 242], [
    { text: "The Picture", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [48, 254, 448, 338], [
    {
      text:
        "A photograph enters a document twice: once as pixels the engine " +
        "must decode, and once as a claim about where those pixels came " +
        "from. This chapter places the same image through six codecs, " +
        "keeps an EPS honestly undecoded, and works the fitting model — " +
        "then shows the inline lane that carries every one of these " +
        "pictures through the container round trip.",
      style: STYLE.deck,
    },
  ]);
  elements.push(number.frameId, title.frameId, deck.frameId);

  // ── the hero ─────────────────────────────────────────────────────
  const heroBox: [number, number, number, number] = [
    48,
    366,
    480,
    366 + (432 * HERO_H) / HERO_W,
  ];
  const hero = await doc.rectangle(pg, heroBox);
  await assignLayer(ctx, "rectangle", hero, LAYER.content);
  elements.push(hero);
  // The link says which file; the bytes make it render and persist.
  await doc.mutate("placeImage", {
    elementId: hero,
    uri: "assets/photos/pexels-618833-dolomites.jpg",
    fit: "FillProportionally",
  });
  const heroBytes = await replaceBytesFromFile(ctx, hero, HERO);
  // The fixture's Plate Frame object style: a half-point ink keyline,
  // resolved BY NAME so a fixture drift fails loudly here.
  const objectStyles = (await doc.designer.collection(
    "objectStyles",
  )) as unknown as Array<{ selfId: string; name?: string }>;
  const plateFrame = objectStyles.find(
    (s) => s.name === OBJECT_STYLE.plateFrame,
  );
  if (!plateFrame) {
    throw new Error(
      `objectStyles has no entry named ${OBJECT_STYLE.plateFrame}`,
    );
  }
  await doc.setProperty("rectangle", hero, "appliedObjectStyle", {
    type: "text",
    value: plateFrame.selfId,
  });

  const credit = await proseFrame(ctx, page, [48, 342, 480, 360], [
    {
      text:
        `Alpine sunburst at sunrise · Sagui Andrea, Pexels · ${HERO_W} × ` +
        `${HERO_H} px, ${statSync(HERO).size.toLocaleString("en-US")} bytes ` +
        `of baseline JPEG, inline · frame cut to the image's own 3:2 · ` +
        `keyline: Plate Frame (appliedObjectStyle)`,
      style: STYLE.specValue,
    },
  ]);
  elements.push(credit.frameId);
  void heroBytes;

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 110",
      "placeImage + replaceImageBytes (inline)",
      "appliedObjectStyle: Plate Frame",
    ]),
  );

  return {
    title: "Ch.13 opener — The Picture",
    covers: ["images-graphics.placed-images"],
    elements,
  };
}
