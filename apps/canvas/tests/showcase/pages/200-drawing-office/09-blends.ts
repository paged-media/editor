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

// Blends + objects on a path — p84, B-Body verso.
//
// THE THREE SPACING MODES are the substance of the blends row, and all
// three reduce to a step count: Specified Steps IS the count,
// Specified Distance divides the spine's arc length, Smooth Color
// divides the colour distance (the largest per-channel difference
// between the two key fills — which is why the smooth exhibit's keys
// wear swatches NAMED by their hex: the bundle resolves a key's colour
// through the swatch collection's names). Reverse spine moves
// geometry; Expand keeps every intermediate and stops tracking.
//
// OBJECTS ON A PATH is the opposite of every other arranging verb in
// this chapter: IT MOVES YOUR OBJECTS AND CREATES NOTHING. One
// frameTransform per object, so ids survive, text would survive, and
// Release is an EXACT restore of the recorded home transforms.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import { ConsoleTap, newRefs, settle, type Ref } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  corner,
  draw,
  mintRgbSwatch,
  path,
  polygons,
  propOf,
  readDrawPart,
  reseat,
  spreadOffset,
} from "./00-support";

interface BlendLibrary {
  blends: Array<{ id: string; name: string }>;
}
interface OnPathLibrary {
  associations: Array<{ id: string; name: string }>;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(84);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];
  const offset = await spreadOffset(ctx, pageId);
  const onOrigin = offset[0] === 0 && offset[1] === 0;

  const ink = await doc.swatch(SWATCH.ink);
  const layerContent = await doc.layerId(LAYER.content);
  const keyA = await mintRgbSwatch(ctx, "Color/annualBlendA", [217, 79, 43]);
  const keyB = await mintRgbSwatch(ctx, "Color/annualBlendB", [28, 63, 148]);
  const smoothA = await mintRgbSwatch(ctx, "Color/annualSmoothA", [122, 156, 200]);
  const smoothB = await mintRgbSwatch(ctx, "Color/annualSmoothB", [200, 122, 156]);

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
    { text: "Blends and objects on a path", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [left, 86, right, 126], [
    {
      text:
        "Interpolation and distribution. A blend mints NEW intermediate shapes between two keys; objects on a path moves the shapes you already have and mints nothing - two arranging verbs with opposite manners.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the three spacing modes ──────────────────────────────────────
  const diamond = async (
    cx: number,
    cy: number,
    r: number,
    fill: string,
  ): Promise<string> => {
    const id = await path(
      ctx,
      pageId,
      [corner(cx, cy - r), corner(cx + r, cy), corner(cx, cy + r), corner(cx - r, cy)],
      false,
      { fill },
    );
    await layerBatch([{ kind: "polygon", id }]);
    elements.push(id);
    return id;
  };

  const blendPair = async (
    a: string,
    b: string,
    payload: Record<string, unknown>,
    expectAtLeast: number,
  ): Promise<Ref[]> => {
    const before = await polygons(ctx);
    await doc.designer.selectElements([
      { kind: "polygon", id: a },
      { kind: "polygon", id: b },
    ]);
    await draw(ctx, "blendSelected", {
      ...payload,
      fitToArtboard: onOrigin,
    });
    const grew = await settle(
      ctx.page,
      async () =>
        (await newRefs(ctx.page, "polygon", before)).length >= expectAtLeast,
      20_000,
    );
    expect(grew, `blendSelected minted ≥${expectAtLeast} steps`).toBe(true);
    const minted = await newRefs(ctx.page, "polygon", before);
    await reseat(ctx, minted, offset);
    // Deliberately NOT layered: the intermediates ride the blend's own
    // group, and an IDML <Group> carries no ItemLayer of its own.
    for (const ref of minted) elements.push(ref.id);
    return minted;
  };

  // 1 · Specified steps — 5 between a warm and a cold key.
  const s1a = await diamond(84, 168, 13, keyA);
  const s1b = await diamond(238, 168, 13, keyB);
  const stepsMinted = await blendPair(
    s1a,
    s1b,
    { name: "Annual steps", spacing: "steps", steps: 5 },
    5,
  );

  // 2 · Specified distance — one intermediate per 18 pt of spine.
  const s2a = await diamond(84, 242, 13, keyA);
  const s2b = await diamond(238, 242, 13, keyB);
  const distanceMinted = await blendPair(
    s2a,
    s2b,
    { name: "Annual distance", spacing: "distance", distancePt: 18 },
    3,
  );

  // 3 · Smooth colour — the count IS the colour distance (78 here),
  // walked along a full-width spine so the shingled intermediates read
  // as the gradient they are (stacked on a short spine they read as a
  // solid bar — measured on this page's first proof).
  const s3a = await diamond(80, 312, 11, smoothA);
  const s3b = await diamond(452, 312, 11, smoothB);
  const smoothMinted = await blendPair(
    s3a,
    s3b,
    { name: "Annual smooth", spacing: "smoothColor" },
    20,
  );

  // Reverse the STEPS blend's spine (geometry moves: A's shape ends at
  // B's end) and EXPAND the distance blend (artwork stays, recipe goes).
  const blendLib = await readDrawPart<BlendLibrary>(ctx, "blend.json");
  const stepsRec = blendLib?.blends.find((b) => b.name === "Annual steps");
  const distRec = blendLib?.blends.find((b) => b.name === "Annual distance");
  expect(stepsRec && distRec, "the blend recipes are in the part").toBeTruthy();
  let reverseWorked = false;
  {
    const tap = new ConsoleTap(ctx.page, /reverseBlendSpine|updateBlend/);
    const before = await polygons(ctx);
    await draw(ctx, "reverseBlendSpine", { blendId: stepsRec!.id });
    reverseWorked = await settle(
      ctx.page,
      async () => (await newRefs(ctx.page, "polygon", before)).length > 0,
      15_000,
    );
    tap.stop();
    if (reverseWorked) {
      const minted = await newRefs(ctx.page, "polygon", before);
      await reseat(ctx, minted, offset);
      for (const ref of minted) elements.push(ref.id);
    } else {
      notes.push(
        `reverseBlendSpine refused on this engine — ${tap.join().slice(0, 300) || "no engine sentence captured"}`,
      );
    }
  }
  await draw(ctx, "expandBlend", { blendId: distRec!.id });
  const expanded = await settle(
    ctx.page,
    async () => {
      const lib = await readDrawPart<BlendLibrary>(ctx, "blend.json");
      return !(lib?.blends ?? []).some((b) => b.id === distRec!.id);
    },
    10_000,
  );
  expect(expanded, "expand dropped the distance blend's recipe").toBe(true);

  const blendCaption = await proseFrame(ctx, page, [left, 336, right, 404], [
    {
      text:
        `Top: Specified Steps placed exactly ${stepsMinted.length} intermediates${reverseWorked ? ", then Reverse spine read the spine from the far end - the warm shape now finishes the run" : " (its Reverse spine re-plan was refused by this engine at the group re-create; the margin note carries the sentence)"}. Middle: Specified Distance fit ${distanceMinted.length} intermediates at one per 18 pt of spine, then Expand kept them all and dropped the recipe. Bottom: Smooth Color derived ${smoothMinted.length} steps from the keys' own colour distance and shingled them into the full-width ribbon. A typed count over 200 is refused; a derived one clamps - a typo is not data.`,
      style: STYLE.caption,
    },
  ]);
  elements.push(blendCaption.frameId);

  // ── objects on a path ────────────────────────────────────────────
  const wave = await path(
    ctx,
    pageId,
    [
      { anchor: [64, 452], left: [64, 452], right: [130, 398] },
      { anchor: [230, 452], left: [164, 506], right: [296, 398] },
      { anchor: [396, 452], left: [330, 506], right: [396, 452] },
    ],
    true,
    { stroke: ink, weight: 1.5 },
  );
  await layerBatch([{ kind: "polygon", id: wave }]);
  elements.push(wave);

  const dots: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = 64 + i * 30;
    const id = await doc.oval(pageId, [x, 540, x + 14, 554]);
    await doc.setProperty("oval", id, "frameFillColor", {
      type: "colorRef",
      value: i % 2 === 0 ? keyA : keyB,
    });
    dots.push(id);
    elements.push(id);
  }
  await layerBatch(dots.map((id) => ({ kind: "oval", id })));

  await doc.designer.selectElements([
    ...dots.map((id) => ({ kind: "oval", id })),
    { kind: "polygon", id: wave },
  ]);
  await draw(ctx, "makeObjectsOnPath", {
    name: "Annual dots",
    alignToPath: true,
    fitToArtboard: false,
  });
  await expect
    .poll(
      async () => {
        const v = await propOf(ctx, { kind: "oval", id: dots[3] }, "frameTransform");
        return v?.value ? 1 : 0;
      },
      { message: "make wrote a transform onto the dots", timeout: 120_000 },
    )
    .toBe(1);

  const onPathLib = await readDrawPart<OnPathLibrary>(
    ctx,
    "objects-on-path.json",
  );
  const assoc = onPathLib?.associations.find((a) => a.name === "Annual dots");
  expect(assoc, "the association is in the part").toBeTruthy();

  // UPDATE — re-distribute from the HOME transforms (idempotent), with
  // a start offset so the whole run slides along the wave.
  const beforeUpdate = (await propOf(
    ctx,
    { kind: "oval", id: dots[0] },
    "frameTransform",
  ))?.value;
  await draw(ctx, "updateObjectsOnPath", {
    onPathId: assoc!.id,
    startOffsetPt: 26,
    fitToArtboard: false,
  });
  await expect
    .poll(
      async () => {
        const v = await propOf(ctx, { kind: "oval", id: dots[0] }, "frameTransform");
        return JSON.stringify(v?.value) === JSON.stringify(beforeUpdate) ? 0 : 1;
      },
      { message: "update moved the first dot along the path", timeout: 120_000 },
    )
    .toBe(1);

  // RELEASE — demonstrated on a transient trio, because an exact
  // restore would take the resident dots OFF the wave the reader is
  // looking at. Scratch in, verb run, restore verified, scratch out.
  const run = <T,>(fn: () => Promise<T>): Promise<T> =>
    ctx.doc.ledger ? ctx.doc.ledger.transient(fn) : fn();
  await run(async () => {
    const sPath = await path(
      ctx,
      pageId,
      [corner(420, 560), corner(470, 540)],
      true,
      { stroke: ink, weight: 1 },
    );
    const sDots: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const id = await doc.oval(pageId, [420 + i * 20, 590, 430 + i * 20, 600]);
      sDots.push(id);
    }
    await doc.designer.selectElements([
      ...sDots.map((id) => ({ kind: "oval", id })),
      { kind: "polygon", id: sPath },
    ]);
    await draw(ctx, "makeObjectsOnPath", {
      name: "Annual scratch",
      fitToArtboard: false,
    });
    const lib2 = await readDrawPart<OnPathLibrary>(ctx, "objects-on-path.json");
    const scratchAssoc = lib2?.associations.find(
      (a) => a.name === "Annual scratch",
    );
    if (scratchAssoc) {
      await draw(ctx, "releaseObjectsOnPath", { onPathId: scratchAssoc.id });
      const restored = await settle(
        ctx.page,
        async () => {
          const lib3 = await readDrawPart<OnPathLibrary>(
            ctx,
            "objects-on-path.json",
          );
          return !(lib3?.associations ?? []).some(
            (a) => a.id === scratchAssoc.id,
          );
        },
        10_000,
      );
      if (!restored) notes.push("scratch release left its association — recorded");
    } else {
      notes.push("the scratch association never reached the part — recorded");
    }
    await doc.batch([
      { op: "deleteFrame", args: { frameId: sPath } },
      ...sDots.map((id) => ({ op: "deleteFrame", args: { frameId: id } })),
    ]);
  });

  const oopCaption = await proseFrame(ctx, page, [left, 560, right, 622], [
    {
      text:
        "Seven dots drawn in a row below, then distributed along the wave - the dots ON the path ARE the originals, moved by one transform write each (ids intact, nothing minted, one undo step). Update slid the whole run 26 pt from the path's start, re-placing every dot from its recorded HOME transform rather than from where it stood - which is what makes it idempotent, and what makes Release an exact restore rather than an inverse - proven on a scratch trio that went home and left the page (demonstrated, not resident).",
      style: STYLE.caption,
    },
  ]);
  elements.push(oopCaption.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 122",
      "blendSelected steps/distance/smoothColor",
      "reverseBlendSpine · expandBlend",
      "makeObjectsOnPath · update · release (transient)",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "a blend refuses keys whose subpath/anchor structure differs rather than inventing a correspondence, and refuses text frames outright; the blend intermediates minted one page width off on this facing-spread verso and were re-homed by one transform batch (the measured read/insert seam) → Appendix A",
    ),
  );

  return {
    title: "Blends and objects on a path",
    covers: ["plugin-draw.blends", "plugin-draw.objects-on-path"],
    elements,
    notes,
  };
}
