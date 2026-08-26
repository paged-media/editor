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

// The cascade, self-illustrated — p28. A specimen list where each line
// prints its own basedOn chain, set IN that style, so the sample and
// its citation are the same ink. The chains are READ LIVE from the
// paragraphStyles collection (selfId → basedOn walked to the root),
// the same no-drift discipline as the legend's layer list: if the
// fixture's inheritance ever changes, this page prints the change.

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

interface StyleRow {
  selfId: string;
  name?: string;
  basedOn?: string | null;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const page = p(28);

  const head = await proseFrame(ctx, page, [60, 58, 492, 92], [
    { text: "The cascade, printed by itself", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const intro = await proseFrame(ctx, page, [60, 104, 492, 196], [
    {
      text:
        "A style rarely says everything it means. Body First declares " +
        "only that its first line does not indent; its font, size, " +
        "leading, ink and justification all arrive from Annual Body " +
        "through the basedOn chain, resolved at compose time. Each " +
        "line below prints its own chain, set in its own style - the " +
        "specimen and the citation are the same ink. The chains are " +
        "read live from the paragraphStyles collection, not typed, so " +
        "this page cannot drift from the document it sits in.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // Live read: selfId → summary, then walk basedOn to the root.
  const rows = (await doc.designer.collection(
    "paragraphStyles",
  )) as unknown as StyleRow[];
  const byId = new Map(rows.map((r) => [r.selfId, r]));
  const chainOf = (name: string): string[] => {
    let current = rows.find((r) => r.name === name);
    if (!current) {
      throw new Error(`paragraphStyles has no entry named ${name}`);
    }
    const chain: string[] = [];
    for (let hop = 0; current && hop < 8; hop += 1) {
      chain.push(current.name ?? current.selfId);
      current = current.basedOn ? byId.get(current.basedOn) : undefined;
    }
    return chain;
  };

  const listed = [
    STYLE.bodyFirst,
    STYLE.bodySmall,
    STYLE.footnote,
    STYLE.bulletList,
    STYLE.numbered1,
    STYLE.numbered2,
    STYLE.catalogEntry,
    STYLE.indexSub,
    STYLE.caption,
    STYLE.marginNote,
    STYLE.specLabel,
  ];
  const paras = [
    {
      text: "Annual Body - the root; every chain below ends here.",
      style: STYLE.body,
    },
    ...listed.map((name) => {
      const chain = chainOf(name);
      const text =
        chain.length > 1
          ? chain.join(" <- ")
          : `${chain[0]} - declared free-standing, no basedOn`;
      return { text, style: name };
    }),
  ];
  const list = await proseFrame(ctx, page, [60, 208, 492, 500], paras);
  elements.push(list.frameId);

  const outro = await proseFrame(ctx, page, [60, 512, 492, 610], [
    {
      text:
        "Read the list as evidence, not decoration: Numbered 2 walks " +
        "two hops to the root and inherits its numbering through the " +
        "first; Caption stands alone and must say everything itself. " +
        "Direct formatting still outranks any of them - the cascade " +
        "resolves direct overrides above character styles above " +
        "paragraph styles - which is how the next page will dress a " +
        "style it has only just invented.",
      style: STYLE.body,
    },
  ]);
  elements.push(outro.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 31",
      "basedOn chains",
      "(live read)",
      "styles.cascade",
    ]),
  );

  return {
    title: "The cascade, self-illustrated",
    covers: ["styles.cascade", "styles.based-on-chain"],
    elements,
  };
}
