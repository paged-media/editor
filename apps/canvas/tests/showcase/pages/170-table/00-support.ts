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

// Shared vocabulary for the table chapter (170).
//
// The one structural gotcha lives here so every module says it the
// same way: `insertTable` mints a STRUCTURED ElementId
// (`{ story_id, table_id }`), not a bare self id — reading it as a
// string yields something that addresses nothing (a bug paged.sheet
// shipped once). `bareTableId` narrows it loudly. Cell text uses the
// `TextCellAddr` qualifier on insertText/applyStyle (protocols 54/55);
// cell PROPERTIES use the `tableCell` ElementId struct.

import type { ShowcaseDoc } from "../../driver";

/** The bare `table_id` from whatever `insertTable` handed back. */
export function bareTableId(created: unknown): string {
  if (created && typeof created === "object") {
    const t = (created as { table_id?: unknown }).table_id;
    if (typeof t === "string" && t.length > 0) return t;
  }
  if (typeof created === "string" && created.length > 0) return created;
  throw new Error(
    `insertTable minted no addressable table id: ${JSON.stringify(created)}`,
  );
}

/** A `tableCell` ElementId — the wire's cell-property door. */
export function cellId(
  storyId: string,
  tableId: string,
  row: number,
  col: number,
): { kind: string; id: unknown } {
  return {
    kind: "tableCell",
    id: { story_id: storyId, table_id: tableId, row, col },
  };
}

/** Pour text into one cell — `cell` switches the offset space from
 *  story-local to cell-local (the v54 cell door). */
export async function pourCell(
  doc: ShowcaseDoc,
  storyId: string,
  tableId: string,
  row: number,
  col: number,
  text: string,
): Promise<void> {
  await doc.mutate("insertText", {
    storyId,
    offset: 0,
    text,
    cell: { tableId, row, col },
  });
}

/** Apply a paragraph/character style to a whole cell's text — the v55
 *  cell-scoped applyStyle mirror. Offsets are cell-local characters. */
export async function styleCell(
  doc: ShowcaseDoc,
  storyId: string,
  tableId: string,
  row: number,
  col: number,
  length: number,
  styleId: string,
  scope: "paragraph" | "character" = "paragraph",
): Promise<void> {
  await doc.mutate("applyStyle", {
    storyId,
    start: 0,
    end: length,
    style: styleId,
    scope,
    cell: { tableId, row, col },
  });
}

/** Pour + paragraph-style one cell in a single call. */
export async function pourStyledCell(
  doc: ShowcaseDoc,
  storyId: string,
  tableId: string,
  row: number,
  col: number,
  text: string,
  styleId: string,
): Promise<void> {
  await pourCell(doc, storyId, tableId, row, col, text);
  // Cell-local applyStyle offsets are CONTIGUOUS characters — the
  // paragraph separator is not a character in that space, so a
  // multi-paragraph label styles to the separator-stripped length.
  const contiguous = [...text.replace(/\n/g, "")].length;
  await styleCell(doc, storyId, tableId, row, col, contiguous, styleId);
}

/**
 * Readable cell padding, as ONE batch: the fixture's cell styles carry
 * no insets, and a zero-inset table sets its text flush against the
 * rules (the first visual pass read "1Front matter" as one word).
 * `sides` picks which insets each cell gets.
 */
export async function insetCells(
  doc: ShowcaseDoc,
  storyId: string,
  tableId: string,
  cells: Array<[row: number, col: number, sides: "left" | "right" | "both"]>,
  inset = 6,
): Promise<void> {
  const ops: Array<{ op: string; args: unknown }> = [];
  for (const [row, col, sides] of cells) {
    for (const path of sides === "both"
      ? ["cellInsetLeft", "cellInsetRight"]
      : sides === "left"
        ? ["cellInsetLeft"]
        : ["cellInsetRight"]) {
      ops.push({
        op: "setElementProperty",
        args: {
          elementId: cellId(storyId, tableId, row, col),
          path,
          value: { type: "length", value: inset },
        },
      });
    }
  }
  await doc.mutate("batch", { ops });
}

/** Run `fn` with its ops tallied as transient (demonstrated-then-removed). */
export async function transient<T>(
  doc: ShowcaseDoc,
  fn: () => Promise<T>,
): Promise<T> {
  if (doc.ledger) return doc.ledger.transient(fn);
  return fn();
}

/** Named-style lookups the driver does not carry (tables only). */
export async function tableStyleId(
  doc: ShowcaseDoc,
  name: string,
): Promise<string> {
  return styleFrom(doc, "tableStyles", name);
}

export async function cellStyleId(
  doc: ShowcaseDoc,
  name: string,
): Promise<string> {
  return styleFrom(doc, "cellStyles", name);
}

async function styleFrom(
  doc: ShowcaseDoc,
  collection: string,
  name: string,
): Promise<string> {
  const items = (await doc.designer.collection(collection)) as unknown as Array<{
    selfId: string;
    name?: string;
  }>;
  const hit = items.find((i) => i.name === name);
  if (!hit) {
    throw new Error(
      `${collection} has no entry named ${JSON.stringify(name)} — have ` +
        `[${items.map((i) => i.name ?? "?").join(", ")}]`,
    );
  }
  return hit.selfId;
}
