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

// Repeats + symbols — p83, B-Body recto.
//
// A REPEAT is an object transform with expand/release — pattern's
// sibling, spelled the other way round — and it was this repo's first
// ONE-undo-step build: one batch inserts, binds (C-15 bindCreated),
// paints, links and groups every instance. Radial, grid and mirror
// each demonstrate below; Update re-plans the grid with new
// parameters, Expand stops tracking the ring while keeping every
// instance as artwork.
//
// A SYMBOL is a named artwork DEFINITION in a container part, and an
// INSTANCE is re-emitted native geometry carrying a per-LEAF link
// (core has no symbol node, no duplicate op, and a group cannot hold
// metadata). Redefine REBUILDS every linked instance from the new
// capture — which is why a broken link is the way to keep a
// deviation, and the page shows exactly that.

import { expect } from "@playwright/test";

import { withActivePage } from "../../active-page";
import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import { ConsoleTap, geometryOf, newRefs, settle, type Ref } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  corner,
  draw,
  path,
  polygons,
  propOf,
  readDrawPart,
  reseat,
  spreadOffset,
} from "./00-support";

interface RepeatLibrary {
  repeats: Array<{ id: string; name: string }>;
}
interface SymbolLibrary {
  symbols: Array<{ id: string; name: string }>;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(83);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];
  const offset = await spreadOffset(ctx, pageId);
  // eslint-disable-next-line no-console
  console.log(`[200] p83 spread offset measured: [${offset.join(", ")}]`);
  const onOrigin = offset[0] === 0 && offset[1] === 0;

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const marigold = await doc.swatch(SWATCH.labMarigold);
  const screenBlue = await doc.swatch(SWATCH.screenBlue);
  const layerContent = await doc.layerId(LAYER.content);

  const layerBatch = async (refs: Ref[]): Promise<void> => {
    if (refs.length === 0) return;
    await doc.batch(
      refs.map((ref) => ({
        op: "setElementProperty",
        args: {
          elementId: ref,
          path: "itemLayer",
          value: { type: "text", value: layerContent },
        },
      })),
    );
  };

  const head = await proseFrame(ctx, page, [left, 54, right, 82], [
    { text: "Repeats and symbols", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [left, 86, right, 126], [
    {
      text:
        "Two ways to say 'again'. A repeat transforms copies of a source and stays re-plannable; a symbol is a named definition whose placed instances follow a redefine - until one breaks its link on purpose.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the three repeat kinds ───────────────────────────────────────
  const mint = async (
    suffix: string,
    payload: Record<string, unknown>,
  ): Promise<Ref[]> => {
    const before = await polygons(ctx);
    await withActivePage(ctx.page, pageId, () =>
      draw(ctx, suffix, { ...payload, fitToArtboard: onOrigin }),
    );
    const grew = await settle(
      ctx.page,
      async () => (await polygons(ctx)).length > before.length,
      15_000,
    );
    expect(grew, `${suffix} minted instances`).toBe(true);
    const minted = await newRefs(ctx.page, "polygon", before);
    await reseat(ctx, minted, offset);
    // Deliberately NOT layered: the instances ride the plugin's own
    // group, the spread's top-level item there — and an IDML <Group>
    // carries no ItemLayer of its own.
    for (const ref of minted) elements.push(ref.id);
    return minted;
  };

  // Radial — a petal on a ring.
  const petal = await path(
    ctx,
    pageId,
    [corner(116, 168), corner(128, 190), corner(116, 212), corner(104, 190)],
    false,
    { fill: vermilion },
  );
  elements.push(petal);
  await doc.select("polygon", petal);
  await mint("makeRadialRepeat", {
    name: "Annual ring",
    count: 8,
    radiusPt: 40,
    rotateInstances: true,
  });

  // Grid — a chip, 3×3 first, re-planned to 5×2 by Update.
  const chip = await path(
    ctx,
    pageId,
    [corner(228, 150), corner(248, 150), corner(248, 170), corner(228, 170)],
    false,
    { fill: screenBlue },
  );
  elements.push(chip);
  await doc.select("polygon", chip);
  await mint("makeGridRepeat", {
    name: "Annual field",
    rows: 3,
    columns: 3,
    spacing: [8, 8],
  });

  // Mirror — an asymmetric pennant and its reflection.
  const pennant = await path(
    ctx,
    pageId,
    [corner(398, 150), corner(432, 162), corner(398, 196)],
    false,
    { fill: marigold },
  );
  elements.push(pennant);
  await doc.select("polygon", pennant);
  await mint("makeMirrorRepeat", { name: "Annual wings", angleDeg: 90 });

  // Update the grid (re-plan: every instance a NEW element) + expand
  // the ring (stop tracking, keep the artwork).
  const repLib = await readDrawPart<RepeatLibrary>(ctx, "repeat.json");
  const gridRec = repLib?.repeats.find((r) => r.name === "Annual field");
  const ringRec = repLib?.repeats.find((r) => r.name === "Annual ring");
  expect(gridRec && ringRec, "the repeat recipes are in the part").toBeTruthy();
  // UPDATE — attempted, and REPORTED rather than asserted: against the
  // 0.62 engine the one-batch dissolve-and-regroup an update rides is
  // refused at group re-create ("a member already belongs to another
  // group"), where the bundle measured a clean 1-undo update on the
  // protocol-60 wasm. The page records whichever this engine does.
  let updateWorked = false;
  {
    const tap = new ConsoleTap(ctx.page, /updateRepeat/);
    const before = await polygons(ctx);
    await withActivePage(ctx.page, pageId, () =>
      draw(ctx, "updateRepeat", {
        repeatId: gridRec!.id,
        rows: 2,
        columns: 5,
        spacing: [10, 10],
        fitToArtboard: onOrigin,
      }),
    );
    updateWorked = await settle(
      ctx.page,
      async () => (await newRefs(ctx.page, "polygon", before)).length > 0,
      15_000,
    );
    tap.stop();
    if (updateWorked) {
      const minted = await newRefs(ctx.page, "polygon", before);
      await reseat(ctx, minted, offset);
      for (const ref of minted) elements.push(ref.id);
    } else {
      notes.push(
        `updateRepeat refused on this engine — ${tap.join().slice(0, 300) || "no engine sentence captured"}`,
      );
    }
  }
  await draw(ctx, "expandRepeat", { repeatId: ringRec!.id });
  const ringExpanded = await settle(
    ctx.page,
    async () => {
      const lib = await readDrawPart<RepeatLibrary>(ctx, "repeat.json");
      return !(lib?.repeats ?? []).some((r) => r.id === ringRec!.id);
    },
    10_000,
  );
  expect(ringExpanded, "expand dropped the ring's recipe").toBe(true);

  const repeatCaption = await proseFrame(ctx, page, [left, 300, right, 364], [
    {
      text: updateWorked
        ? "Left: one petal, radially repeated 8 times on a 40 pt ring, every instance rotated to follow - then EXPANDED, so the rosette is now plain artwork with no recipe. Middle: a chip gridded 3x3, then re-planned to 5x2 by Update; every instance is a new element each time, which is what re-plannable honestly costs. Right: a pennant and its mirror twin over a vertical axis. Each make was ONE undo step - one batch inserts, binds, paints, links and groups."
        : "Left: one petal, radially repeated 8 times on a 40 pt ring, every instance rotated to follow - then EXPANDED, so the rosette is now plain artwork with no recipe. Middle: a chip gridded 3x3; its re-plan by Update was REFUSED by this engine at the group re-create, and the margin note carries the sentence - the 3x3 field stands as made. Right: a pennant and its mirror twin over a vertical axis. Each make was ONE undo step.",
      style: STYLE.caption,
    },
  ]);
  elements.push(repeatCaption.frameId);

  // ── symbols: define / place ×3 / redefine / break link ───────────
  const diamond = await path(
    ctx,
    pageId,
    [corner(88, 412), corner(106, 430), corner(88, 448), corner(70, 430)],
    false,
    { fill: vermilion, stroke: ink, weight: 1.5 },
  );
  const dot = await path(
    ctx,
    pageId,
    [corner(84, 456), corner(92, 456), corner(92, 464), corner(84, 464)],
    false,
    { fill: ink },
  );
  elements.push(diamond, dot);
  await layerBatch([
    { kind: "polygon", id: diamond },
    { kind: "polygon", id: dot },
  ]);

  await doc.designer.selectElements([
    { kind: "polygon", id: diamond },
    { kind: "polygon", id: dot },
  ]);
  await draw(ctx, "defineSymbol", { name: "Annual badge" });
  const symLib = await readDrawPart<SymbolLibrary>(ctx, "symbols.json");
  const badge = symLib?.symbols.find((s) => s.name === "Annual badge");
  expect(badge, "the symbol library holds Annual badge").toBeTruthy();

  const placeXs = [180, 262, 344];
  let instanceLeaves: Ref[] = [];
  for (const x of placeXs) {
    const before = await polygons(ctx);
    await withActivePage(ctx.page, pageId, () =>
      draw(ctx, "placeSymbolInstance", {
        symbolId: badge!.id,
        x,
        y: 412,
        pageId,
      }),
    );
    const placed = await settle(
      ctx.page,
      async () => (await polygons(ctx)).length > before.length,
      15_000,
    );
    expect(placed, `instance at x=${x} placed`).toBe(true);
    const minted = await newRefs(ctx.page, "polygon", before);
    await reseat(ctx, minted, offset);
    instanceLeaves.push(...minted);
    for (const ref of minted) elements.push(ref.id);
  }

  // THE DEFINITION MOVES, THE INSTANCES DO NOT — shown live, without
  // running the rebuild this engine refuses. The source turns blue; a
  // placed instance is STATIC re-emitted geometry, so every badge on
  // the row keeps the look it was placed with. The verb that would
  // carry the new look outward — Redefine — rebuilds each instance by
  // dissolving and re-creating its group in one batch, the exact shape
  // this engine refuses (the sentence is recorded on this page's
  // margin for Update, and again on the next page for Reverse spine);
  // a half-applied rebuild here would strand duplicate artwork, so the
  // page demonstrates the STATIC half and names the refused half
  // rather than printing a wreck.
  await doc.setProperty("polygon", diamond, "frameFillColor", {
    type: "colorRef",
    value: screenBlue,
  });

  // BREAK LINK — the first instance leaves the family (metadata only,
  // works on any engine). Its leaves are found by MEASURED geometry
  // (nearest x=180), never by assumed mint order.
  const geo = await geometryOf(ctx.page, instanceLeaves);
  const firstLeaves = geo
    .filter((g) => g.bounds)
    .filter((g) => {
      const cx = (g.bounds![1] + g.bounds![3]) / 2 - offset[0];
      return cx > placeXs[0] - 40 && cx < placeXs[0] + 60;
    })
    .map((g) => g.ref);
  expect(firstLeaves.length, "found the first instance's leaves").toBeGreaterThan(0);
  await doc.designer.selectElements(firstLeaves);
  await draw(ctx, "breakSymbolLink");
  notes.push(
    "redefineSymbol deliberately NOT run: its per-instance rebuild rides the one-batch dissolve-and-regroup this engine refuses (recorded for updateRepeat on this page), and a half-applied rebuild strands artwork",
  );

  const symCaption = await proseFrame(ctx, page, [left, 496, right, 566], [
    {
      text:
        "One badge defined from the two source shapes at far left and placed three times - each instance re-emitted native geometry with a per-leaf link. The source then turned blue, and no badge followed: an instance is STATIC (core has no symbol node and no duplicate op), so a new look travels only through Redefine's rebuild - which this engine refuses at the instance-group re-create, the same one-batch dissolve-and-regroup seam the margin note records for Update. The first instance also broke its link: it now would not follow even a successful redefine.",
      style: STYLE.caption,
    },
  ]);
  elements.push(symCaption.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 121",
      "makeRadial/Grid/MirrorRepeat · update · expand",
      "defineSymbol · place ×3 · breakSymbolLink",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      (updateWorked
        ? ""
        : "updateRepeat's one-batch dissolve-and-regroup is refused by this engine (\"a member already belongs to another group\") - measured green on the protocol-60 wasm, refused on 0.62; ") +
        "symbols v0 refuses TEXT (no wire op copies a story) and has no symbol-set tools, nine-slice or 3D mapping; Redefine's per-instance rebuild rides the same refused batch shape and is deliberately not run here → Appendix A",
    ),
  );
  notes.push(
    "plugin-draw.symbols is registry-partial — demonstrated on this page, deliberately not claimed",
  );

  return {
    title: "Repeats and symbols",
    covers: ["plugin-draw.repeats"],
    elements,
    notes,
  };
}
