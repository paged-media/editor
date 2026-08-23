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

// `paged.insert.*` — the object-authoring command layer (U7).
//
// WHY THIS LIVES IN THE EDITOR AND NOT IN A PLUGIN. Creating a text
// frame, a rectangle, a table or a page is what everything else BUILDS
// ON, so — like the `paged.object.*` structural verbs — it belongs to
// the host. Until this layer landed, every insert op the engine has
// carried since protocol v24 (`insertTextFrame`, `insertFrame`,
// `insertOval`, `insertLine`, `insertTable`, `insertPage`) was
// reachable only through a DRAG on the tool rail; a user asking the
// command palette to "insert a text frame" got nothing, and File had a
// permanently-disabled "Place…" seam. These seven verbs close that gap
// with click-free, keyboard-first inserts.
//
// Facts that shape the code:
//
//  1. PLACEMENT IS THE VIEWPORT'S BUSINESS. A command has no drag, so
//     WHERE to insert comes from what the user is looking at: the
//     viewport centre, mapped through the camera into document space
//     (`viewportToDoc`) and onto the page under it — the exact
//     page-layout convention `ViewportCanvas` resolves pointer events
//     with (`layoutPages` + containing-page walk). Off every page (a
//     pasteboard view) the NEAREST page wins; an uninitialised camera
//     falls back to page 0. The insert then centres on that page.
//
//  2. THE POST-INSERT FLOW IS THE TOOLS'. `mutateAndSelect`
//     (@paged-media/tools) is the same mutate → select-created →
//     geometry-refresh chain every drawing tool commits through, so a
//     palette insert lands indistinguishably from a drawn one.
//
//  3. COMPOUND INSERTS ARE SEQUENTIAL, MEASURED NOT CHOSEN. "Insert
//     table" with no caret mints a text frame AND its table; "Place
//     image" mints a frame AND fills it. The intended shape was ONE
//     `batch` with the `$created` sentinel binding the child to the
//     minted parent (one undo step, the pencil tool's v34 precedent) —
//     but on wire v61 the engine substitutes `$created` only into
//     `ElementId`-typed fields, never a `storyId` string (probe:
//     `node not found: Story("$created")`), and its batch executor
//     does not dispatch `PlaceImage`/`ReplaceImageBytes` children at
//     all (`Mutation::Batch child 1 (ReplaceImageBytes):
//     NotImplemented`) although both apply fine standalone. So the
//     compounds run as TWO mutations — two undo records — and a
//     failing second step ROLLS BACK the first via `undo()`, so a
//     refusal never strands an empty frame. A story-handle door in
//     the batch executor is the RFI that would restore atomicity.
//
//  4. PLACE IS THE INLINE-BYTES LANE. `placeImage(uri)` has no
//     resolver door in the editor (nothing serves a picked file back
//     by URI), so Place routes the picked bytes through
//     `replaceImageBytes` — the lane the engine already treats as a
//     placed image (`hasImage` flips on the frame, and the bytes
//     decode + RENDER engine-side; measured, red-swatch probe).
//
//  5. `client.mutate` NEVER REJECTS — a refusal resolves as
//     `mutationFailed`. Every runner inspects the reply (via
//     `mutateAndSelect`'s `onRefused` tap) and reports through the
//     Problems panel, the `paged.object.*` discipline.

import type {
  CommandContribution,
  KeybindingContribution,
  MenuItemContribution,
  PagedEditor,
} from "@paged-media/shell";
import type { ElementId, Mutation, PageId } from "@paged-media/client";
import { viewportToDoc } from "@paged-media/client";
import { mutateAndSelect, type MutateReply } from "@paged-media/tools";

import { layoutPages, type PageRect } from "./ui/layout";
import { pickFiles } from "./shell-file-picker";
import { refusalOf } from "./object-commands";

export const PAGED_INSERT_TEXT_FRAME = "paged.insert.textFrame";
export const PAGED_INSERT_RECTANGLE = "paged.insert.rectangle";
export const PAGED_INSERT_ELLIPSE = "paged.insert.ellipse";
export const PAGED_INSERT_LINE = "paged.insert.line";
export const PAGED_INSERT_TABLE = "paged.insert.table";
export const PAGED_INSERT_PLACE_IMAGE = "paged.insert.placeImage";
export const PAGED_INSERT_NEW_PAGE = "paged.insert.newPage";
export const PAGED_INSERT_DELETE_PAGE = "paged.insert.deletePage";

/** Attribution the insert layer publishes diagnostics under. */
export const INSERT_DIAGNOSTIC_SOURCE = "paged.insert";

// ------------------------------------------------------- named sizes
//
// Default insert sizes in pt. A command insert has no drag to size
// from, so these are the deliberate defaults: the text frame is a
// 2:1 reading block, shapes are a square the eye reads as "an
// object, resize me", the line spans a comfortable grab length, and
// the table frame is wide enough that four rows × three columns
// render legible cells.

export const TEXT_FRAME_SIZE_PT: readonly [number, number] = [240, 120];
export const SHAPE_SIZE_PT: readonly [number, number] = [160, 160];
export const LINE_LENGTH_PT = 200;
export const TABLE_FRAME_SIZE_PT: readonly [number, number] = [320, 180];
export const TABLE_ROWS = 4;
export const TABLE_COLS = 3;
/** Place… fits the image within this fraction of the page (never
 *  upscaling past natural size — InDesign places at 100%). */
export const PLACE_IMAGE_MAX_PAGE_FRACTION = 0.8;

/** How a command reports back to the user (the Problems panel).
 *  `info` = the command was reachable but does not apply here;
 *  `error` = the engine's own sentence for a refused mutation. */
export type InsertReport = (
  severity: "error" | "info",
  message: string,
) => void;

/** What a runner resolves with — surfaced through `invoke` so tests
 *  (and a future scripting caller) can see the outcome without
 *  scraping the Problems panel. */
export interface InsertOutcome {
  applied: boolean;
  createdId: ElementId | null;
}

const REFUSED: InsertOutcome = { applied: false, createdId: null };

/** B3 — deleting a page had NO menu route at all. `deletePage` was
 *  reachable only from `paged.pages-list`, a panel in no mode's slots,
 *  so a designer using the default layout could add pages and never
 *  remove one.
 *
 *  Targets the page the camera is on, which is the same page `Add page`
 *  inserts after — the two verbs then read as a pair rather than one
 *  acting on the view and the other on a hidden selection. Refuses on
 *  the last page: a document with no pages is not a state the editor
 *  recovers from gracefully, and the engine's own refusal message would
 *  reach the user as jargon. */
export async function deleteCurrentPage(
  paged: PagedEditor,
  report: InsertReport,
): Promise<InsertOutcome> {
  if (blockedFor(paged, report, "Delete page")) return REFUSED;
  const target = currentPageTarget(paged);
  if (!target) {
    report("error", "Delete page needs a page in view.");
    return REFUSED;
  }
  if ((paged.document.handle?.pageCount ?? 0) <= 1) {
    report(
      "error",
      "Delete page refused: this is the document's only page. " +
        "Add another page first, or close the document.",
    );
    return REFUSED;
  }
  const reply = await paged.client.mutate({
    op: "deletePage",
    args: { pageId: target.pageId },
  });
  const refusal = refusalOf(reply);
  if (refusal) {
    report("error", `Delete page refused: ${refusal}`);
    return REFUSED;
  }
  return outcomeOf(reply);
}

// ---------------------------------------------------------------- pure

/** The page a command insert targets, in the `layoutPages` document-
 *  space convention. */
export interface PageTarget {
  pageId: PageId;
  /** Document-space page rect; inserts use PAGE-LOCAL coordinates,
   *  so only `w`/`h` participate in bounds math. */
  rect: PageRect;
}

/**
 * Resolve the CURRENT page — the placement anchor for every verb.
 *
 * Viewport centre → `viewportToDoc` → the containing page over the
 * `layoutPages` stack (the `ViewportCanvas` pointer mapping) → else
 * the NEAREST page (pasteboard view) → else page 0 (camera not yet
 * initialised: scale 0 / no viewport). `null` only with no document.
 */
export function currentPageTarget(paged: PagedEditor): PageTarget | null {
  return pageTargetFor({
    handle: paged.document.handle,
    camera: paged.camera.camera,
    viewportSize: paged.camera.viewportSize,
  });
}

/** The inputs {@link currentPageTarget} actually reads. Split out so a
 *  caller that holds the camera and handle directly — the canvas app's
 *  active-page effect does — can ask without assembling a fake
 *  `PagedEditor` around three fields. */
export interface PageTargetInputs {
  handle: PagedEditor["document"]["handle"];
  camera: PagedEditor["camera"]["camera"];
  viewportSize: PagedEditor["camera"]["viewportSize"];
}

export function pageTargetFor({
  handle,
  camera: cam,
  viewportSize,
}: PageTargetInputs): PageTarget | null {
  if (!handle || handle.pageIds.length === 0) return null;
  const rects = layoutPages(handle.pageSizesPt);
  const at = (i: number): PageTarget => ({
    pageId: handle.pageIds[i],
    rect: rects[i],
  });

  const [vw, vh] = viewportSize;
  if (!(cam.scale > 0) || vw <= 0 || vh <= 0) return at(0);
  const [docX, docY] = viewportToDoc(cam, vw / 2, vh / 2);
  if (!Number.isFinite(docX) || !Number.isFinite(docY)) return at(0);

  let nearest = 0;
  let nearestD = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (
      docX >= r.x &&
      docX <= r.x + r.w &&
      docY >= r.y &&
      docY <= r.y + r.h
    ) {
      return at(i);
    }
    // Distance to the rect (0 inside — handled above), for the
    // pasteboard fallback.
    const dx = Math.max(r.x - docX, 0, docX - (r.x + r.w));
    const dy = Math.max(r.y - docY, 0, docY - (r.y + r.h));
    const d = dx * dx + dy * dy;
    if (d < nearestD) {
      nearestD = d;
      nearest = i;
    }
  }
  return at(nearest);
}

/** Page-local `[top, left, bottom, right]` for a `w × h` insert
 *  centred on the page, clamped so it never leaves it (a page smaller
 *  than the default size shrinks the insert to fit). */
export function centeredBoundsOn(
  rect: PageRect,
  widthPt: number,
  heightPt: number,
): [number, number, number, number] {
  const w = Math.min(widthPt, rect.w);
  const h = Math.min(heightPt, rect.h);
  const left = Math.max(0, (rect.w - w) / 2);
  const top = Math.max(0, (rect.h - h) / 2);
  return [top, left, top + h, left + w];
}

/** `cols` equal column widths over `totalPt` — the "even column
 *  widths" the insert-table default promises. */
export function evenColumnWidths(totalPt: number, cols: number): number[] {
  return Array.from({ length: cols }, () => totalPt / cols);
}

// -------------------------------------------------------------- guards

/**
 * ADR 024 — the single declarative gate for all seven verbs: a
 * document is open AND the user is at the DOCUMENT ROOT (not inside a
 * plugin content type, where "insert a rectangle" would land a page
 * item behind the raster stack / grid / DOM being edited). Shared by
 * the `when` on every contribution (menu greys, palette hides) and
 * re-checked by the runner guard below, because a shortcut reaches
 * the handler with no menu in between.
 */
const insertApplies = (state: unknown): boolean => {
  const s = state as {
    document?: { handle?: { pageCount?: number } | null } | null;
    editContext?: unknown;
  } | null;
  if (!s?.document?.handle || (s.document.handle.pageCount ?? 0) === 0) {
    return false;
  }
  return !s.editContext;
};

/** The runner-side guard. Returns true when the command must NOT run,
 *  having already told the user why — a report, not a silent return
 *  (the `paged.object.*` rule: the user pressed something and is owed
 *  an answer). */
function blockedFor(
  paged: PagedEditor,
  report: InsertReport,
  verb: string,
): boolean {
  const handle = paged.document.handle;
  if (!handle || handle.pageCount === 0) {
    report("info", `${verb} needs an open document. Open or create one first.`);
    return true;
  }
  const ctx = paged.editContext;
  if (ctx) {
    report(
      "info",
      `${verb} inserts page items, and you are editing inside a ${ctx.type}. ` +
        "Leave the frame (Esc) to insert into the document.",
    );
    return true;
  }
  return false;
}

/** Route a `mutationFailed` reply's engine sentence to the report
 *  channel under the verb's name. */
function refusedTap(report: InsertReport, verb: string) {
  return (reply: MutateReply) => {
    const refusal = refusalOf(reply);
    if (refusal) report("error", `${verb} refused: ${refusal}`);
  };
}

function outcomeOf(reply: MutateReply | null): InsertOutcome {
  if (!reply || reply.kind !== "mutationApplied") return REFUSED;
  return { applied: true, createdId: reply.payload.createdId ?? null };
}

// ------------------------------------------------------------- runners

async function insertCenteredShape(
  paged: PagedEditor,
  report: InsertReport,
  verb: string,
  size: readonly [number, number],
  build: (pageId: PageId, bounds: [number, number, number, number]) => Mutation,
  label: string,
): Promise<InsertOutcome> {
  if (blockedFor(paged, report, verb)) return REFUSED;
  const target = currentPageTarget(paged);
  if (!target) return REFUSED;
  const bounds = centeredBoundsOn(target.rect, size[0], size[1]);
  const reply = await mutateAndSelect(
    paged,
    build(target.pageId, bounds),
    label,
    refusedTap(report, verb),
  );
  return outcomeOf(reply);
}

export function insertTextFrame(
  paged: PagedEditor,
  report: InsertReport,
): Promise<InsertOutcome> {
  return insertCenteredShape(
    paged,
    report,
    "Insert text frame",
    TEXT_FRAME_SIZE_PT,
    (pageId, bounds) => ({ op: "insertTextFrame", args: { pageId, bounds } }),
    "insertTextFrame",
  );
}

export function insertRectangle(
  paged: PagedEditor,
  report: InsertReport,
): Promise<InsertOutcome> {
  return insertCenteredShape(
    paged,
    report,
    "Insert rectangle",
    SHAPE_SIZE_PT,
    (pageId, bounds) => ({ op: "insertFrame", args: { pageId, bounds } }),
    "insertFrame",
  );
}

export function insertEllipse(
  paged: PagedEditor,
  report: InsertReport,
): Promise<InsertOutcome> {
  return insertCenteredShape(
    paged,
    report,
    "Insert ellipse",
    SHAPE_SIZE_PT,
    (pageId, bounds) => ({ op: "insertOval", args: { pageId, bounds } }),
    "insertOval",
  );
}

/** A horizontal `LINE_LENGTH_PT` line centred on the current page
 *  (clamped to the page width). */
export async function insertLine(
  paged: PagedEditor,
  report: InsertReport,
): Promise<InsertOutcome> {
  if (blockedFor(paged, report, "Insert line")) return REFUSED;
  const target = currentPageTarget(paged);
  if (!target) return REFUSED;
  const len = Math.min(LINE_LENGTH_PT, target.rect.w);
  const cx = target.rect.w / 2;
  const cy = target.rect.h / 2;
  const reply = await mutateAndSelect(
    paged,
    {
      op: "insertLine",
      args: {
        pageId: target.pageId,
        start: [cx - len / 2, cy],
        end: [cx + len / 2, cy],
      },
    },
    "insertLine",
    refusedTap(report, "Insert line"),
  );
  return outcomeOf(reply);
}

/** The width of the frame hosting `storyId` (its chain's FIRST frame)
 *  — the honest total for the caret-case even column widths. `null`
 *  when unreadable; the engine's own default widths then apply. */
async function storyFrameWidth(
  paged: PagedEditor,
  storyId: string,
): Promise<number | null> {
  try {
    const links = await paged.client.frameChain(storyId);
    const first = links[0];
    if (!first) return null;
    const items = await paged.client.elementGeometry([
      { kind: "textFrame", id: first.frameId },
    ]);
    const b = items[0]?.bounds;
    if (!b) return null;
    const w = b[3] - b[1];
    return w > 0 ? w : null;
  } catch {
    return null;
  }
}

/** Undo the FIRST half of a compound insert after its second half
 *  refused, so a refusal never strands an empty frame (fact 3). */
async function rollBackFirstStep(paged: PagedEditor): Promise<void> {
  try {
    await paged.client.undo();
  } catch {
    /* the report already carries the refusal; a failed rollback
       leaves the frame, which the user can undo by hand. */
  }
}

/**
 * Insert a `TABLE_ROWS × TABLE_COLS` table with even column widths.
 *
 * Caret in a story → the table lands AT THE STORY the caret is in
 * (columns split the hosting frame's width evenly). No caret → mint a
 * text frame, resolve the story it minted (the stories collection
 * grows by exactly that story), and insert the table there. Two
 * mutations — see fact 3 for why this cannot be one batch on wire
 * v61 — with the frame rolled back if the table half refuses.
 */
export async function insertTable(
  paged: PagedEditor,
  report: InsertReport,
): Promise<InsertOutcome> {
  if (blockedFor(paged, report, "Insert table")) return REFUSED;
  const caret = paged.contentSelection.contentSelectionRef.current;
  if (caret) {
    const width = await storyFrameWidth(paged, caret.storyId);
    const reply = await mutateAndSelect(
      paged,
      {
        op: "insertTable",
        args: {
          storyId: caret.storyId,
          rows: TABLE_ROWS,
          cols: TABLE_COLS,
          ...(width != null
            ? { columnWidths: evenColumnWidths(width, TABLE_COLS) }
            : {}),
        },
      },
      "insertTable",
      refusedTap(report, "Insert table"),
    );
    return outcomeOf(reply);
  }

  const target = currentPageTarget(paged);
  if (!target) return REFUSED;
  const bounds = centeredBoundsOn(
    target.rect,
    TABLE_FRAME_SIZE_PT[0],
    TABLE_FRAME_SIZE_PT[1],
  );
  const frameWidth = bounds[3] - bounds[1];

  // The minted story has no readable pointer from the frame (no
  // parentStory property on the wire), so diff the stories collection
  // around the create — single-user editor, nothing else mints
  // stories between the two reads.
  const storiesBefore = new Set(
    (await paged.client.collection<{ selfId: string }>("stories")).map(
      (s) => s.selfId,
    ),
  );
  const frameReply = await mutateAndSelect(
    paged,
    { op: "insertTextFrame", args: { pageId: target.pageId, bounds } },
    "insertTable(frame)",
    refusedTap(report, "Insert table"),
  );
  const frame = outcomeOf(frameReply);
  if (!frame.applied) return REFUSED;
  const minted = (
    await paged.client.collection<{ selfId: string }>("stories")
  ).filter((s) => !storiesBefore.has(s.selfId));
  const storyId = minted[0]?.selfId ?? null;
  if (!storyId) {
    report(
      "error",
      "Insert table: the new text frame reported no story to put the table in.",
    );
    await rollBackFirstStep(paged);
    return REFUSED;
  }
  const tableReply = await mutateAndSelect(
    paged,
    {
      op: "insertTable",
      args: {
        storyId,
        rows: TABLE_ROWS,
        cols: TABLE_COLS,
        columnWidths: evenColumnWidths(frameWidth, TABLE_COLS),
      },
    },
    "insertTable",
    refusedTap(report, "Insert table"),
  );
  const table = outcomeOf(tableReply);
  if (!table.applied) {
    await rollBackFirstStep(paged);
    return REFUSED;
  }
  // Report the TABLE as the creation (the verb's object); the frame
  // is its host and the fallback if the reply carried no table id.
  return { applied: true, createdId: table.createdId ?? frame.createdId };
}

/** Natural pixel size of picked image bytes, via `createImageBitmap`
 *  (the browser's decoder — no format sniffing of our own). */
async function naturalImageSize(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([bytes.slice().buffer as ArrayBuffer], {
        type: mimeType || "application/octet-stream",
      }),
    );
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null;
  }
}

/**
 * File ▸ Place… — pick an image, mint an aspect-fit frame centred on
 * the current page (≤ `PLACE_IMAGE_MAX_PAGE_FRACTION` of it, never
 * upscaled past natural size at 1 px = 1 pt), and fill it with the
 * picked bytes through `replaceImageBytes` (the inline-bytes lane —
 * `placeImage(uri)` has no resolver door here). Two mutations, frame
 * rolled back if the bytes half refuses — see fact 3 for why the
 * engine's batch executor cannot carry the pair.
 */
export async function placeImage(
  paged: PagedEditor,
  report: InsertReport,
): Promise<InsertOutcome> {
  if (blockedFor(paged, report, "Place image")) return REFUSED;
  const [file] = await pickFiles({ accept: ["image/*"] });
  if (!file) return REFUSED; // cancelled — an ordinary answer, no report.
  const size = await naturalImageSize(file.bytes, file.mimeType);
  if (!size) {
    report("error", `Place image: could not decode "${file.name}" as an image.`);
    return REFUSED;
  }
  const target = currentPageTarget(paged);
  if (!target) return REFUSED;
  const maxW = target.rect.w * PLACE_IMAGE_MAX_PAGE_FRACTION;
  const maxH = target.rect.h * PLACE_IMAGE_MAX_PAGE_FRACTION;
  const scale = Math.min(1, maxW / size.width, maxH / size.height);
  const bounds = centeredBoundsOn(
    target.rect,
    size.width * scale,
    size.height * scale,
  );
  const frameReply = await mutateAndSelect(
    paged,
    { op: "insertFrame", args: { pageId: target.pageId, bounds } },
    "placeImage(frame)",
    refusedTap(report, "Place image"),
  );
  const frame = outcomeOf(frameReply);
  if (!frame.applied || !frame.createdId) return REFUSED;
  const bytesReply = await mutateAndSelect(
    paged,
    {
      op: "replaceImageBytes",
      args: {
        elementId: frame.createdId.id as string,
        bytes: Array.from(file.bytes),
      },
    },
    "placeImage",
    refusedTap(report, "Place image"),
  );
  if (!outcomeOf(bytesReply).applied) {
    await rollBackFirstStep(paged);
    return REFUSED;
  }
  return frame;
}

/** Layout ▸ Add page — a fresh page AFTER the current one (the
 *  pages-list panel's `insertPage` shape; no master). */
export async function addPage(
  paged: PagedEditor,
  report: InsertReport,
): Promise<InsertOutcome> {
  if (blockedFor(paged, report, "Add page")) return REFUSED;
  const target = currentPageTarget(paged);
  const reply = await paged.client.mutate({
    op: "insertPage",
    args: { afterPageId: target?.pageId ?? null, masterId: null },
  });
  const refusal = refusalOf(reply);
  if (refusal) {
    report("error", `Add page refused: ${refusal}`);
    return REFUSED;
  }
  return outcomeOf(reply);
}

// ------------------------------------------------------------ commands

/** The seven closures a host binds to the seven commands. Each
 *  receives the LIVE `PagedEditor` the registry materialises at
 *  invoke time — never captured state. */
export interface InsertCommandHandlers {
  textFrame: (paged: PagedEditor) => unknown | Promise<unknown>;
  rectangle: (paged: PagedEditor) => unknown | Promise<unknown>;
  ellipse: (paged: PagedEditor) => unknown | Promise<unknown>;
  line: (paged: PagedEditor) => unknown | Promise<unknown>;
  table: (paged: PagedEditor) => unknown | Promise<unknown>;
  placeImage: (paged: PagedEditor) => unknown | Promise<unknown>;
  newPage: (paged: PagedEditor) => unknown | Promise<unknown>;
  deletePage: (paged: PagedEditor) => unknown | Promise<unknown>;
}

/** Build the insert command set. Same shape as `buildObjectCommands`
 *  so both register through one path in `CanvasAppIntegration`. */
export function buildInsertCommands(
  handlers: InsertCommandHandlers,
): CommandContribution[] {
  const cmd = (
    id: string,
    title: string,
    run: (paged: PagedEditor) => unknown | Promise<unknown>,
  ): CommandContribution => ({
    id,
    title,
    category: "Insert",
    when: insertApplies,
    handler: (paged) => run(paged as PagedEditor),
  });
  return [
    cmd(PAGED_INSERT_TEXT_FRAME, "Insert text frame", handlers.textFrame),
    cmd(PAGED_INSERT_RECTANGLE, "Insert rectangle", handlers.rectangle),
    cmd(PAGED_INSERT_ELLIPSE, "Insert ellipse", handlers.ellipse),
    cmd(PAGED_INSERT_LINE, "Insert line", handlers.line),
    cmd(PAGED_INSERT_TABLE, "Insert table", handlers.table),
    cmd(PAGED_INSERT_DELETE_PAGE, "Delete page", handlers.deletePage),
    cmd(PAGED_INSERT_PLACE_IMAGE, "Place image…", handlers.placeImage),
    cmd(PAGED_INSERT_NEW_PAGE, "Add page", handlers.newPage),
  ];
}

/** Menu projection. The five object inserts head the Object menu
 *  (group "insert", above the arrange/group blocks); "Place…" takes
 *  the File slot its `soon` seam held (order 40, group "place" —
 *  the seam in `cockpit-menus.ts` is retired by this layer, the
 *  honest-stub convention doing its job); "Add page" heads Layout.
 *  Each item carries the same `when` as its command so the menu greys
 *  where the palette hides. */
/** C1 — an Insert entry for a PLUGIN content type.
 *
 *  The plugin contract has twelve contribution types and `menu` is not
 *  one of them, so a plugin command's only host-wide home is Cmd+K —
 *  where the palette shows the raw command id rather than a shortcut,
 *  and where nobody ever sees two creation verbs side by side. That is
 *  why the six content types teach six different idioms (Insert / Place
 *  / Import / and sheet's `lowerToFrame`, which is compiler vocabulary
 *  for the step that actually puts the sheet on the page).
 *
 *  Until the contract grows a menu door, the host curates. It already
 *  special-cases one plugin this way — `File > Open PDF…` is a host
 *  menu item written for media.paged.pdf, which never asked for it — so
 *  the precedent is set and the alternative is leaving four content
 *  types undiscoverable.
 *
 *  Gated on the command being REGISTERED, not on a hardcoded list of
 *  bundles: a build without paged.sheet shows no Spreadsheet entry
 *  rather than a dead one, which is the tool-rail rule ("worse than an
 *  empty slot") applied to the menu.
 */
function pluginInsert(command: string) {
  return (state: unknown): boolean => {
    if (!insertApplies(state)) return false;
    const s = state as {
      registries?: { commands?: { list?: () => { id: string }[] } };
    } | null;
    const list = s?.registries?.commands?.list?.();
    return Array.isArray(list) && list.some((c) => c.id === command);
  };
}

const PLUGIN_INSERT_ENTRIES: { path: string; command: string; order: number }[] =
  [
    {
      path: "Object/Insert web frame…",
      command: "media.paged.web.command.insertWebFrame",
      order: 30,
    },
    {
      path: "Object/Insert spreadsheet…",
      command: "media.paged.sheet.command.importXlsx",
      order: 31,
    },
    {
      path: "Object/Insert Word document…",
      command: "media.paged.doc.command.placeDoc",
      order: 32,
    },
    {
      path: "Object/Insert data binding…",
      command: "media.paged.data.command.defineBinding",
      order: 33,
    },
    // The three Data-menu verbs, replacing `soon(...)` seams whose
    // labels duplicated three LIVE toolbar pills. Same panels the pills
    // raise, through the registry-derived panel-show commands.
    {
      path: "Data/Connect source…",
      command: "paged.panel.show.media.paged.data.panel.sources",
      order: 10,
    },
    {
      path: "Data/Field mapping…",
      command: "paged.panel.show.media.paged.data.panel.bindings",
      order: 20,
    },
    {
      path: "Help/Keyboard shortcuts",
      command: "paged.panel.show.paged.keyboard-shortcuts",
      order: 20,
    },
    {
      path: "Data/Generate pages…",
      command: "paged.panel.show.media.paged.data.panel.dataset",
      order: 30,
    },
  ];

export const INSERT_MENU_ITEMS: MenuItemContribution[] = [
  {
    path: "Object/Insert text frame",
    command: PAGED_INSERT_TEXT_FRAME,
    order: 1,
    group: "insert",
    when: insertApplies,
  },
  {
    path: "Object/Insert rectangle",
    command: PAGED_INSERT_RECTANGLE,
    order: 2,
    group: "insert",
    when: insertApplies,
  },
  {
    path: "Object/Insert ellipse",
    command: PAGED_INSERT_ELLIPSE,
    order: 3,
    group: "insert",
    when: insertApplies,
  },
  {
    path: "Object/Insert line",
    command: PAGED_INSERT_LINE,
    order: 4,
    group: "insert",
    when: insertApplies,
  },
  {
    path: "Object/Insert table",
    command: PAGED_INSERT_TABLE,
    order: 5,
    group: "insert",
    when: insertApplies,
  },
  {
    path: "File/Place…",
    command: PAGED_INSERT_PLACE_IMAGE,
    order: 40,
    group: "place",
    when: insertApplies,
  },
  {
    path: "Layout/Add page",
    command: PAGED_INSERT_NEW_PAGE,
    order: 5,
    when: insertApplies,
  },
  {
    path: "Layout/Delete page",
    command: PAGED_INSERT_DELETE_PAGE,
    order: 6,
    when: insertApplies,
  },
  ...PLUGIN_INSERT_ENTRIES.map((e) => ({
    path: e.path,
    command: e.command,
    order: e.order,
    group: "insert-plugin",
    when: pluginInsert(e.command),
  })),
];

/** Cmd+D — InDesign's Place. Verified unbound across the live
 *  keybinding registry (built-ins + bundles); both platform variants
 *  register, each a distinct key→command signature (INV-REG-3). */
export const INSERT_KEYBINDINGS: KeybindingContribution[] = [
  { key: "cmd+d", command: PAGED_INSERT_PLACE_IMAGE },
  { key: "ctrl+d", command: PAGED_INSERT_PLACE_IMAGE },
];
