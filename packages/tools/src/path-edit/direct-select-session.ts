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

// Direct path editing — the editor's shim over paged.draw's
// `DirectSelectMachine`.
//
// THE MACHINE OWNS THE BEHAVIOUR: which press drags an anchor and which
// a handle, that a smooth anchor's handles stay paired and Alt breaks
// them, what Shift constrains, how a marquee selects, what Delete may
// remove. None of that is restated here. This file is the four things
// the machine asks its host for:
//
//   1. THE TABLE. `pathAnchors` in, `sync` after anything changes it —
//      this session's own edits, an undo, a redo, somebody else's
//      mutation. The engine stores f32, so its table is the truth and
//      the machine's f64 preview is not.
//   2. THE HIT. The machine never hit-tests; `hitPathTable` says what a
//      press landed on, with grab sizes converted to pt at the zoom of
//      THAT press.
//   3. THE WIRE. A committed plan is lowered by the machine's own
//      `directSelectMutation` to ONE batch — one undo step — and sent.
//   4. WHAT A CLICK MEANS. The machine reports a press that never left
//      the slop as `click`; the two things the path-edit overlay has
//      always done with one are layered on here: a second click on the
//      same anchor converts it (corner ↔ smooth), a click on a segment
//      inserts an anchor there. Both plans come from paged.draw too.
//
// One session edits ONE path, for as long as it stays the path-edit
// target. It is React-free; the shell sees it as a `PathEditSession`.

import type {
  CanvasClient,
  ElementId,
  PathAnchorsResult,
  WorkerToMain,
} from "@paged-media/client";
import type {
  PathEditHit,
  PathEditPointer,
  PathEditRelease,
  PathEditSession,
  PathEditView,
} from "@paged-media/shell";

import {
  anchorTargets,
  isCornerAnchor,
  snapPoint,
  type SnapTarget,
} from "@paged-media/draw/geometry";
import {
  DirectSelectMachine,
  anchorEditOps,
  directSelectMutation,
  pathEditBatch,
  planAnchorAddAt,
  type DirectSelectKey,
  type DirectSelectPlan,
  type DirectSelectRefusal,
  type PathPointOp,
} from "@paged-media/draw/machines";

import { hitPathTable, pathHitRadii } from "./path-hit";
import {
  SNAP_TOLERANCE_PX,
  snappingOn,
  type EngineSnapQuery,
  type EngineSnapResult,
} from "../handlers/snapper";

/** Pointer travel under which a press and release is a click — the
 *  canvas's own click-vs-drag threshold, so a click means the same
 *  thing on an anchor as it does on a frame. */
const CLICK_SLOP_PX = 4;
/** One arrow-key nudge, pt (×10 with Shift, the machine's rule) — the
 *  step `paged.object.nudge*` moves a whole object by. A document
 *  distance, deliberately not a screen one. */
const NUDGE_STEP_PT = 1;
/** Two clicks on the same anchor within this window are a double-click
 *  (the canvas's multi-click window). */
const DOUBLE_CLICK_MS = 500;

const NUDGE_KEYS: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Delete",
  "Backspace",
]);

/** The keys that belong to the anchors while path-edit mode is on,
 *  whether or not any anchor is selected — the host yields them here
 *  rather than let them reach the object-level Delete / Nudge. */
export function isPathEditKey(key: string): boolean {
  return NUDGE_KEYS.has(key);
}

const PLAN_LABEL: Record<DirectSelectPlan["kind"], string> = {
  move: "Move anchor",
  handle: "Move handle",
  segment: "Reshape segment",
  nudge: "Nudge anchor",
  delete: "Delete anchor",
};

export type PathEditReport = (
  severity: "error" | "warning" | "info",
  message: string,
) => void;

/** The slice of the worker client a session uses. */
export type PathEditClient = Pick<
  CanvasClient,
  "pathAnchors" | "mutate" | "subscribe"
>;

export interface DirectSelectSessionOptions {
  client: PathEditClient;
  /** The path to edit. */
  target: ElementId;
  /** The selected-anchor set changed (flat indices, ascending). */
  onSelectionChange?: (selected: readonly number[]) => void;
  /** The path was re-read after a change — this session's edit, an
   *  undo, anyone's mutation. The element's bounds may have moved with
   *  it, so chrome drawn from cached geometry is stale. */
  onPathChanged?: () => void;
  /** A refusal, in words for the user: the machine's (a Delete that
   *  would starve a contour) or the engine's own sentence. */
  report?: PathEditReport;
  /** v67 (RFI C-68) — the engine's point snapper. With it, a dragged
   *  anchor snaps to every visible element, the page, guides and the
   *  grid, not only this path's other anchors. `null` from it (an engine
   *  before v67) keeps the local snap. */
  snapEngine?: (query: EngineSnapQuery) => Promise<EngineSnapResult | null>;
}

/** The engine's own sentence for a refused mutation, or null when it
 *  applied. `client.mutate` RESOLVES on a refusal. */
function refusalOf(reply: WorkerToMain): string | null {
  if (reply.kind !== "mutationFailed") return null;
  const error = reply.payload.error;
  if (error.kind === "notImplemented") return error.details.what;
  if (error.kind === "noDocument") return "no document loaded";
  return `the engine refused the operation (${error.kind})`;
}

function sameIndices(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export class DirectSelectSession implements PathEditSession {
  private readonly client: PathEditClient;
  private readonly target: ElementId;
  private readonly options: DirectSelectSessionOptions;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;

  private machine: DirectSelectMachine | null = null;
  /** The slop the live machine was built with. */
  private machineSlop = 0;
  /** The slop the current zoom asks for. */
  private slop = CLICK_SLOP_PX;
  /** The engine's last answer — inner space, the truth. */
  private reply: PathAnchorsResult | null = null;
  private view: PathEditView | null = null;
  private selected: readonly number[] = [];

  /** Counts `pathAnchors` reads, so only the newest answer lands. */
  private readSeq = 0;
  /** Counts edits this session has committed. The re-read that follows
   *  edit N describes a table the machine has already moved past once
   *  edit N+1 is planned, and is dropped — N+1's own re-read follows. */
  private editSeq = 0;
  /** This session's mutations awaiting their reply. */
  private inFlight = 0;
  /** True from a committed plan until its re-read lands: the machine's
   *  table is ahead of the engine's last answer. */
  private ahead = false;
  /** A re-read that arrived while a gesture was in flight. */
  private parked: PathAnchorsResult | null = null;
  /** Sends and click-actions, in order, each after the re-read of the
   *  one before — so a click-action always plans on the engine's table. */
  private queue: Promise<void> = Promise.resolve();
  /** Click-actions (insert, convert) planned but not yet re-read. The
   *  machine does not preview them, so until the table they produce is
   *  in, its indices are not the engine's: input waits. */
  private pendingActions = 0;
  private lastAnchorClick: { index: number; at: number } | null = null;
  /** An anchor drag in progress (RFI C-68): the grabbed anchor's start,
   *  where the press landed, and the other anchors it may snap to. */
  private grab: {
    start: readonly [number, number];
    down: readonly [number, number];
    targets: SnapTarget[];
    index: number;
  } | null = null;
  /** v67 — the engine's answer for one dragged position (`key`), so a
   *  move or the release at that position uses it; and the pointer of
   *  the newest move, so a late answer for an older position is dropped
   *  and a fresh one is applied by re-running that move. */
  private engineSnap: { key: string; at: readonly [number, number] } | null = null;
  private engineAsked: string | null = null;
  private lastMove: PathEditPointer | null = null;
  private disposed = false;

  constructor(options: DirectSelectSessionOptions) {
    this.options = options;
    this.client = options.client;
    this.target = options.target;
    this.unsubscribe = this.client.subscribe((msg) => this.onMessage(msg));
    void this.read(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.listeners.clear();
  }

  // ---- PathEditSession: the store -----------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getView = (): PathEditView | null => this.view;

  // ---- PathEditSession: the pointer ---------------------------------------

  hitAt(pointer: PathEditPointer): PathEditHit {
    if (!this.machine) return { kind: "empty" };
    return hitPathTable(
      this.machine.snapshot().table,
      pointer.point,
      pathHitRadii(pointer.ptPerPx),
    );
  }

  pointerDown(pointer: PathEditPointer): void {
    this.retune(pointer.ptPerPx);
    if (!this.machine || this.pendingActions > 0) return;
    const hit = this.hitAt(pointer);
    this.grab = null;
    if (hit.kind === "anchor") {
      const anchors = this.machine.snapshot().table.anchors;
      const start = anchors[hit.index]?.anchor;
      if (start) {
        this.grab = {
          start: [start[0], start[1]],
          down: [pointer.point[0], pointer.point[1]],
          targets: anchorTargets(
            // Not itself, and not the other SELECTED anchors — they move
            // with it, so snapping to one would be snapping to nothing.
            anchors
              .filter((_, i) => i !== hit.index && !this.selected.includes(i))
              .map((a) => [a.anchor[0], a.anchor[1]]),
          ),
          index: hit.index,
        };
        this.engineSnap = null;
        this.engineAsked = null;
      }
    }
    this.machine.handle({
      type: "down",
      point: pointer.point,
      hit,
      modifiers: pointer.modifiers,
    });
    this.publish();
  }

  /** The pointer moved so that the GRABBED anchor — not the pointer —
   *  lands on a snap target: the anchor follows the pointer by the drag
   *  delta, that position is snapped against the path's other anchors
   *  (points, then their x / y alignment lines), and the pointer is
   *  shifted by the same correction. Cmd, Shift (constrain) and View ▸
   *  Snap to points off all bypass it. */
  private snapped(pointer: PathEditPointer): readonly [number, number] {
    const g = this.grab;
    if (!g || !snappingOn(pointer.modifiers)) return pointer.point;
    const at: [number, number] = [
      g.start[0] + pointer.point[0] - g.down[0],
      g.start[1] + pointer.point[1] - g.down[1],
    ];
    const key = `${at[0]},${at[1]}`;
    const engine = this.engineSnap?.key === key ? this.engineSnap.at : null;
    if (!engine) this.askEngine(key, at, pointer);
    const to = engine ?? snapPoint(at, g.targets, SNAP_TOLERANCE_PX * pointer.ptPerPx).point;
    return [pointer.point[0] + to[0] - at[0], pointer.point[1] + to[1] - at[1]];
  }

  /** v67 — ask the engine to snap the dragged position. The local snap
   *  has already answered this sample; when the engine's answer comes
   *  back for the position the drag is still at, that move is re-run
   *  with it (and the release at that position uses it). An answer for a
   *  position the drag has left is dropped. */
  private askEngine(
    key: string,
    at: readonly [number, number],
    pointer: PathEditPointer,
  ): void {
    const ask = this.options.snapEngine;
    const pageId = this.reply?.pageId;
    const g = this.grab;
    if (!ask || !pageId || !g || this.engineAsked === key) return;
    this.engineAsked = key;
    const exclude = [
      { id: this.target, anchors: [g.index, ...this.selected.filter((i) => i !== g.index)] },
    ];
    void ask({
      pageId,
      point: [at[0], at[1]],
      cameraScale: 1 / pointer.ptPerPx,
      exclude,
    }).then((r) => {
      if (!r || this.disposed || this.grab !== g) return;
      this.engineSnap = { key, at: [r.point[0], r.point[1]] };
      const last = this.lastMove;
      if (!last || !this.machine) return;
      const lastAt = `${g.start[0] + last.point[0] - g.down[0]},${g.start[1] + last.point[1] - g.down[1]}`;
      if (lastAt !== key) return;
      this.machine.handle({
        type: "move",
        point: this.snapped(last),
        modifiers: last.modifiers,
      });
      this.publish();
    });
  }

  pointerMove(pointer: PathEditPointer): void {
    if (!this.machine) return;
    this.lastMove = pointer;
    this.machine.handle({
      type: "move",
      point: this.snapped(pointer),
      modifiers: pointer.modifiers,
    });
    this.publish();
  }

  pointerUp(pointer: PathEditPointer): PathEditRelease {
    // No table yet (the first read is still out): the press was never
    // the session's, so the canvas's ordinary click runs.
    if (!this.machine) return "emptyClick";
    const snap = this.machine.handle({
      type: "up",
      point: this.snapped(pointer),
      modifiers: pointer.modifiers,
    });
    this.grab = null;
    this.engineSnap = null;
    this.engineAsked = null;
    this.lastMove = null;
    let release: PathEditRelease = "consumed";
    if (snap.commit) {
      this.commit(snap.commit);
    } else {
      if (snap.refusal) this.refuse(snap.refusal);
      if (snap.click) release = this.onClick(snap.click, pointer);
      this.unpark();
    }
    this.publish();
    return release;
  }

  cancel(): void {
    if (!this.machine || !this.inGesture()) return;
    this.machine.handle({
      type: "key",
      key: "Escape",
      modifiers: { shift: false, alt: false },
    });
    this.unpark();
    this.publish();
  }

  // ---- PathEditSession: the keyboard --------------------------------------

  key(event: { key: string; shiftKey: boolean; altKey: boolean }): boolean {
    if (event.key === "Escape") {
      // An idle Escape is the host's: it leaves path-edit mode.
      if (!this.machine || !this.inGesture()) return false;
      this.cancel();
      return true;
    }
    if (!isPathEditKey(event.key)) return false;
    if (!this.machine || this.pendingActions > 0) return true;
    const snap = this.machine.handle({
      type: "key",
      key: event.key as DirectSelectKey,
      modifiers: { shift: event.shiftKey, alt: event.altKey },
    });
    if (snap.commit) this.commit(snap.commit);
    else if (snap.refusal) this.refuse(snap.refusal);
    this.publish();
    return true;
  }

  // ---- the table ----------------------------------------------------------

  private onMessage(msg: WorkerToMain): void {
    if (this.disposed) return;
    if (msg.kind === "undoApplied" || msg.kind === "redoApplied") {
      void this.read(true);
      return;
    }
    // A mutation that is not this session's own (a panel, a script, the
    // Pen) changed the document under it. Its own are re-read by the
    // send that made them.
    if (msg.kind === "mutationApplied" && this.inFlight === 0) {
      void this.read(true);
    }
  }

  /**
   * Re-read the anchor table and seat the machine on it. `force` lands
   * the answer whatever the machine is doing — the document changed
   * from outside, and a gesture built on the old table is void. Without
   * it the read is the echo of this session's own edit number `edit`:
   * it waits for a gesture in flight to finish, and yields to a later
   * edit the machine has already planned on top of it.
   */
  private async read(force: boolean, edit = this.editSeq): Promise<void> {
    const seq = ++this.readSeq;
    let reply: PathAnchorsResult | null;
    try {
      reply = await this.client.pathAnchors(this.target);
    } catch {
      // The worker went away (reload, dispose): keep what is drawn.
      return;
    }
    if (this.disposed || seq !== this.readSeq) return;
    if (!force && edit !== this.editSeq) return;
    if (!force && this.machine && this.inGesture()) {
      this.parked = reply;
      return;
    }
    this.install(reply);
  }

  private install(reply: PathAnchorsResult | null): void {
    this.parked = null;
    this.ahead = false;
    // No anchors, or no page to draw them on (C-23): nothing to edit.
    if (!reply || reply.anchors.length === 0 || !reply.pageId) {
      this.reply = null;
      this.machine = null;
    } else {
      this.reply = reply;
      const transform = reply.itemTransform ?? null;
      if (this.machine && this.machineSlop === this.slop) {
        this.machine.sync(reply, transform);
      } else {
        // First table, or the zoom changed since the machine was built
        // (its slop is a constructor option): a fresh machine, carrying
        // the selection over.
        this.machine = new DirectSelectMachine({
          table: reply,
          transform,
          slop: this.slop,
          nudgeStep: NUDGE_STEP_PT,
          selection: this.machine?.snapshot().selected ?? [],
        });
        this.machineSlop = this.slop;
      }
    }
    this.publish();
    this.options.onPathChanged?.();
  }

  /** A re-read that waited out a gesture which changed nothing. */
  private unpark(): void {
    if (this.parked) this.install(this.parked);
  }

  /**
   * Bring the machine's click slop to the current zoom. The slop is
   * fixed when a machine is built, so a zoom change needs a new one —
   * possible only between gestures and only while the engine's table is
   * the machine's (no edit of ours still awaiting its re-read);
   * otherwise the next re-read does it.
   */
  private retune(ptPerPx: number): void {
    this.slop = CLICK_SLOP_PX * ptPerPx;
    if (!this.machine || this.machineSlop === this.slop) return;
    if (this.inGesture() || this.ahead || !this.reply) return;
    this.install(this.reply);
  }

  private inGesture(): boolean {
    return this.machine !== null && this.machine.snapshot().mode !== "idle";
  }

  // ---- the wire -----------------------------------------------------------

  private commit(plan: DirectSelectPlan): void {
    // The plan is built on top of anything parked: that read is void.
    this.parked = null;
    this.ahead = true;
    this.send(directSelectMutation(plan, this.target), PLAN_LABEL[plan.kind]);
  }

  /** Send one mutation and re-read the table it produced. Serialised:
   *  the next send goes out after this one's reply, in commit order. */
  private send(
    mutation: Parameters<PathEditClient["mutate"]>[0],
    label: string,
    done?: () => void,
  ): void {
    const edit = ++this.editSeq;
    this.enqueue(async () => {
      this.inFlight += 1;
      let refused = false;
      try {
        const refusal = refusalOf(await this.client.mutate(mutation));
        if (refusal) {
          refused = true;
          this.options.report?.("error", `${label} refused: ${refusal}`);
        }
      } catch (err) {
        refused = true;
        this.options.report?.("error", `${label} failed: ${String(err)}`);
      } finally {
        this.inFlight -= 1;
      }
      // A refused edit left the machine previewing something the engine
      // does not hold: put it back on the truth, whatever it is doing.
      try {
        await this.read(refused, edit);
      } finally {
        done?.();
      }
    });
  }

  private enqueue(task: () => Promise<void>): void {
    const run = () => (this.disposed ? Promise.resolve() : task());
    this.queue = this.queue.then(run, run);
  }

  private refuse(refusal: DirectSelectRefusal): void {
    if (refusal.reason === "contourFloor") {
      this.options.report?.(
        "info",
        "Delete anchor refused: a path contour keeps at least two anchors. " +
          "Delete the object to remove the whole path.",
      );
    } else {
      this.options.report?.(
        "error",
        "Path edit refused: the element's transform has no inverse, so a " +
          "position on the page cannot be written back into the path.",
      );
    }
  }

  // ---- what a click means ---------------------------------------------------

  private onClick(hit: PathEditHit, pointer: PathEditPointer): PathEditRelease {
    if (hit.kind === "empty") {
      this.lastAnchorClick = null;
      return "emptyClick";
    }
    if (hit.kind === "segment") {
      this.lastAnchorClick = null;
      this.insertAnchor(hit.index, hit.t);
      return "consumed";
    }
    if (hit.kind === "anchor" && !pointer.modifiers.shift) {
      const last = this.lastAnchorClick;
      if (
        last &&
        last.index === hit.index &&
        pointer.timeStamp - last.at <= DOUBLE_CLICK_MS
      ) {
        this.lastAnchorClick = null;
        this.convertAnchor(hit.index);
      } else {
        this.lastAnchorClick = { index: hit.index, at: pointer.timeStamp };
      }
    }
    return "consumed";
  }

  /** Segment click → curve-preserving insert: paged.draw's own plan
   *  (`planAnchorAddAt`), on the engine's table. `t` was found in
   *  pointer space and names the same point in the path's inner space —
   *  an affine map does not re-parameterise a cubic. */
  private insertAnchor(segStart: number, t: number): void {
    this.act("Insert anchor", (table) => {
      const plan = planAnchorAddAt(table, segStart, t);
      return plan ? anchorEditOps(plan) : null;
    });
  }

  /** Double-click → corner ↔ smooth, judged on the engine's table. */
  private convertAnchor(index: number): void {
    this.act("Convert anchor", (table) => {
      const anchor = table.anchors[index];
      return anchor
        ? [{ op: "pathPointCurveType", index, smooth: isCornerAnchor(anchor) }]
        : null;
    });
  }

  /**
   * Run a click-action: plan it on the engine's table — after every
   * edit committed before the click has been re-read — and send it as
   * one batch. Input waits (`pendingActions`) until its own re-read is
   * in, because the machine never previewed it.
   */
  private act(
    label: string,
    plan: (table: PathAnchorsResult) => PathPointOp[] | null,
  ): void {
    this.pendingActions += 1;
    const done = () => {
      this.pendingActions -= 1;
    };
    this.enqueue(async () => {
      const ops = this.reply ? plan(this.reply) : null;
      if (!ops) {
        done();
        return;
      }
      this.send(pathEditBatch(this.target, ops), label, done);
    });
  }

  // ---- the view -------------------------------------------------------------

  private publish(): void {
    const next = this.compose();
    const selected = next?.selected ?? [];
    if (!sameIndices(selected, this.selected)) {
      this.selected = selected;
      this.options.onSelectionChange?.(selected);
    }
    if (next === this.view) return;
    this.view = next;
    for (const listener of this.listeners) listener();
  }

  /** The machine's snapshot as the overlay's view — the SAME object as
   *  last time when nothing in it changed. */
  private compose(): PathEditView | null {
    if (!this.machine || !this.reply?.pageId) return null;
    const snap = this.machine.snapshot();
    const gesture = snap.mode !== "idle";
    const prev = this.view;
    if (
      prev &&
      prev.anchors === snap.table.anchors &&
      prev.subpathStarts === snap.table.subpathStarts &&
      prev.marquee === snap.marquee &&
      prev.gesture === gesture &&
      prev.pageId === this.reply.pageId &&
      sameIndices(prev.selected, snap.selected)
    ) {
      return prev;
    }
    return {
      target: this.target,
      pageId: this.reply.pageId,
      anchors: snap.table.anchors,
      subpathStarts: snap.table.subpathStarts,
      ...(snap.table.subpathOpen
        ? { subpathOpen: snap.table.subpathOpen }
        : {}),
      selected: snap.selected,
      marquee: snap.marquee,
      gesture,
    };
  }
}
