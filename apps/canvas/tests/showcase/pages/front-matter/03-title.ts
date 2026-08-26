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

// Frontispiece + title page. The verso diagrams the five-stage
// pipeline in slate plates and hairlines; the recto sets the title in
// the display chain. Both pages are pure native authoring — the
// annual's first ordinary spread.

import { plate, proseFrame, specLabel, assignLayer } from "../../annual-support";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const versoId = ctx.pageIds[0];
  const elements: string[] = [];

  // Verso: parse → scene → text → compose → present, as plates joined
  // by lines (insertLine is its own wire op — claimed below).
  const stages = ["parse", "scene", "text", "compose", "present"];
  for (const [i, stage] of stages.entries()) {
    const y = 120 + i * 96;
    elements.push(
      await plate(ctx, p(2), [96, y, 306, y + 56], SWATCH.slate, LAYER.content),
    );
    const label = await proseFrame(ctx, p(2), [316, y + 14, 456, y + 44], [
      { text: stage, style: STYLE.head2 },
    ]);
    elements.push(label.frameId);
    if (i < stages.length - 1) {
      const line = await doc.mutateId("insertLine", {
        pageId: versoId,
        start: [201, y + 56],
        end: [201, y + 96],
      });
      await doc.setProperty("graphicLine", line, "frameStrokeColor", {
        type: "colorRef",
        value: await doc.swatch(SWATCH.vermilion),
      });
      await assignLayer(ctx, "graphicLine", line, LAYER.content);
      elements.push(line);
    }
  }

  // Recto: the title page.
  const title = await proseFrame(ctx, p(3), [96, 180, 480, 420], [
    { text: "The Paged Annual", style: STYLE.chapterTitle },
    { text: "Volume One", style: STYLE.deck },
    {
      text: "A specimen of the composing engine, its plugins, and the interchange they serve.",
      style: STYLE.deck,
    },
  ]);
  elements.push(title.frameId);
  elements.push(
    await specLabel(ctx, p(3), [
      "Specimen No. 1",
      "insertTextFrame",
      "applyStyle ¶",
      "insertLine",
    ]),
  );

  return {
    title: "Frontispiece and title",
    covers: [
      "frames-paths.line.insert",
      "frames-paths.frame.insert",
      "stories-text.text.insert",
      "stories-text.style-apply-range",
    ],
    elements,
  };
}
