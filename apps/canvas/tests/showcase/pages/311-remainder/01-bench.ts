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

// The remainder bench — no page of its own, and that is the point.
//
// When the book was complete the ledger named what it had NOT touched:
// six wire ops and twenty-two catalog property names. Every one of them
// is a door whose whole meaning is that it leaves no mark on a finished
// page — text detached from a path, a frame set nonprinting, an element
// hidden, a table resized from its own property rather than its row
// ops. Authoring them onto a spread would have been a lie about what
// they do; skipping them would have been a lie about what the engine
// has. So they run here, on a scratch page the bench mints and removes,
// and the ledger tallies them TRANSIENT — demonstrated, not resident.
//
// Two lanes, because the engine has two:
//
//   · the WIRE lane (`setElementProperty`), whose `PropertyPath` enum
//     spells `frameSatinEnabled` and `textWrapInvert`;
//   · the SCRIPT lane (`paged.set`), whose vocabulary is the introspect
//     catalog and therefore also spells `frameSatin` and
//     `frameTextWrapInvert` — the same doors under the names a script
//     author types. `paged.set` returns a boolean, so each write is
//     recorded only after the engine says it applied.
//
// The bench's oracle is its own: the scratch page must RENDER DIFFERENT
// under the visible doors, and the document must come back to exactly
// the page count it started with.

import { expect } from "@playwright/test";

import { script } from "../../../e2e/harness/ui";
import { ANNUAL_PAGES, CHAR, STYLE, SWATCH } from "../../names-annual";
import { bareTableId } from "../170-table/00-support";
import type { PageContext, PageReport } from "../../types";

/** One anchor of a wire path, in the shape `insertPath` wants. */
const anchor = (x: number, y: number) => ({
  anchor: [x, y] as [number, number],
  left: [x, y] as [number, number],
  right: [x, y] as [number, number],
});

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const notes: string[] = [];
  const covers: string[] = [];
  const wireDoors: string[] = [];
  const scriptDoors: string[] = [];
  const readOnlyDoors: string[] = [];

  const runTransient = (fn: () => Promise<void>): Promise<void> =>
    doc.ledger ? doc.ledger.transient(fn) : fn();

  await runTransient(async () => {
    let pages = await doc.refreshPages();
    const startCount = pages.length;
    expect(startCount, "the bench starts on the finished book").toBe(
      ANNUAL_PAGES,
    );

    await doc.mutate("insertPage", {
      afterPageId: pages[pages.length - 1].selfId,
      masterId: null,
    });
    pages = await doc.refreshPages();
    const scratchId = pages[pages.length - 1].selfId;
    const scratch = pages.length - 1;

    // ── 1. geometry, by property rather than by insert ──────────────
    const rect = await doc.mutateId("insertFrame", {
      pageId: scratchId,
      bounds: [80, 60, 200, 300],
    });
    const blank = await doc.renderPage(scratch);
    await doc.setProperty("rectangle", rect, "frameFillColor", {
      type: "colorRef",
      value: await doc.swatch(SWATCH.vermilion),
    });
    await doc.expectRenderChanged(scratch, blank);

    // frameBounds moves and resizes in one write — the wire Bounds
    // value stays [top, left, bottom, right] like every raw bounds.
    const placed = await doc.renderPage(scratch);
    await doc.setProperty("rectangle", rect, "frameBounds", {
      type: "bounds",
      value: [60, 40, 220, 260],
    });
    await doc.expectRenderChanged(scratch, placed);
    wireDoors.push("frameBounds");

    // moveFrame is the op form of the same intent: a transform, not a
    // rectangle. It carries the frame, it does not reshape it.
    const beforeMove = await doc.renderPage(scratch);
    await doc.mutate("moveFrame", {
      frameId: rect,
      transform: [1, 0, 0, 1, 24, 12],
    });
    await doc.expectRenderChanged(scratch, beforeMove);

    // frameFillTint — the same ink, weaker.
    const beforeTint = await doc.renderPage(scratch);
    await doc.setProperty("rectangle", rect, "frameFillTint", {
      type: "length",
      value: 25,
    });
    await doc.expectRenderChanged(scratch, beforeTint);
    wireDoors.push("frameFillTint");

    // ── 2. the invisible production properties ──────────────────────
    // Hiding is visible in the render; nonprinting and locked are not,
    // by definition — they are answered by a read, not by pixels.
    const beforeHide = await doc.renderPage(scratch);
    await doc.setProperty("rectangle", rect, "elementVisible", {
      type: "bool",
      value: false,
    });
    await doc.expectRenderChanged(scratch, beforeHide);
    await doc.setProperty("rectangle", rect, "elementVisible", {
      type: "bool",
      value: true,
    });
    await doc.setProperty("rectangle", rect, "elementLocked", {
      type: "bool",
      value: true,
    });
    await doc.setProperty("rectangle", rect, "frameNonprinting", {
      type: "bool",
      value: true,
    });
    wireDoors.push("elementVisible", "elementLocked", "frameNonprinting");

    // ── 3. anchor-level path editing ────────────────────────────────
    const poly = await doc.mutateId("insertPath", {
      pageId: scratchId,
      anchors: [anchor(300, 80), anchor(420, 80), anchor(420, 200)],
      open: true,
    });
    await doc.setProperty("polygon", poly, "frameStrokeColor", {
      type: "colorRef",
      value: await doc.swatch(SWATCH.ink),
    });
    const beforePoint = await doc.renderPage(scratch);
    await doc.setProperty("polygon", poly, "framePathPoint", {
      type: "pathPoint",
      value: { address: { index: 1, role: "anchor" }, position: [460, 60] },
    });
    await doc.expectRenderChanged(scratch, beforePoint);
    await doc.setProperty("polygon", poly, "pathPointInsert", {
      type: "pathPointInsert",
      value: { index: 2, anchor: anchor(480, 140) },
    });
    await doc.setProperty("polygon", poly, "pathPointCurveType", {
      type: "pathPointCurveType",
      value: { index: 1, smooth: true },
    });
    await doc.setProperty("polygon", poly, "pathPointRemove", {
      type: "pathPointRemove",
      value: { index: 2 },
    });
    wireDoors.push(
      "framePathPoint",
      "pathPointInsert",
      "pathPointCurveType",
      "pathPointRemove",
    );

    // ── 4. text: styles as properties, a deleted range, a field ─────
    const TF_BOX: [number, number, number, number] = [40, 240, 300, 380];
    const tf = await doc.textFrame(scratchId, TF_BOX);
    const storyId = await doc.storyOf(scratchId, TF_BOX);
    await doc.mutate("insertText", {
      storyId,
      offset: 0,
      text: "The remainder bench proves the doors the book does not wear.",
    });
    // The style applied as a PROPERTY of a range — the other lane from
    // the applyStyle op the rest of the book uses.
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(storyId, 0, 12),
      "appliedParagraphStyle",
      { type: "text", value: await doc.paragraphStyle(STYLE.bodySmall) },
    );
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(storyId, 4, 13),
      "appliedCharacterStyle",
      { type: "text", value: await doc.characterStyle(CHAR.emphasis) },
    );
    wireDoors.push("appliedParagraphStyle", "appliedCharacterStyle");

    const beforeDelete = await doc.renderPage(scratch);
    await doc.mutate("deleteRange", { storyId, start: 0, end: 4 });
    await doc.expectRenderChanged(scratch, beforeDelete);

    // A placeholder field, then the value written into it.
    await doc.mutate("insertField", {
      storyId,
      offset: 0,
      field: { placeholder: { plugin: "annual.bench", key: "remainder" } },
    });
    await doc.mutate("setFieldValue", {
      storyId,
      offset: 0,
      value: "· ",
    });

    // ── 5. a table sized by its own properties ──────────────────────
    const tableStory = storyId;
    const created = await doc.mutate("insertTable", {
      storyId: tableStory,
      rows: 2,
      cols: 2,
    });
    const tableId = bareTableId(created);
    // tableRowCount and tableColumnCount are READ-ONLY BY CONTRACT —
    // the engine rejects a write ("property TableRowCount is not
    // supported on Table"), and core carries a test asserting exactly
    // that. They are in the catalog because the catalog is the property
    // vocabulary for reads as well as writes, and the row count is a
    // DERIVED total: header + body + footer. So the bench exercises
    // them the only way they can honestly be exercised — it reads them
    // back from the table it just built, and says so.
    const counts = await page.evaluate(
      async ({ storyId, table }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                elementProperties: (id: unknown) => Promise<{
                  entries: Array<{
                    path: string;
                    value: { type: string; value: unknown } | null;
                  }>;
                } | null>;
              };
            };
          }
        ).__canvas;
        const props = await c.client.elementProperties({
          kind: "table",
          id: { story_id: storyId, table_id: table },
        });
        const read = (path: string) =>
          props?.entries.find((e) => e.path === path)?.value?.value ?? null;
        return {
          rows: read("tableRowCount") as number | null,
          cols: read("tableColumnCount") as number | null,
        };
      },
      { storyId: tableStory, table: tableId },
    );
    expect(counts.rows, "the table reports its row count").toBe(2);
    expect(counts.cols, "the table reports its column count").toBe(2);
    doc.ledger?.recordPath("tableRowCount");
    doc.ledger?.recordPath("tableColumnCount");
    readOnlyDoors.push("tableRowCount", "tableColumnCount");

    // ── 6. plugin metadata, written by the host lane ────────────────
    // The value is not free-form: the engine parses it and demands the
    // envelope { v: >=1, data: {…} }, so a bundle cannot smuggle an
    // asset into a Label. The key is namespaced to the writing plugin.
    await doc.setProperty("rectangle", rect, "pluginMetadata", {
      type: "pluginMetadata",
      value: {
        key: "x-paged:annual.bench",
        value: JSON.stringify({ v: 1, data: { exhibit: "remainder" } }),
      },
    });
    wireDoors.push("pluginMetadata");

    // ── 7. text on a path, and off it again ─────────────────────────
    const tp = await doc.mutateId("insertPath", {
      pageId: scratchId,
      anchors: [anchor(60, 320), anchor(220, 300), anchor(380, 340)],
      open: true,
    });
    // A story may belong to exactly ONE flow (C-29), so a story that
    // still lives in a text frame cannot be attached to a path. No op
    // mints a bare story either — the way to a free story is to type it
    // into a frame and then delete the frame, which is the workflow the
    // drawing office's type-on-path page walks through the plugin lane.
    // This is the same door, opened on the wire.
    const PATH_BOX: [number, number, number, number] = [40, 400, 300, 430];
    const carrier = await doc.textFrame(scratchId, PATH_BOX);
    const pathStory = await doc.storyOf(scratchId, PATH_BOX);
    await doc.mutate("insertText", {
      storyId: pathStory,
      offset: 0,
      text: "type riding a curve",
    });
    await doc.mutate("deleteFrame", { frameId: carrier });
    const beforeAttach = await doc.renderPage(scratch);
    await doc.mutate("attachTextToPath", {
      elementId: { kind: "polygon", id: tp },
      storyId: pathStory,
      pathTypeAlignment: "baseline",
    });
    await doc.expectRenderChanged(scratch, beforeAttach);
    await doc.mutate("detachTextFromPath", {
      elementId: { kind: "polygon", id: tp },
    });

    // ── 8. bindCreated — the batch handle door ──────────────────────
    // Inside a batch, a minting op's id can be BOUND to a handle and
    // referred to by the ops that follow it in the same batch. This is
    // how a plugin composes "make it, then paint it" atomically.
    await doc.mutate("batch", {
      ops: [
        {
          op: "insertFrame",
          args: { pageId: scratchId, bounds: [340, 320, 400, 440] },
        },
        { op: "bindCreated", args: { handle: "bench" } },
        {
          op: "setElementProperty",
          args: {
            elementId: { kind: "rectangle", id: "$h:bench" },
            path: "frameFillColor",
            value: { type: "colorRef", value: await doc.swatch(SWATCH.ink) },
          },
        },
      ],
    });

    // ── 9. the script lane's own spellings ──────────────────────────
    // `paged.set` resolves names through the introspect catalog, which
    // carries a second spelling for each effect's enable flag and for
    // the text-wrap invert. Each returns a boolean; only a true is
    // recorded, and a false is reported rather than hidden.
    // The script lane names its element inside the SOURCE, which no
    // handle rule can reach — ask the driver for the real ids first.
    const [rectId, tfId] = await doc.ids(rect, tf);
    const aliases: Array<[string, string, string]> = [
      [`rectangle:${rectId}`, "frameSatin", "true"],
      [`rectangle:${rectId}`, "frameFeather", "true"],
      [`rectangle:${rectId}`, "frameBevel", "true"],
      [`rectangle:${rectId}`, "frameInnerGlow", "true"],
      [`rectangle:${rectId}`, "frameInnerShadow", "true"],
      [`rectangle:${rectId}`, "frameOuterGlow", "true"],
      [`rectangle:${rectId}`, "frameDirectionalFeather", "true"],
      [`textFrame:${tfId}`, "frameTextWrapInvert", "true"],
    ];
    const refused: string[] = [];
    for (const [id, path, value] of aliases) {
      const out = await script(
        page,
        `paged.set(${JSON.stringify(id)}, ${JSON.stringify(path)}, ${value})`,
      );
      if ((out[0] ?? "").trim() === "true") {
        doc.ledger?.recordPath(path);
        scriptDoors.push(path);
      } else {
        refused.push(`${path} (${(out[0] ?? "no output").trim()})`);
      }
    }
    if (refused.length > 0) {
      notes.push(
        `the script lane refused ${refused.length} catalog name(s): ` +
          refused.join(", "),
      );
    }

    // ── the bench clears its bench ──────────────────────────────────
    await doc.mutate("deletePage", { pageId: scratchId });
    pages = await doc.refreshPages();
    expect(pages.length, "the bench leaves the book as it found it").toBe(
      startCount,
    );
  });

  notes.push(
    `wire lane — ${wireDoors.length} property path(s) exercised on the ` +
      `scratch page: ${wireDoors.join(", ")}`,
  );
  notes.push(
    `script lane — ${scriptDoors.length} catalog name(s) applied through ` +
      `paged.set: ${scriptDoors.join(", ")}`,
  );
  notes.push(
    `read-only by engine contract — ${readOnlyDoors.join(", ")}: the write ` +
      `door refuses them (core asserts the refusal in its own tests), so ` +
      `the bench reads them back instead of pretending to set them`,
  );

  return {
    title: "The remainder bench — the doors that leave no mark",
    covers,
    elements: [],
    notes,
  };
}
