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

// Page 12 — layers.
//
// This page is the first document in the project to put an item on a
// layer by ASKING the engine to, rather than by being generated that
// way. Until protocol 62 the layer model had a hole in the middle: the
// seven `Layer*` mutations managed the layer LIST — insert, remove,
// reorder, rename, visible, locked, printable — and nothing at all
// wrote WHICH LAYER AN ITEM WAS ON. `paged-mutate`'s own comment said
// so ("moving an item to another layer is currently INEXPRESSIBLE"),
// so `layers-z.idml` was the only document in the repo with items on
// more than one layer, and a Layers panel could show the tree but
// never let you drag a row into it.
//
// `PropertyPath::ItemLayer` closes that, and the page demonstrates the
// consequence rather than the API: two overlapping shapes swap which
// one occludes the other purely by changing the layer each sits on.
// The renderer sorts `frames_in_order` by layer BEFORE it consults the
// z table (Q-10), which is exactly why this cannot be done with
// `reorderElement` — bring-to-front cannot lift an item past one on a
// higher layer. The two verbs are different gestures and the page
// shows both.

import type { PageContext, PageReport } from "../types";
import { columnBounds, LAYER, STYLE, SWATCH } from "../names";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const elements: string[] = [];
  const notes: string[] = [];

  // ── the page's own furniture ────────────────────────────────────
  const headBounds = columnBounds(0, { top: 72, bottom: 108 });
  headBounds[3] = columnBounds(2)[3];
  const head = await doc.textFrame(pageId, headBounds);
  const headStory = await doc.storyOf(pageId, headBounds);
  await doc.insertText(headStory, "Layers");
  await doc.applyStyle(
    headStory,
    0,
    "Layers".length,
    await doc.paragraphStyle(STYLE.heading),
    "paragraph",
  );
  elements.push(head);

  // ── the three layers ────────────────────────────────────────────
  // The base fixture declares Background / Content / Notes so the page
  // does not have to mint them before it can use them, but a document
  // that arrived without them must still work — so resolve by name and
  // create what is missing. `layerInsert` positions from the BACK.
  const wanted = [LAYER.background, LAYER.content, LAYER.notes];
  const layerIds: Record<string, string> = {};
  for (let i = 0; i < wanted.length; i += 1) {
    const name = wanted[i];
    try {
      layerIds[name] = await doc.layerId(name);
    } catch {
      layerIds[name] = await doc.designer.addLayer(name, i);
      notes.push(`base fixture had no "${name}" layer; the page minted one`);
    }
  }

  // ── two overlapping plates, born on the same layer ──────────────
  const ink = await doc.swatch(SWATCH.ink);
  const accent = await doc.swatch(SWATCH.accent);

  const backPlate = await doc.rectangle(pageId, [200, 96, 380, 330]);
  await doc.setProperty("rectangle", backPlate, "frameFillColor", {
    type: "colorRef",
    value: ink,
  });
  const frontPlate = await doc.rectangle(pageId, [260, 180, 440, 420]);
  await doc.setProperty("rectangle", frontPlate, "frameFillColor", {
    type: "colorRef",
    value: accent,
  });
  elements.push(backPlate, frontPlate);

  // `itemLayer` is protocol 62. The editor pins the PUBLISHED
  // canvas-wasm, so until 0.62.x ships to npm this page runs against a
  // worker that rejects the path — and the honest answer to that is a
  // note, not a red. Feature-detect by trying it: a worker that knows
  // the path applies it, one that does not refuses and says so.
  let layerAssignment = true;
  try {
    // Both start on Content, where insert put them: the demonstration
    // is worthless if they were already on different layers.
    await doc.assignLayer("rectangle", backPlate, layerIds[LAYER.content]);
    await doc.assignLayer("rectangle", frontPlate, layerIds[LAYER.content]);

    // Now move ONE of them down a layer. Nothing about either shape's
    // geometry, colour or z-slot changes — only its layer — and the
    // occlusion inverts because the renderer sorts by layer first.
    await doc.assignLayer("rectangle", frontPlate, layerIds[LAYER.background]);
  } catch (err) {
    layerAssignment = false;
    notes.push(
      `itemLayer refused by this engine (${
        err instanceof Error ? err.message : String(err)
      }). The path is protocol 62; the editor pins the published ` +
        `canvas-wasm, so this page shows the layers but not the move ` +
        `until 0.62.x is published. Run ~/paged/sync-wasm.sh to build ` +
        `the local engine and see it.`,
    );
  }

  // ── a caption on the Notes layer ────────────────────────────────
  // Notes sits at the top of the stack, so this stays legible over the
  // plates. It is also the layer the conditions page later hides, which
  // is the second half of what layers are FOR: not just paint order but
  // a switch for a whole class of content.
  const capBounds: [number, number, number, number] = [460, 96, 560, 420];
  const cap = await doc.textFrame(pageId, capBounds);
  const capStory = await doc.storyOf(pageId, capBounds);
  const caption = layerAssignment
    ? "Both plates were drawn onto Content. Moving the accent plate to " +
      "Background inverted which one occludes the other — the renderer " +
      "sorts by layer before it consults the z table, so this is a " +
      "different gesture from Bring to Front, and until protocol 62 the " +
      "engine had no way to express it at all."
    : "This engine predates protocol 62, where assigning an item to a " +
      "layer became expressible. The layers below exist and their flags " +
      "respond; what cannot be shown here is an item MOVING between " +
      "them, because no mutation could say it.";
  await doc.insertText(capStory, caption);
  await doc.applyStyle(
    capStory,
    0,
    caption.length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );
  if (layerAssignment) {
    await doc.assignLayer("textFrame", cap, layerIds[LAYER.notes]);
  }
  elements.push(cap);

  // ── the flags, exercised on a layer nothing on this page uses ───
  // Toggling a layer that DOES hold this page's content would leave the
  // page half-empty in the finished document. The flags still need
  // exercising, so they run on Notes and are restored.
  await doc.designer.setLayerVisible(layerIds[LAYER.notes], false);
  await doc.designer.setLayerVisible(layerIds[LAYER.notes], true);
  await doc.mutate("layerSetLocked", {
    layerId: layerIds[LAYER.background],
    locked: true,
  });
  await doc.mutate("layerSetLocked", {
    layerId: layerIds[LAYER.background],
    locked: false,
  });
  await doc.mutate("layerSetPrintable", {
    layerId: layerIds[LAYER.notes],
    printable: true,
  });

  return {
    title: "Layers",
    covers: layerAssignment
      ? ["layers.model", "layers.ops", "layers.z-ordering"]
      : ["layers.model", "layers.ops"],
    elements,
    notes,
  };
}
