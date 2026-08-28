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

// The banked paint page. The FULL gradient/pattern/dash exhibits live
// in 07-paint.ts and run green in isolation — but against the grown
// document their composition hangs the engine indefinitely, and four
// instrumented runs moved the stall wherever the content was trimmed
// (dot presets banked, the field quartered — the hang survived every
// cut). Rather than ransom the book to one page, the chain carries
// this stand-in: the record of the hang, in the annual's own voice.
// → Appendix A.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const page = p(82);
  const elements: string[] = [];

  const head = await proseFrame(ctx, page, [60, 104, 476, 146], [
    { text: "Paint, banked", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const body = await proseFrame(ctx, page, [60, 160, 476, 380], [
    {
      text:
        "This page was designed to carry paged.draw's paint lane: the " +
        "two gradient commands minting their stop swatches, a brick " +
        "pattern field of real copies, and the dash presets over a " +
        "selected line. In isolation, every one of those exhibits runs " +
        "and verifies. Against this document — ninety pages of authored " +
        "content — the engine hangs indefinitely while composing this " +
        "page once the exhibits are in place, and it kept hanging as " +
        "the exhibits were trimmed: without the dotted presets, with a " +
        "quarter of the pattern, with lines instead of paths.",
      style: STYLE.body,
    },
    {
      text:
        "A specimen book that hid that fact would be a brochure. The " +
        "paint lane's coverage is claimed nowhere on this page; its " +
        "commands are proven by the isolated run this module cites, and " +
        "the hang is the finding the margin carries.",
      style: STYLE.body,
    },
  ]);
  elements.push(body.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 125",
      "the paint lane: proven in isolation",
      "in-chain composition: hangs — banked",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "Composing this page with the paint exhibits in place hangs the " +
        "engine indefinitely against the grown document (deterministic; " +
        "survives every content trim; green in isolation). The full " +
        "module is 07-paint.ts, runnable solo. → Appendix A",
    ),
  );

  return {
    title: "Paint — banked in-chain, proven in isolation",
    covers: [],
    elements,
  };
}
