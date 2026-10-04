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

// The path-edit SESSION contract — what the shell needs from whoever
// drives direct path editing, and nothing about how it is driven.
//
// The behaviour (which press drags an anchor, what Shift constrains,
// when a marquee selects) is paged.draw's Direct Selection state
// machine. The shell must not import a plugin bundle, so the machine
// is owned one layer up (`@paged-media/tools` builds the session, the
// canvas app mounts it) and reaches the shell as this interface:
//
//   · the path-edit OVERLAY reads `getView()` and draws it — the
//     preview table, the selected anchors, the marquee;
//   · the canvas pointer router feeds `pointerDown / Move / Up`;
//   · the path-edit key hook feeds `key`.
//
// Every coordinate that crosses this interface is PAGE-LOCAL pt of the
// page the path sits on (`PathEditView.pageId`). The path's own inner
// space, and the item transform between the two, stay inside the
// session.

// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementId, PageId } from "@paged-media/client";

/** One path point as the overlay draws it: page-local pt. */
export interface PathEditAnchor {
  anchor: readonly [number, number];
  left: readonly [number, number];
  right: readonly [number, number];
}

/** What a press landed on. `index` is the flat anchor index (across
 *  contours); a segment is named by its START anchor. */
export type PathEditHit =
  | { kind: "anchor"; index: number }
  | { kind: "handle"; index: number; side: "left" | "right" }
  | { kind: "segment"; index: number; t: number }
  | { kind: "empty" };

/** A marquee in page-local pt, normalised (width / height ≥ 0). */
export interface PathEditMarquee {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the overlay draws. A NEW object whenever anything in it
 *  changed, the SAME object otherwise (it is an external-store
 *  snapshot). */
export interface PathEditView {
  /** The element whose path is being edited. */
  target: ElementId;
  /** The page the path sits on. */
  pageId: PageId;
  /** The path as edited so far — the live preview during a drag. */
  anchors: readonly PathEditAnchor[];
  subpathStarts: readonly number[];
  subpathOpen?: readonly boolean[];
  /** Selected anchors, flat indices, ascending. */
  selected: readonly number[];
  /** The anchor marquee while one is being dragged. */
  marquee: PathEditMarquee | null;
  /** True between a press and its release. */
  gesture: boolean;
}

/** One pointer sample, already resolved by the canvas. */
export interface PathEditPointer {
  /** Page-local pt on the view's page (it may lie outside the page
   *  rect — a drag does not stop at the paper's edge). */
  point: readonly [number, number];
  /** `cmd` (Cmd/Ctrl held) turns snapping off for this event. */
  modifiers: { shift: boolean; alt: boolean; cmd?: boolean };
  /** Document pt per CSS px at the current zoom — what turns a pixel
   *  tolerance (the click slop, a dot's grab radius) into pt. */
  ptPerPx: number;
  /** `Event.timeStamp`, ms — the double-click clock. */
  timeStamp: number;
}

/**
 * How a release ended. `"emptyClick"` is a click that landed on none of
 * the path's chrome: the session did nothing with it beyond clearing
 * the anchor selection, and the canvas runs its ordinary click (select
 * what is under the pointer, or deselect) so the user can leave for
 * another element without a detour through Escape.
 */
export type PathEditRelease = "consumed" | "emptyClick";

export interface PathEditSession {
  /** External-store pair for `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void;
  /** Null until the first anchor read lands, and whenever the element
   *  has no anchor table on a page. */
  getView(): PathEditView | null;

  /** What a press at `pointer` would land on — the session's own hit
   *  test, the one `pointerDown` uses. */
  hitAt(pointer: PathEditPointer): PathEditHit;
  pointerDown(pointer: PathEditPointer): void;
  pointerMove(pointer: PathEditPointer): void;
  pointerUp(pointer: PathEditPointer): PathEditRelease;
  /** Abort the gesture in flight with nothing sent (capture loss,
   *  window blur). */
  cancel(): void;

  /**
   * Offer a key. Returns true when the session took it: an arrow nudges
   * the selected anchors, Delete / Backspace removes them, and Escape is
   * taken only while a gesture is in flight (an idle Escape is the
   * host's — it leaves path-edit mode).
   */
  key(event: {
    key: string;
    shiftKey: boolean;
    altKey: boolean;
  }): boolean;
}
