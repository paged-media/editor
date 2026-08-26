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

// How to read this book: the specimen-label grammar, the three honesty
// glyphs, the layer plan (read LIVE from the engine, not typed), and
// the condition legend. This page is the contract the rest of the
// annual keeps.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { CONDITION, LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];

  const intro = await proseFrame(ctx, p(7), [96, 120, 444, 300], [
    { text: "How to read this book", style: STYLE.head1 },
    {
      text: "Every demonstration is a numbered Specimen. Its label — set in the outside margin, on the Annotations layer, under the Spec-Notes condition — names the wire op, property path, or registry row it proves. Hide Spec-Notes and the ledger becomes a clean annual; show it and every page cites its own evidence.",
      style: STYLE.body,
    },
    {
      text: "■ demonstrated in full · ◪ demonstrated to a recorded limit, with a margin note pointing at Appendix A · □ not modelled by declaration, listed only in the appendix. Nothing on any page pretends.",
      style: STYLE.body,
    },
  ]);
  elements.push(intro.frameId);

  // The layer plan, read from the engine so the legend cannot drift.
  const layers = await doc.designer.layers();
  const layerLines = (layers as Array<{ name: string }>)
    .map((l) => l.name)
    .join(" · ");
  const layerBlock = await proseFrame(ctx, p(7), [96, 320, 444, 400], [
    { text: "Layers, bottom first", style: STYLE.head2 },
    { text: layerLines, style: STYLE.codeBlock },
    {
      text: `Prose sits on ${LAYER.content}; plates on ${LAYER.background}; every label on ${LAYER.annotations}.`,
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(layerBlock.frameId);

  // Condition legend with its three swatch chips.
  const chips: Array<[string, string]> = [
    [SWATCH.vermilion, CONDITION.specNotes],
    [SWATCH.slate, CONDITION.printOnly],
    [SWATCH.screenBlue, CONDITION.screenOnly],
  ];
  for (const [i, [swatchName, label]] of chips.entries()) {
    const y = 424 + i * 26;
    elements.push(await plate(ctx, p(7), [96, y, 110, y + 14], swatchName, LAYER.content));
    const lab = await proseFrame(ctx, p(7), [120, y - 2, 360, y + 18], [
      { text: label, style: STYLE.caption },
    ]);
    elements.push(lab.frameId);
  }

  elements.push(
    await specLabel(ctx, p(7), ["Specimen No. 4", "layers (live read)", "legend"]),
  );

  return {
    title: "How to read this book",
    covers: ["layers.model"],
    elements,
  };
}
