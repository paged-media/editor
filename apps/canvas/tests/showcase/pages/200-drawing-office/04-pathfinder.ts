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

// The pathfinder wall — p79, B-Body recto. paged.draw's ten Pathfinder
// COMMANDS, each on a fresh overlapping scratch pair, with the
// untouched reference pair above each result.
//
// THE LANE IS THE EXHIBIT. Chapter 8 (The Object) drove the same
// planar machinery as raw wire ops (`pathfinderBoolean`, the region
// verbs, engine-minted face ids). This wall drives it the way a
// DESIGNER does: select two shapes, invoke the command a menu or
// Cmd+K would, and let the bundle order the operands — first-selected
// kept for the four shape modes (it receives the result and keeps its
// paint), top-to-bottom z-order for the six region verbs (ownership
// follows what you see). Ten verbs, ten fresh pairs, ten repaints.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import { refKey, type Ref } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import { anchorsOf, corner, draw, path, polygons } from "./00-support";

const VERBS_ROW1 = [
  ["pathfinderUnite", "Unite"],
  ["pathfinderSubtract", "Subtract"],
  ["pathfinderIntersect", "Intersect"],
  ["pathfinderExclude", "Exclude"],
  ["pathfinderDivide", "Divide"],
] as const;
const VERBS_ROW2 = [
  ["pathfinderTrim", "Trim"],
  ["pathfinderMerge", "Merge"],
  ["pathfinderCrop", "Crop"],
  ["pathfinderOutline", "Outline"],
  ["pathfinderMinusBack", "Minus back"],
] as const;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(79);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];

  const vermilionTint = await doc.swatch(SWATCH.vermilionTint);
  const screenBlue = await doc.swatch(SWATCH.screenBlue);
  const layerContent = await doc.layerId(LAYER.content);

  const head = await proseFrame(ctx, page, [left, 54, right, 82], [
    { text: "The pathfinder wall", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [left, 86, right, 126], [
    {
      text:
        "Ten planar verbs as paged.draw commands over a live selection. Each column holds the untouched scratch pair above and the same pair after its verb below - the operand order is the selection's, exactly as a menu invocation would read it.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  /** One overlapping scratch pair at (x, y): a warm quad under a blue
   *  diamond. Returns [under, over] — insert order IS paint order. */
  const pair = async (x: number, y: number): Promise<[string, string]> => {
    const under = await path(
      ctx,
      pageId,
      [corner(x, y), corner(x + 30, y + 2), corner(x + 28, y + 30), corner(x - 2, y + 28)],
      false,
      { fill: vermilionTint },
    );
    const over = await path(
      ctx,
      pageId,
      [
        corner(x + 30, y + 12),
        corner(x + 48, y + 26),
        corner(x + 30, y + 42),
        corner(x + 12, y + 26),
      ],
      false,
      { fill: screenBlue },
    );
    return [under, over];
  };

  /** Everything the verb left or minted rides the Content layer. */
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

  const runRow = async (
    verbs: ReadonlyArray<readonly [string, string]>,
    yRef: number,
  ): Promise<void> => {
    for (const [i, [suffix]] of verbs.entries()) {
      const x = left + 6 + i * 87;
      // Reference pair — stays untouched.
      const [ru, ro] = await pair(x, yRef);
      elements.push(ru, ro);
      await layerBatch([
        { kind: "polygon", id: ru },
        { kind: "polygon", id: ro },
      ]);
      // Scratch pair — the verb runs on it.
      const [under, over] = await pair(x, yRef + 56);
      await layerBatch([
        { kind: "polygon", id: under },
        { kind: "polygon", id: over },
      ]);
      const before = await polygons(ctx);
      const beforeKeys = new Set(before.map(refKey));
      const underRef: Ref = { kind: "polygon", id: under };
      const overRef: Ref = { kind: "polygon", id: over };
      const tableOf = async (ref: Ref) =>
        JSON.stringify((await anchorsOf(ctx, ref))?.anchors ?? null);
      const underBefore = await tableOf(underRef);
      const overBefore = await tableOf(overRef);
      await doc.designer.selectElements([underRef, overRef]);
      await draw(ctx, suffix);
      // The verbs' outcomes differ in KIND: the shape modes consume and
      // mint, but a region verb like Trim may rewrite an operand's
      // anchor table IN PLACE — same ids, same count, different
      // geometry (its whole effect can even be invisible: removing
      // what another shape hides). So the completion oracle is
      // composite: the polygon ID SET changed, OR either operand's
      // measured anchor table did.
      await expect
        .poll(
          async () => {
            const after = await polygons(ctx);
            if (after.length !== before.length) return 1;
            if (after.some((r) => !beforeKeys.has(refKey(r)))) return 1;
            if ((await tableOf(underRef)) !== underBefore) return 1;
            if ((await tableOf(overRef)) !== overBefore) return 1;
            return 0;
          },
          { message: `${suffix} changed neither the polygon set nor an operand's geometry`, timeout: 120_000 },
        )
        .toBe(1);
      const after = await polygons(ctx);
      const stillOrMinted = after.filter(
        (r) => !beforeKeys.has(refKey(r)) || r.id === under || r.id === over,
      );
      const minted = stillOrMinted.filter((r) => !beforeKeys.has(refKey(r)));
      for (const ref of minted) elements.push(ref.id);
      await layerBatch(minted);
      elements.push(under, over);
    }
  };

  await runRow(VERBS_ROW1, 138);
  const row1Caption = await proseFrame(ctx, page, [left, 250, right, 280], [
    {
      text:
        "Unite, Subtract, Intersect, Exclude - the shape modes; the first-selected quad keeps its identity and receives the result. Fifth column: Divide splits the pair into every planar piece.",
      style: STYLE.caption,
    },
  ]);
  elements.push(row1Caption.frameId);

  await runRow(VERBS_ROW2, 292);
  const row2Caption = await proseFrame(ctx, page, [left, 404, right, 434], [
    {
      text:
        "Trim, Merge, Crop, Outline, Minus back - the region verbs, resolved over one planar arrangement with ownership following the z-order you see: the blue diamond sits in front, so it wins every contested face.",
      style: STYLE.caption,
    },
  ]);
  elements.push(row2Caption.frameId);

  const closing = await proseFrame(ctx, page, [left, 444, right, 500], [
    {
      text:
        "The engine's planar ops were shown raw in Chapter 8. This wall is the COMMAND lane over them: the same arrangement kernel, reached through the registry a menu bar, a palette and a shortcut all share - which is why every result here also answers undo as a single step.",
      style: STYLE.body,
    },
  ]);
  elements.push(closing.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 117",
      "pathfinder ×10 (4 shape modes + 6 region verbs)",
      "10 fresh pairs, selection-ordered",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "the arrangement runs in raw path space and composes at most 12 inputs / 256 faces; past either cap the engine refuses rather than truncates → Appendix A",
    ),
  );

  return {
    title: "The pathfinder wall",
    covers: ["plugin-draw.pro-path-toolset"],
    elements,
    notes,
  };
}
