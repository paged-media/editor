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

// The self-exposing grid — this spread draws its own construction on
// the Grid layer: the mirrored margin boxes, the six-column field on
// the verso, the 13 pt baseline ladder on the recto. Every coordinate
// is computed from the same constants the fixture's margin preferences
// declare, so if the two ever disagree, this spread is where the
// disagreement becomes visible.
//
// Alongside the printed anatomy, the LIVE guide ops run against this
// spread's own <Guide> set: insert both orientations, move one, delete
// the other, and re-read the survivors from the spreads collection.
// One behaviour is recorded rather than assumed: guide ids are
// POSITIONAL (Guide/<spread>/<index>), so deleting one guide re-indexes
// the survivors — a stale GuideSummary id may address a different
// guide after any delete. The verification below therefore checks by
// orientation + position, never by remembered id.
//
// The recto is also the fixture's override page: its running head was
// replaced at generation time by a page-local override, and the prose
// here explains what the reader is (not) seeing (Q-14).
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { marginNote, plate, proseFrame, specLabel } from "../../annual-support";
import {
  BASELINE_PT,
  LAYER,
  OVERRIDE_HEAD_TEXT,
  STYLE,
  SWATCH,
  contentBox,
  p,
} from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];

  const [vx0, vy0, vx1, vy1] = contentBox(p(14));
  const [rx0, ry0, rx1, ry1] = contentBox(p(15));
  const versoPageId = ctx.pageIds[0];
  const rectoPageId = ctx.pageIds[1];

  const slate = await doc.swatch(SWATCH.slate);

  /** A stroked, unfilled rectangle on the Grid layer — the hairline. */
  const hairlineBox = async (
    pageId: string,
    box: [number, number, number, number],
    weight: number,
  ): Promise<string> => {
    const id = await doc.rectangle(pageId, box);
    await doc.setProperty("rectangle", id, "frameFillColor", {
      type: "colorRef",
      value: null,
    });
    await doc.setProperty("rectangle", id, "frameStrokeColor", {
      type: "colorRef",
      value: slate,
    });
    await doc.setProperty("rectangle", id, "frameStrokeWeight", {
      type: "length",
      value: weight,
    });
    const layerId = await doc.layerId(LAYER.grid);
    await doc.setProperty("rectangle", id, "itemLayer", {
      type: "text",
      value: layerId,
    });
    return id;
  };

  // ── the mirrored margin boxes, one hairline each ────────────────
  elements.push(await hairlineBox(versoPageId, [vx0, vy0, vx1, vy1], 0.75));
  elements.push(await hairlineBox(rectoPageId, [rx0, ry0, rx1, ry1], 0.75));

  // ── verso: the six-column field (62 pt columns, 12 pt gutters) ──
  const columnWidth = (vx1 - vx0 - 5 * 12) / 6;
  for (let i = 0; i < 6; i += 1) {
    const x = vx0 + i * (columnWidth + 12);
    const col = await plate(
      ctx,
      p(14),
      [x, vy0, x + columnWidth, vy1],
      SWATCH.vermilionTint,
      LAYER.grid,
    );
    await doc.setProperty("rectangle", col, "frameOpacity", {
      type: "length",
      value: 30,
    });
    elements.push(col);
  }

  // ── recto: the 13 pt baseline ladder across the live area ───────
  // One thin slate rect per baseline (a GraphicLine cannot carry
  // frameOpacity — the set-property table has no GraphicLine arm for
  // it — so the ladder is drawn as 0.3 pt rects, which can).
  for (let y = ry0; y <= ry1; y += BASELINE_PT) {
    const rung = await plate(
      ctx,
      p(15),
      [rx0, y - 0.15, rx1, y + 0.15],
      SWATCH.slate,
      LAYER.grid,
    );
    await doc.setProperty("rectangle", rung, "frameOpacity", {
      type: "length",
      value: 30,
    });
    elements.push(rung);
  }

  // ── live guides on this spread ──────────────────────────────────
  // Guide ops address the SPREAD, so find the spread that owns the
  // verso by walking the spreads collection's page counts — never by
  // arithmetic on an assumed 1/2/2/2… layout.
  const spreads = (await doc.designer.collection("spreads")) as Array<{
    selfId: string;
    pageCount: number;
  }>;
  let acc = 0;
  let spreadId: string | null = null;
  for (const s of spreads) {
    if (p(14) >= acc && p(14) < acc + s.pageCount) {
      spreadId = s.selfId;
      break;
    }
    acc += s.pageCount;
  }
  if (!spreadId) {
    throw new Error(
      `no spread covers page index ${p(14)} — the spreads collection ` +
        `reports ${spreads.length} spreads`,
    );
  }

  await doc.mutate("insertGuide", {
    spreadId,
    orientation: "vertical",
    position: vx0,
    pageIndex: 0,
  });
  await doc.mutate("insertGuide", {
    spreadId,
    orientation: "horizontal",
    position: ry0 + 10 * BASELINE_PT,
    pageIndex: 1,
  });

  // Guides get positional ids (Guide/<spread>/<index>) and insertGuide
  // surfaces no createdId — re-read them from the spreads collection,
  // the ask-don't-assume way.
  const readGuides = async () => {
    const all = (await doc.designer.collection("spreads")) as Array<{
      selfId: string;
      guides?: Array<{
        id: string;
        orientation: string;
        position: number;
        pageIndex: number;
      }>;
    }>;
    return all.find((s) => s.selfId === spreadId)?.guides ?? [];
  };
  let guides = await readGuides();
  const vertical = guides.find(
    (g) => g.orientation === "vertical" && g.position === vx0,
  );
  const horizontal = guides.find(
    (g) => g.orientation === "horizontal" && g.pageIndex === 1,
  );
  if (!vertical || !horizontal) {
    throw new Error(
      `inserted guides did not come back from the spreads collection — ` +
        `have ${JSON.stringify(guides)}`,
    );
  }

  const movedTo = ry0 + 23 * BASELINE_PT;
  await doc.mutate("moveGuide", { guideId: horizontal.id, position: movedTo });
  await doc.mutate("deleteGuide", { guideId: vertical.id });

  // Verify by orientation + position, never by remembered id: the
  // delete re-indexes the survivor onto the id the vertical used to
  // hold (first run of this chapter proved it — the horizontal came
  // back as .../0 after .../0 was deleted).
  guides = await readGuides();
  const survivor = guides.find(
    (g) => g.orientation === "horizontal" && g.position === movedTo,
  );
  const staleVertical = guides.find(
    (g) => g.orientation === "vertical" && g.position === vx0,
  );
  if (!survivor || staleVertical) {
    throw new Error(
      `guide CRUD did not settle as expected — have ${JSON.stringify(guides)}`,
    );
  }

  // ── the prose that reads the spread it sits on ──────────────────
  const versoProse = await proseFrame(
    ctx,
    p(14),
    [vx0 + 16, vy0 + 26, vx1 - 90, vy0 + 320],
    [
      { text: "The grid, shown working", style: STYLE.head1 },
      {
        text: "This spread is printed on top of its own construction. The hairline box is the margin preference — 54 over 81, 48 inside, 60 outside, mirrored across the gutter. The six tinted columns are the body grid, 62 points on a 12 point gutter. On the facing page, every thin rule is one 13 point baseline; every leading value in the style battery is a multiple of it.",
        style: STYLE.bodyFirst,
      },
      {
        text: "One ruler guide is live on this spread right now: inserted, moved down thirteen baselines by the wire, and left standing while its vertical companion was deleted. You cannot see it here, and that is the point the margin records.",
        style: STYLE.body,
      },
    ],
  );
  elements.push(versoProse.frameId);

  const rectoProse = await proseFrame(
    ctx,
    p(15),
    [rx0 + 16, ry0 + 26, rx1 - 16, ry0 + 320],
    [
      { text: "An override, kept", style: STYLE.head1 },
      {
        text: `Look at the top of this page. Every other body recto in this book carries the running head the B-Body master stamps; this one reads ${OVERRIDE_HEAD_TEXT} instead. That head is not typed on this page by this chapter — it is a page-local override recorded in the fixture, and the machinery under it is the demonstration: a page that overrides a master item suppresses the master's copy without detaching from the master.`,
        style: STYLE.bodyFirst,
      },
      {
        text: "Everything else the master stamps — the folio below, the verso head opposite — keeps tracking the master. Delete the override and the stamped head would return; re-apply the master and the override would still win. One item disagrees; the rest of the furniture does not even notice.",
        style: STYLE.body,
      },
    ],
  );
  elements.push(rectoProse.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(14),
      "Guides are an editor overlay: the wire holds them (SpreadSummary.guides) and the canvas draws them violet, but they are never emitted into the display list or any export. The surviving guide on this spread is real and invisible → Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, p(14), [
      "Specimen No. 8",
      "insertGuide / moveGuide",
      "deleteGuide",
      "frameOpacity · frameBounds",
    ]),
  );
  elements.push(
    await specLabel(ctx, p(15), [
      "Specimen No. 9",
      "Q-14 override suppression",
      "fixture-authored head",
    ]),
  );

  notes.push(
    "guides are overlay-only by design — demonstrated live, invisible in the render (margin note on p14)",
    "deleteGuide re-indexes the survivors' positional ids — a stale GuideSummary id addresses a different guide after a delete",
  );

  return {
    title: "The self-exposing grid + live guides",
    covers: [
      "layout-model.guides",
      "geometry-coordinates.geometric-bounds",
      "effects-transparency.opacity",
      "frames-paths.frame.insert",
      "master-spreads-overrides.override-resolution",
    ],
    elements,
    notes,
  };
}
