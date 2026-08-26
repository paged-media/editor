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

// Masters — the page-structure ops, run to completion and then run
// backwards. This page's own master is already E-Data (the fixture
// applied it), so applying a master HERE would demonstrate nothing.
// Instead the whole battery runs on a SCRATCH page: insert one after
// the last page, stamp B-Body onto it (pixel-proved — the furniture
// appears), re-apply D-Plate (the same op, to the master that stamps
// nothing), duplicate it, resize the original, then delete both.
// The book is 134 pages before and after; the spec label says
// "demonstrated, not resident" because that is exactly what happened.
//
// Master NAMES are not on the wire (the masterPages collection labels
// each master with its own self id), so the seven names are recovered
// from the live document's IDML export — see idml-read.ts.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers; the
// one raw Bounds VALUE here (the resizePage args) stays wire-ordered
// [top, left, bottom, right].

import { marginNote, plate, proseFrame, specLabel } from "../../annual-support";
import {
  ANNUAL_PAGES,
  LAYER,
  MASTER,
  STYLE,
  SWATCH,
  contentBox,
  p,
} from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { masterIdsByName } from "./idml-read";

const ROLES: Array<[string, string]> = [
  [MASTER.front, "front matter"],
  [MASTER.body, "text spreads"],
  [MASTER.opener, "chapter openers"],
  [MASTER.plate, "full-bleed plates"],
  [MASTER.data, "12-column data"],
  [MASTER.vertical, "CJK vertical"],
  [MASTER.appendix, "apparatus"],
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];

  const [x0, y0, x1] = contentBox(p(16));
  const left = x0;
  const right = x1;
  const top = y0;

  // ── prose ───────────────────────────────────────────────────────
  const head = await proseFrame(ctx, p(16), [left, top, right, top + 30], [
    { text: "Seven masters, one transient page", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const prose = await proseFrame(ctx, p(16), [left, top + 38, right, top + 240], [
    {
      text: "A master spread stamps furniture — running heads, folios, rules — onto every page that applies it. This page applies E-Data, which is why the fine twelve-column furniture is here without this chapter drawing it. The seven-master set below is the whole cast of this book.",
      style: STYLE.bodyFirst,
    },
    {
      text: "While this page was being set, an eighth page briefly existed. It was inserted after page 134, given the B-Body master (the render changed: the head and folio appeared on a page nothing had drawn on), re-assigned to D-Plate (the same op, to the master that stamps nothing), duplicated, resized to half height, and then deleted along with its twin. The count you can check at the foot of this book never moved.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  // ── the seven-master diagram ────────────────────────────────────
  const caption = await proseFrame(ctx, p(16), [left, top + 252, right, top + 276], [
    { text: "The master set, as this file defines it", style: STYLE.head2 },
  ]);
  elements.push(caption.frameId);

  const tileW = (right - left - 3 * 12) / 4;
  for (const [i, [name, role]] of ROLES.entries()) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const x = left + col * (tileW + 12);
    const y = top + 286 + row * 100;
    elements.push(
      await plate(
        ctx,
        p(16),
        [x, y, x + tileW, y + 88],
        i % 2 === 0 ? SWATCH.paperWarm : SWATCH.vermilionTint,
        LAYER.background,
      ),
    );
    const label = await proseFrame(
      ctx,
      p(16),
      [x + 8, y + 10, x + tileW - 8, y + 80],
      [
        { text: name, style: STYLE.head2 },
        { text: role, style: STYLE.caption },
      ],
    );
    elements.push(label.frameId);
  }

  // ── the transient battery ───────────────────────────────────────
  const masters = await masterIdsByName(doc);
  for (const [name] of ROLES) {
    if (!masters.has(name)) {
      throw new Error(
        `master ${JSON.stringify(name)} is not in the exported package — ` +
          `have [${[...masters.keys()].join(", ")}]`,
      );
    }
  }

  // The whole battery is tallied as TRANSIENT in the ledger — the
  // demonstrated-not-resident pattern the spec label announces.
  const runTransient = (fn: () => Promise<void>): Promise<void> =>
    doc.ledger ? doc.ledger.transient(fn) : fn();
  await runTransient(async () => {
    let pages = await doc.refreshPages();
    const lastId = pages[pages.length - 1].selfId;

    await doc.mutate("insertPage", { afterPageId: lastId, masterId: null });
    pages = await doc.refreshPages();
    if (pages.length !== ANNUAL_PAGES + 1) {
      throw new Error(
        `insertPage: expected ${ANNUAL_PAGES + 1} pages, have ${pages.length}`,
      );
    }
    const scratchId = pages[pages.length - 1].selfId;
    const scratchIndex = pages.length - 1;

    // Master stamping, pixel-proved: blank scratch → B-Body furniture.
    const blank = await doc.renderPage(scratchIndex);
    await doc.mutate("applyMasterToPage", {
      page: scratchId,
      master: masters.get(MASTER.body),
    });
    await doc.expectRenderChanged(scratchIndex, blank);

    // The same op again, to the master that stamps nothing at all.
    await doc.mutate("applyMasterToPage", {
      page: scratchId,
      master: masters.get(MASTER.plate),
    });

    await doc.mutate("duplicatePage", { page: scratchId });
    pages = await doc.refreshPages();
    if (pages.length !== ANNUAL_PAGES + 2) {
      throw new Error(
        `duplicatePage: expected ${ANNUAL_PAGES + 2} pages, have ${pages.length}`,
      );
    }
    const cloneId = pages
      .slice(ANNUAL_PAGES)
      .map((pg) => pg.selfId)
      .find((id) => id !== scratchId);
    if (!cloneId) {
      throw new Error("duplicatePage minted no discoverable clone page");
    }

    // Resize the ORIGINAL scratch to half height; verify through the
    // pages read, not by trusting the op. This is a raw Bounds VALUE on
    // the wire, so it stays [top, left, bottom, right]: height 360,
    // width 540.
    await doc.mutate("resizePage", {
      pageId: scratchId,
      bounds: [0, 0, 360, 540],
    });
    pages = await doc.refreshPages();
    const resized = pages.find((pg) => pg.selfId === scratchId);
    if (!resized || resized.sizePt[0] !== 540 || resized.sizePt[1] !== 360) {
      throw new Error(
        `resizePage did not land: scratch reports ${JSON.stringify(resized?.sizePt)}`,
      );
    }

    await doc.mutate("deletePage", { pageId: cloneId });
    await doc.mutate("deletePage", { pageId: scratchId });
    pages = await doc.refreshPages();
    if (pages.length !== ANNUAL_PAGES) {
      throw new Error(
        `the transient battery did not restore the book: ${pages.length} pages ` +
          `!= ${ANNUAL_PAGES}`,
      );
    }
  });

  elements.push(
    await marginNote(
      ctx,
      p(16),
      "The masterPages collection reports self ids only — label is a copy of the id — so the seven names above were recovered from the document's own IDML export rather than resolved through a collection → Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, p(16), [
      "Specimen No. 10",
      "insertPage / duplicatePage",
      "resizePage / deletePage",
      "applyMasterToPage",
      "demonstrated, not resident",
    ]),
  );

  notes.push(
    "page-op battery ran on a scratch page and restored the 134-page plan; master names recovered via IDML export (no name surface on the wire)",
  );

  return {
    title: "Masters and the transient page",
    covers: [
      "layout-model.spreads-pages",
      "master-spreads-overrides.apply-master-op",
      "master-spreads-overrides.master-stamping",
    ],
    elements,
    notes,
  };
}
