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

// Type on a path + live corners + select-same — p85, B-Body recto.
//
// TYPE ON A PATH FLOWS AN EXISTING STORY. No wire op mints a bare
// story — insertTextFrame mints one BOUND to its frame — so the free
// story the attach needs is made the one honest way: type into a
// frame, style the text, DELETE THE FRAME. The story survives its
// frame, and the attach names it explicitly rather than letting the
// resolver pick between candidates.
//
// LIVE CORNERS write the IDML corner-option/radius properties, shown
// on rectangles (the kind whose corners the engine renders — the
// margin note carries the boundary). SELECT-SAME is pure selection:
// one red tile chosen, the family found, nothing mutated.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { CHAR, LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { corner, draw, path, propOf } from "./00-support";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(85);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const vermilionTint = await doc.swatch(SWATCH.vermilionTint);
  const slate = await doc.swatch(SWATCH.slate);
  const layerContent = await doc.layerId(LAYER.content);

  const head = await proseFrame(ctx, page, [left, 54, right, 82], [
    { text: "Type on a path, corners and kin", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [left, 86, right, 126], [
    {
      text:
        "A story freed of its frame and flowed along a curve; rectangle corners restyled live; and a selection that finds its own family by fill.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── type on a path ───────────────────────────────────────────────
  // The free story: frame → text → style → delete the FRAME.
  const seedBox: [number, number, number, number] = [300, 560, 460, 590];
  const seedFrame = await doc.textFrame(pageId, seedBox);
  const storyId = await doc.storyOf(pageId, seedBox);
  const words = "Set along a curve — the story survives its frame";
  await doc.insertText(storyId, words, 0);
  await doc.applyStyle(
    storyId,
    0,
    words.length,
    await doc.paragraphStyle(STYLE.bodySmall),
    "paragraph",
  );
  await doc.applyStyle(
    storyId,
    0,
    words.length,
    await doc.characterStyle(CHAR.smallCaps),
    "character",
  );
  await doc.mutate("deleteFrame", { frameId: seedFrame });

  // The carrier curve, then the attach — story named explicitly.
  const curve = await path(
    ctx,
    pageId,
    [
      { anchor: [56, 216], left: [56, 216], right: [150, 148] },
      { anchor: [264, 196], left: [178, 196], right: [350, 196] },
      { anchor: [472, 152], left: [382, 236], right: [472, 152] },
    ],
    true,
    { stroke: vermilionTint, weight: 1 },
  );
  await doc.setProperty("polygon", curve, "itemLayer", {
    type: "text",
    value: layerContent,
  });
  elements.push(curve);

  const beforeAttach = await doc.renderPage(page);
  await draw(ctx, "attachTextToPath", {
    elementId: { kind: "polygon", id: curve },
    storyId,
    pathTypeAlignment: "CenterPathType",
  });
  await doc.expectRenderChanged(page, beforeAttach);

  // Detach, demonstrated transiently: a second curve, a second freed
  // story, attach, detach — the story outlives both.
  const run = <T,>(fn: () => Promise<T>): Promise<T> =>
    ctx.doc.ledger ? ctx.doc.ledger.transient(fn) : fn();
  await run(async () => {
    const sBox: [number, number, number, number] = [300, 600, 456, 628];
    const sFrame = await doc.textFrame(pageId, sBox);
    const sStory = await doc.storyOf(pageId, sBox);
    await doc.insertText(sStory, "Detach leaves the words alive", 0);
    await doc.mutate("deleteFrame", { frameId: sFrame });
    const sCurve = await path(
      ctx,
      pageId,
      [corner(60, 250), corner(240, 262)],
      true,
      {},
    );
    await draw(ctx, "attachTextToPath", {
      elementId: { kind: "polygon", id: sCurve },
      storyId: sStory,
    });
    await draw(ctx, "detachTextFromPath", {
      elementId: { kind: "polygon", id: sCurve },
    });
    await doc.mutate("deleteFrame", { frameId: sCurve });
  });

  const topCaption = await proseFrame(ctx, page, [left, 276, right, 322], [
    {
      text:
        "The sentence above flows an ordinary story along an ordinary path - attachTextToPath took the story this page typed, styled and then freed by deleting its frame (no op mints a bare story; that workflow IS the door). A scratch pair also attached and detached: detach unlinks, it does not delete, so the words outlived both the path and the exhibit.",
      style: STYLE.caption,
    },
  ]);
  elements.push(topCaption.frameId);

  // ── live corners on rectangles ───────────────────────────────────
  const presets = [
    ["cornersRounded", "RoundedCorner"],
    ["cornersBevel", "BeveledCorner"],
    ["cornersFancy", "FancyCorner"],
  ] as const;
  for (const [i, [suffix, token]] of presets.entries()) {
    const x = left + i * 148;
    const rect = await doc.rectangle(pageId, [x, 346, x + 128, 412]);
    await doc.batch([
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "rectangle", id: rect },
          path: "frameFillColor",
          value: { type: "colorRef", value: vermilionTint },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "rectangle", id: rect },
          path: "frameStrokeColor",
          value: { type: "colorRef", value: ink },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "rectangle", id: rect },
          path: "frameStrokeWeight",
          value: { type: "length", value: 1.5 },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "rectangle", id: rect },
          path: "itemLayer",
          value: { type: "text", value: layerContent },
        },
      },
    ]);
    elements.push(rect);
    await doc.select("rectangle", rect);
    await draw(ctx, suffix);
    await expect
      .poll(
        async () =>
          (
            await propOf(
              ctx,
              { kind: "rectangle", id: rect },
              "frameCornerOptionTopLeft",
            )
          )?.value ?? "",
        { message: `${suffix} baked its corner option`, timeout: 10_000 },
      )
      .toBe(token);
  }
  const cornerCaption = await proseFrame(ctx, page, [left, 422, right, 452], [
    {
      text:
        "Rounded, Bevel, Fancy - three of the five live-corner presets, each an eight-write batch onto the rectangle's real frameCornerOption and frameCornerRadius properties, 12 pt radius all round.",
      style: STYLE.caption,
    },
  ]);
  elements.push(cornerCaption.frameId);

  // ── select same fill ─────────────────────────────────────────────
  const tiles: Array<{ id: string; red: boolean }> = [];
  for (let i = 0; i < 8; i += 1) {
    const red = i === 1 || i === 4 || i === 6;
    const x = left + 10 + i * 52;
    const id = await path(
      ctx,
      pageId,
      [corner(x, 486), corner(x + 36, 486), corner(x + 36, 522), corner(x, 522)],
      false,
      { fill: red ? vermilion : slate },
    );
    await doc.setProperty("polygon", id, "itemLayer", {
      type: "text",
      value: layerContent,
    });
    tiles.push({ id, red });
    elements.push(id);
  }
  const firstRed = tiles.find((t) => t.red)!.id;
  await doc.select("polygon", firstRed);
  await draw(ctx, "selectSameFill");
  const selectedCount = await ctx.page.evaluate(
    () =>
      (
        (globalThis as unknown as { __canvas: { elementSelection?: unknown[] } })
          .__canvas.elementSelection ?? []
      ).length,
  );
  expect(
    selectedCount,
    "select-same grew the selection to the vermilion family",
  ).toBeGreaterThanOrEqual(3);

  const sameCaption = await proseFrame(ctx, page, [left, 532, right, 572], [
    {
      text:
        `Eight tiles, three of them vermilion. One vermilion tile was selected by hand; Edit > Select same > Fill grew the selection to ${selectedCount} elements - not just the three tiles but every carrier of that swatch reference in the DOCUMENT, because select-same reads the fill reference, not the neighbourhood. The page looks unchanged: pure selection mutates nothing, and the count printed here is the evidence.`,
      style: STYLE.caption,
    },
  ]);
  elements.push(sameCaption.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 123",
      "attachTextToPath (CenterPathType) · detach (transient)",
      "cornersRounded/Bevel/Fancy",
      "selectSameFill",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "corner presets are shown on RECTANGLES - the engine accepts the corner properties on more kinds but renders them where an enclosed corner exists; and only RainbowPathEffect renders for path type, so the attach offers no effect knob → Appendix A",
    ),
  );

  return {
    title: "Type on a path, corners and kin",
    covers: [
      "frames-paths.text-on-path",
      "plugin-draw.live-corners",
      "plugin-draw.select-same",
    ],
    elements,
    notes,
  };
}
