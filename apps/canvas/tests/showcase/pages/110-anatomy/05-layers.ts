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

// Layers — the full lifecycle on a scratch layer, every one of the
// seven layer mutations the wire declares (layerInsert, layerSetName,
// layerSetVisible, layerSetLocked, layerSetPrintable, layerMove,
// layerRemove), plus item assignment (itemLayer) and Arrange
// (reorderElement) on an overlapping pair. The visibility toggle is
// pixel-proved: the exhibit disappears and returns.
//
// One engine behaviour is recorded rather than assumed: layerRemove
// does NOT refuse while the layer still holds an item. The layer
// record goes; the survivor keeps a dangling itemLayer ref until this
// module re-homes it to Content.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

const SCRATCH_BORN = "Scratch";
const SCRATCH_RENAMED = "Scratch Bench";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const pageId = ctx.pageIds[0];

  const [x0, y0, x1] = contentBox(p(17));
  const left = x0;
  const right = x1;
  const top = y0;

  const layersNamed = async (): Promise<Array<{ selfId: string; name?: string }>> =>
    (await doc.designer.layers()) as Array<{ selfId: string; name?: string }>;

  // ── prose ───────────────────────────────────────────────────────
  const head = await proseFrame(ctx, p(17), [left, top, right, top + 30], [
    { text: "The layer plan, exercised", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const prose = await proseFrame(ctx, p(17), [left, top + 38, right, top + 230], [
    {
      text: "A layer is a band of stacking order with three switches: visible, locked, printable. This book keeps five, drawn as bands below, bottom first — the grid under everything, the plates over it, the prose over those, and the apparatus on top. While this page was set, a sixth existed: born as Scratch, renamed to Scratch Bench, handed the blue exhibit below, switched invisible and back (the render changed both ways), moved to the bottom of the stack, and removed.",
      style: STYLE.bodyFirst,
    },
    {
      text: "The removal is worth reading twice. The engine does not refuse to remove an occupied layer: the layer record goes, and the item keeps a reference to a layer that no longer exists until someone re-homes it — which this page did, to Content, where the exhibit now lives. The overlapping pair beside it demonstrates the other half of stacking: Arrange, front and back, with no geometry change at all.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  // ── the scratch-layer lifecycle ─────────────────────────────────
  const before = await layersNamed();
  await doc.mutate("layerInsert", { position: before.length, name: SCRATCH_BORN });
  let all = await layersNamed();
  const scratch = all.find((l) => l.name === SCRATCH_BORN);
  if (!scratch) {
    throw new Error(
      `layerInsert: no layer named ${SCRATCH_BORN} after the insert — have ` +
        `[${all.map((l) => l.name ?? "?").join(", ")}]`,
    );
  }

  await doc.mutate("layerSetName", { layerId: scratch.selfId, name: SCRATCH_RENAMED });
  all = await layersNamed();
  if (!all.some((l) => l.name === SCRATCH_RENAMED)) {
    throw new Error("layerSetName did not land in the layers read");
  }

  // The exhibit, born on Content, assigned ONTO the scratch layer.
  const exhibit = await plate(
    ctx,
    p(17),
    [left, top + 244, left + 130, top + 316],
    SWATCH.screenBlue,
    LAYER.content,
  );
  await doc.setProperty("rectangle", exhibit, "itemLayer", {
    type: "text",
    value: scratch.selfId,
  });
  elements.push(exhibit);

  // Visibility, pixel-proved in both directions.
  const withExhibit = await doc.renderPage(p(17));
  await doc.mutate("layerSetVisible", { layerId: scratch.selfId, visible: false });
  await doc.expectRenderChanged(p(17), withExhibit);
  const hidden = await doc.renderPage(p(17));
  await doc.mutate("layerSetVisible", { layerId: scratch.selfId, visible: true });
  await doc.expectRenderChanged(p(17), hidden);

  // Lock, printable, move — exercised and restored / left harmless.
  await doc.mutate("layerSetLocked", { layerId: scratch.selfId, locked: true });
  await doc.mutate("layerSetLocked", { layerId: scratch.selfId, locked: false });
  await doc.mutate("layerSetPrintable", { layerId: scratch.selfId, printable: false });
  await doc.mutate("layerSetPrintable", { layerId: scratch.selfId, printable: true });
  await doc.mutate("layerMove", { layerId: scratch.selfId, newIndex: 0 });

  // Remove WHILE OCCUPIED — the engine allows it; record that, then
  // re-home the orphaned exhibit to Content.
  await doc.mutate("layerRemove", { layerId: scratch.selfId });
  all = await layersNamed();
  if (all.some((l) => l.name === SCRATCH_RENAMED)) {
    throw new Error("layerRemove left the scratch layer in the layers read");
  }
  await doc.setProperty("rectangle", exhibit, "itemLayer", {
    type: "text",
    value: await doc.layerId(LAYER.content),
  });
  notes.push(
    "layerRemove succeeds while the layer is occupied — the item keeps a dangling itemLayer ref; re-homed to Content here",
  );

  // ── Arrange: the overlapping pair ───────────────────────────────
  const plateA = await plate(
    ctx,
    p(17),
    [left + 152, top + 244, left + 282, top + 316],
    SWATCH.vermilionTint,
    LAYER.content,
  );
  const plateB = await plate(
    ctx,
    p(17),
    [left + 212, top + 266, left + 342, top + 338],
    SWATCH.labMarigold,
    LAYER.content,
  );
  elements.push(plateA, plateB);
  await doc.mutate("reorderElement", {
    elementId: { kind: "rectangle", id: plateB },
    to: "back",
  });
  await doc.mutate("reorderElement", {
    elementId: { kind: "rectangle", id: plateB },
    to: "front",
  });

  const pairCaption = await proseFrame(
    ctx,
    p(17),
    [left, top + 344, right, top + 372],
    [
      {
        text: "Left: the exhibit that survived its layer. Right: the marigold plate was sent to back, then brought to front — reorderElement, both directions.",
        style: STYLE.caption,
      },
    ],
  );
  elements.push(pairCaption.frameId);

  // ── the z-band diagram, read live ───────────────────────────────
  const standing = await layersNamed();
  const bandsHead = await proseFrame(
    ctx,
    p(17),
    [left, top + 384, right, top + 410],
    [{ text: "The standing bands, bottom first", style: STYLE.head2 }],
  );
  elements.push(bandsHead.frameId);
  for (const [i, layer] of standing.entries()) {
    const y = top + 418 + i * 26;
    elements.push(
      await plate(
        ctx,
        p(17),
        [left, y, left + 150, y + 18],
        i % 2 === 0 ? SWATCH.paperWarm : SWATCH.vermilionTint,
        LAYER.background,
      ),
    );
    const label = await proseFrame(ctx, p(17), [left + 162, y, right, y + 20], [
      { text: layer.name ?? layer.selfId, style: STYLE.caption },
    ]);
    elements.push(label.frameId);
  }

  elements.push(
    await specLabel(ctx, p(17), [
      "Specimen No. 11",
      "layerInsert / SetName / Move",
      "SetVisible / SetLocked / SetPrintable",
      "layerRemove: allowed occupied",
      "itemLayer · reorderElement",
    ]),
  );

  return {
    title: "Layers — lifecycle, assignment, Arrange",
    covers: ["layers.ops", "layers.item-assignment", "layers.z-ordering"],
    elements,
    notes,
  };
}
