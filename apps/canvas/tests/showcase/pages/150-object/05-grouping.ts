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

// Grouping, nesting and the dressed frame — p52, B-Body verso.
//
// Three bands: createGroup proved by setGroupTransform moving three
// members as one (and a second trio grouped then dissolved);
// pasteInto's real clipping (a shape deliberately sticking out of its
// container) with releaseFrom shown on a twin pair; and the
// object-style battery — create, rename, apply, and the transient
// create/rename/delete scratch.
//
// B-18's consequences (plugin-draw's measured list) are respected and
// one is probed live: deleteFrame REFUSES a nested child until it is
// released, and the probe goes through the raw client (not the ledger
// chokepoint) because an op we expect to be refused must not be
// tallied as exercised. Same lane for the object-style definition
// door: setStyleProperty on the `object` collection answers
// UnsupportedProperty for every path today — the new style is dressed
// through its basedOn chain instead, and the margin note prints the
// closed door rather than hiding it.

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, OBJECT_STYLE, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { tryRawMutate, type WireId } from "./wire";

const NEW_STYLE_ID = "ObjectStyle/Annual Exhibit Frame";
const SCRATCH_STYLE_ID = "ObjectStyle/Annual Scratch Object";

interface ObjectStyleRow {
  selfId: string;
  name?: string;
  basedOn?: string | null;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(52);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const marigold = await doc.swatch(SWATCH.labMarigold);
  const screenBlue = await doc.swatch(SWATCH.screenBlue);
  const slate = await doc.swatch(SWATCH.slate);
  const paperWarm = await doc.swatch(SWATCH.paperWarm);

  const head = await proseFrame(ctx, page, [left, 54, right, 84], [
    { text: "Groups, nests, and the dressed frame", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const tile = async (
    box: [number, number, number, number],
    fill: string | null,
    stroke?: string,
  ): Promise<string> => {
    const id = await doc.rectangle(pageId, box);
    await doc.setProperty("rectangle", id, "frameFillColor", {
      type: "colorRef",
      value: fill,
    });
    if (stroke) {
      await doc.setProperty("rectangle", id, "frameStrokeColor", {
        type: "colorRef",
        value: stroke,
      });
      await doc.setProperty("rectangle", id, "frameStrokeWeight", {
        type: "length",
        value: 1,
      });
    }
    await assignLayer(ctx, "rectangle", id, LAYER.content);
    elements.push(id);
    return id;
  };

  // ── band 1: the two trios ────────────────────────────────────────
  const trio = async (y: number, fills: string[]): Promise<WireId[]> => {
    const out: WireId[] = [];
    for (const [i, fill] of fills.entries()) {
      const x = left + i * 50;
      out.push({
        kind: "rectangle",
        id: await tile([x, y, x + 40, y + 40], fill),
      });
    }
    return out;
  };

  // Trio one: grouped, then MOVED AS ONE — the proof a group is real.
  const movedTrio = await trio(100, [vermilion, marigold, screenBlue]);
  const groupId = (await doc.mutate("createGroup", {
    memberIds: movedTrio,
  })) as string;
  if (typeof groupId !== "string" || groupId.length === 0) {
    throw new Error("createGroup minted no group id");
  }
  const beforeMove = await doc.renderPage(page);
  await doc.mutate("setGroupTransform", {
    groupId,
    transform: [1, 0, 0, 1, 180, 44],
  });
  await doc.expectRenderChanged(page, beforeMove);

  // Trio two: grouped and dissolved — members stay, the wrapper goes.
  const dissolvedTrio = await trio(170, [screenBlue, vermilion, marigold]);
  const groupId2 = (await doc.mutate("createGroup", {
    memberIds: dissolvedTrio,
  })) as string;
  await doc.mutate("dissolveGroup", { groupId: groupId2 });

  const trioCap = await proseFrame(ctx, page, [left, 216, right, 246], [
    {
      text:
        "The upper trio was grouped and moved 180 by 44 as ONE " +
        "setGroupTransform; the lower trio was grouped and dissolved - " +
        "members stay, the wrapper goes.",
      style: STYLE.caption,
    },
  ]);
  elements.push(trioCap.frameId);

  // ── band 2: pasteInto / releaseFrom ──────────────────────────────
  const oval = async (
    box: [number, number, number, number],
    fill: string,
  ): Promise<string> => {
    const id = await doc.oval(pageId, box);
    await doc.setProperty("oval", id, "frameFillColor", {
      type: "colorRef",
      value: fill,
    });
    await assignLayer(ctx, "oval", id, LAYER.content);
    elements.push(id);
    return id;
  };

  // Pair one STAYS nested: the oval deliberately sticks out, so the
  // clip at the container's right edge is the visible fact.
  const container1 = await tile([left, 252, left + 90, 344], paperWarm, ink);
  const child1 = await oval([left + 56, 278, left + 166, 330], vermilion);
  await doc.mutate("pasteInto", {
    containerId: { kind: "rectangle", id: container1 },
    childId: { kind: "oval", id: child1 },
  });

  // B-18 consequence 3, probed on the raw client: deleteFrame refuses
  // a nested child. The refusal is EXPECTED — a success here would be
  // the finding.
  const refusal = await tryRawMutate(ctx, "deleteFrame", { frameId: child1 });
  if (refusal.ok) {
    notes.push(
      "SURPRISE: deleteFrame accepted a pasted-in child — B-18's refusal " +
        "no longer holds; the margin note is now stale",
    );
  } else {
    notes.push(`deleteFrame on the nested child refused as expected: ${refusal.error}`);
  }

  // Pair two: nested and RELEASED — the twin ends the page unclipped.
  const container2 = await tile([250, 252, 340, 344], paperWarm, ink);
  const child2 = await oval([306, 278, 416, 330], slate);
  await doc.mutate("pasteInto", {
    containerId: { kind: "rectangle", id: container2 },
    childId: { kind: "oval", id: child2 },
  });
  await doc.mutate("releaseFrom", { childId: { kind: "oval", id: child2 } });

  const nestCap = await proseFrame(ctx, page, [left, 352, right, 394], [
    {
      text:
        "Left: an oval pasted INTO a frame - it is clipped at the " +
        "container's edge, and deleteFrame refuses it until released. " +
        "Right: the same nesting, then releaseFrom - the twin ends the " +
        "page whole, overlapping its container unclipped.",
      style: STYLE.caption,
    },
  ]);
  elements.push(nestCap.frameId);

  // ── band 3: the object-style battery ─────────────────────────────
  const readStyles = async (): Promise<ObjectStyleRow[]> =>
    (await doc.designer.collection(
      "objectStyles",
    )) as unknown as ObjectStyleRow[];
  const fixtureStyles = await readStyles();
  const annotationMarker = fixtureStyles.find(
    (s) => s.name === OBJECT_STYLE.annotationMarker,
  );
  if (!annotationMarker) {
    throw new Error(
      `objectStyles lists no ${JSON.stringify(OBJECT_STYLE.annotationMarker)} — ` +
        `have [${fixtureStyles.map((s) => s.name ?? "?").join(", ")}]`,
    );
  }

  // Born "Exhibit Panel", renamed in front of the reader. The
  // definition door is closed (probed below), so the dressing arrives
  // through basedOn: Annotation Marker carries the vermilion-tint fill
  // and vermilion hairline this frame will visibly take.
  await doc.mutate("createObjectStyle", {
    selfId: NEW_STYLE_ID,
    name: "Exhibit Panel",
    basedOn: annotationMarker.selfId,
  });
  await doc.mutate("renameObjectStyle", {
    styleId: NEW_STYLE_ID,
    name: "Exhibit Frame",
  });

  // The definition-door probe, on the raw client so the ledger never
  // counts an op the engine refused.
  const doorProbe = await tryRawMutate(ctx, "setStyleProperty", {
    collection: "object",
    styleId: NEW_STYLE_ID,
    path: "frameFillColor",
    value: { type: "colorRef", value: marigold },
  });
  if (doorProbe.ok) {
    notes.push(
      "SURPRISE: setStyleProperty accepted an object-collection write — " +
        "the definition door opened; the margin note is now stale",
    );
  } else {
    notes.push(
      `object style definition door closed as recorded: ${doorProbe.error}`,
    );
  }

  // Apply to a visible frame, pixel-gated: the frame starts unfilled
  // and unstroked, so everything you see it wearing is the style.
  const dressed = await tile([left, 412, 240, 540], null);
  const beforeApply = await doc.renderPage(page);
  await doc.setProperty("rectangle", dressed, "appliedObjectStyle", {
    type: "text",
    value: NEW_STYLE_ID,
  });
  await doc.expectRenderChanged(page, beforeApply);

  // Read the collection back: the rename landed, the chain holds.
  const stylesNow = await readStyles();
  const mine = stylesNow.find((s) => s.selfId === NEW_STYLE_ID);
  if (!mine || mine.name !== "Exhibit Frame") {
    throw new Error(
      `object style CRUD readback failed: ${JSON.stringify(mine ?? null)}`,
    );
  }
  if (mine.basedOn !== annotationMarker.selfId) {
    throw new Error(
      `Exhibit Frame's basedOn is ${JSON.stringify(mine.basedOn)}, expected ` +
        `${JSON.stringify(annotationMarker.selfId)}`,
    );
  }

  // The scratch triple — created, renamed, deleted, tallied transient.
  const scratchTriple = async (): Promise<void> => {
    await doc.mutate("createObjectStyle", {
      selfId: SCRATCH_STYLE_ID,
      name: "Scratch Object",
    });
    await doc.mutate("renameObjectStyle", {
      styleId: SCRATCH_STYLE_ID,
      name: "Scratch Object Rev B",
    });
    await doc.mutate("deleteObjectStyle", { styleId: SCRATCH_STYLE_ID });
  };
  if (doc.ledger) {
    await doc.ledger.transient(scratchTriple);
  } else {
    await scratchTriple();
  }
  const afterScratch = await readStyles();
  if (afterScratch.some((s) => s.selfId === SCRATCH_STYLE_ID)) {
    throw new Error("the scratch object style survived its deleteObjectStyle");
  }

  const styleProse = await proseFrame(ctx, page, [252, 404, right, 560], [
    {
      text:
        "The frame at left wears Exhibit Frame, an object style that did " +
        "not exist when this chapter began. It was born Exhibit Panel, " +
        "renamed live, and based on the fixture's Annotation Marker - " +
        "which is where the tinted fill and hairline come from, because " +
        "the definition door for object styles is closed today.",
      style: STYLE.bodySmall,
    },
    {
      text:
        "A second style, Scratch Object, ran the whole triple - created, " +
        "renamed, deleted - and the checkpoint carries no trace of it: " +
        "demonstrated, not resident.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(styleProse.frameId);

  elements.push(
    await marginNote(
      ctx,
      page,
      "setStyleProperty answers UnsupportedProperty for the object " +
        "collection (probed live) - an object style dresses frames only " +
        "through basedOn; and B-18: a nested child leaves the scene " +
        "tree and deleteFrame refuses it until released → Appendix A.",
    ),
  );
  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 70",
      "createGroup / setGroupTransform / dissolveGroup",
      "pasteInto / releaseFrom",
      "objectStyle create/rename/apply + delete (transient)",
    ]),
  );

  return {
    title: "Grouping, nesting and the dressed frame",
    covers: [
      "frames-paths.groups",
      "frames-paths.nested-content",
      "styles.object.crud",
    ],
    elements,
    notes,
  };
}
