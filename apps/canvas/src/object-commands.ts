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

// `paged.object.*` — the structural object command layer.
//
// WHY THIS LIVES IN THE EDITOR AND NOT IN A PLUGIN. Basic object
// operations are what plugins BUILD ON, so they belong to the host.
// Group / Ungroup / Select parent group used to exist only inside
// paged.draw (`media.paged.draw.command.*`), which meant a user without
// the vector plugin loaded could not group — although `CreateGroup` /
// `DissolveGroup` have been wire ops the whole time. Arrange did not
// exist at all: the editor's entire command set was Undo, Redo, Open
// PDF, Save As IDML and four zoom verbs. These seven verbs close both
// gaps, and paged.draw's three structural commands were retired so
// there is exactly ONE implementation of each.
//
// Four measured facts shape the code below; each is load-bearing.
//
//  1. ARRANGE RIDES `reorderElement { elementId, to }` (protocol 59)
//     with the four RELATIVE verbs, never `{ index }`. The verbs are
//     evaluated against the order the engine holds AT APPLY TIME, so a
//     concurrent insert cannot make them restack the wrong item. The
//     absolute form is the honest shape for a layers-panel DRAG (the
//     schema-panel renderer uses it, and an out-of-range index is
//     REFUSED, not clamped) — it is the wrong shape for a menu verb.
//
//  2. `reorderElement` CANNOT REPARENT. The engine derives the sibling
//     list from where the node already is (spread `frames_in_order`,
//     `Group::members`, or a container's nested children), so a reorder
//     structurally cannot leave a group. That is by design — there is
//     deliberately no parent argument here, and Bring to front on a
//     grouped item brings it to the front OF ITS GROUP.
//
//  3. ARRANGE IS WITHIN A LAYER. The renderer sorts `frames_in_order`
//     by `ItemLayer` before it paints, so bring-to-front cannot lift an
//     item above one on a higher layer — InDesign's model, where
//     crossing layers is a different gesture. The op still applies and
//     the z table still changes; nothing moves on canvas. When the
//     document carries more than one layer we say so through `report`
//     rather than letting the user discover it.
//
//  4. `client.mutate` NEVER REJECTS. A refusal arrives as a resolved
//     `WorkerToMain` of kind `mutationFailed`, so a bare `.catch`
//     swallows exactly the loud rejection this design exists to give.
//     Every call site here inspects the reply.
//
// Multi-selection preserves RELATIVE ORDER — see `arrangePlan`.
//
// DELETE AND NUDGE joined later, for the same reason the first seven
// exist: until then the editor could not delete an object or move one
// with the arrow keys at all. `deleteFrame` was called by no editor
// source, and Backspace was handled only by text editing, path-edit
// mode and the page tool. Five more measured facts shape them; each
// was read off the engine before a line was written.
//
//  5. A GROUP IS NOT A FRAME. `deleteFrame { frameId }` resolves its id
//     against the spread's five leaf lists and refuses anything else
//     ("Mutation::DeleteFrame"). A group dies by `dissolveGroup` plus a
//     `deleteFrame` per leaf, in ONE batch — and one undo brings the
//     group back under its own id with its members in order.
//
//  6. A MEMBER OF A GROUP THAT STAYS IS NOT DELETED FROM HERE. Up to
//     engine 0.64 `deleteFrame` did not renumber group member tables
//     (engine-findings §10): deleting a member, or any OLDER item of the
//     same kind, left a surviving group pointing at its neighbours, so
//     this layer refused the member case and read the member tables back
//     after every other delete, undoing it on a difference. 0.65 fixed
//     the renumbering (core 4fa48f1), and the read-back went with it: a
//     delete below a group is an ordinary delete (AC-OBJ-18). The member
//     refusal stays, as host policy: one member out of a two-plus group
//     now lands right, but deleting EVERY member leaves an empty
//     `group:<id>` behind in the tree (measured on 0.66.0), and paged.draw
//     pinned an undo that does not restore it. See `deletePlan`.
//
//  7. NUDGE IS A TRANSFORM WRITE, NEVER A BOUNDS WRITE. A page item's
//     `ItemTransform` is the last step into spread space, so adding the
//     step to its translation moves a rectangle, a rotated rectangle, a
//     text frame, a line and a pen path identically, content and all —
//     rigid by construction. `moveFrame` is that whole-transform write
//     by name (the engine maps it to `SetProperty { FrameTransform }`),
//     and it is display geometry: no re-pagination, unlike a resize.
//
//     `frameBounds` is the other candidate, and it is what the engine's
//     own translate GESTURE commits for an un-rotated item. It is not
//     correct for every kind, on two counts, both measured: it lives in
//     the item's INNER space, so on a rotated frame it moves along the
//     rotated axes (the gesture itself switches to the transform
//     there); and up to engine 0.64, on a line or a pen path it moved
//     the box and left the anchors where they were, so a dragged line
//     snapped back (engine-findings §14, fixed in the GESTURE by 0.65,
//     core 91bafcc — a plain `frameBounds` write still moves only the
//     box). For a plain rectangle the two writes paint the same pixels.
//
//     The readouts follow it: Properties ▸ Bounds and Transform ▸ X/Y
//     compose the transform (`panels/page-position.ts`), and a typed
//     X/Y moves through `translationPlan` below — this same write.
//
//  8. A GROUP MOVES ONLY THROUGH `setGroupTransform`. Its members hold
//     ABSOLUTE transforms, and that op is the one that rebases them.
//     `setElementProperty { frameTransform }` on a group id is accepted
//     and moves nothing — it rewrites the group's stored matrix and
//     leaves every member where it was. `moveFrame` on a group id is
//     refused. So a nudge reads which kind it holds and picks the op.
//
//  9. THE HOST HAS NO UNDO COALESCING. The undo log has no merge-with-
//     previous; `batch` needs its ops up front; the only many-updates-
//     one-commit path is a pointer GESTURE session, which is exclusive,
//     needs an end signal the keybinding registry does not deliver, and
//     commits a bounds write for an un-rotated box. So a nudge is one
//     undo step per engine round trip — see `nudgeSelection` for what
//     that means under key repeat.
//
// MAKE / RELEASE CLIPPING MASK joined last, over B-18's `pasteInto` /
// `releaseFrom`, which no editor source called. Illustrator's rule: with
// two or more objects selected the TOPMOST is the clipping path and the
// rest become its content. Four more measured facts:
//
// 10. ONE CONTAINER TAKES SEVERAL CHILDREN, each its own `pasteInto`;
//     they paint in the order they were pasted, clipped by the
//     container's outline. The container must be a rectangle, an ellipse
//     or a path (a text frame / line answers "cannot host a Rectangle
//     child"; a group id is not even mapped — `Mutation::PasteInto`).
//     The content must be single page items: a group is unmapped the
//     same way, and a grouped item is refused ("B-18: a grouped item
//     cannot be pasted into a frame (ungroup first)"). A container that
//     sits inside a group is accepted. See `clipPlan`.
//
// 11. NESTED CONTENT IS INVISIBLE TO EVERY ENUMERATING READ. The scene
//     tree drops it, `requestGroupLeaves` on the container answers `[]`,
//     `elementProperties` lists nothing, the hit-tester never reports it
//     — while `elementGeometry`, `moveFrame` and `releaseFrom` all still
//     answer for it BY ID. Nothing on the wire lists a container's
//     content (engine-findings §15). So the host keeps its own index:
//     Make stamps the content's ids on the container as plugin metadata
//     (`OBJECT_METADATA_KEY`) IN THE SAME BATCH, which keeps the index
//     and the nesting in step through undo and redo. Release, Delete and
//     Nudge read it. Content nested by anything else — an InDesign
//     paste-into, a script, paged.draw's repeats — carries no index and
//     cannot be found from here.
//
// 12. A RELEASED ITEM LANDS AT THE FRONT. The wire's `releaseFrom` has no
//     slot argument; the engine appends to the spread's list. So Release
//     follows each one with a `reorderElement { index }` that puts it
//     directly BENEATH the clipping path, in the order it held inside —
//     Illustrator's Release. Where the clipping path is inside a group
//     the content lands beneath that group instead: a reorder cannot
//     reparent (fact 2). See `releasePlan`.
//
// 13. A CONTAINER'S CONTENT DOES NOT MOVE WITH IT. Nested children keep
//     spread-space transforms, so `moveFrame` on the container — and the
//     engine's own drag — move the MASK over content that stays where it
//     was (§16). So Nudge moves each indexed child by the same step. The
//     drag is the engine's, and stays §16. Delete releases and removes
//     each indexed child before the container, in the same batch (one
//     undo re-nests it). Up to 0.64 that was the only way the content
//     went with its container (§12: the engine popped it back out); 0.65
//     removes nested content with its container itself (core 65ee6a1),
//     so the explicit form is now simply the same batch spelled out, and
//     content nested by anything else goes with its container too.

import type {
  CommandContribution,
  KeybindingContribution,
  MenuItemContribution,
} from "@paged-media/shell";
import type {
  CanvasClient,
  ElementId,
  ElementProperties,
  Mutation,
  SceneTreeNode,
  WorkerToMain,
} from "@paged-media/client";

export const PAGED_OBJECT_BRING_TO_FRONT = "paged.object.bringToFront";
export const PAGED_OBJECT_BRING_FORWARD = "paged.object.bringForward";
export const PAGED_OBJECT_SEND_BACKWARD = "paged.object.sendBackward";
export const PAGED_OBJECT_SEND_TO_BACK = "paged.object.sendToBack";
export const PAGED_OBJECT_GROUP = "paged.object.group";
export const PAGED_OBJECT_UNGROUP = "paged.object.ungroup";
export const PAGED_OBJECT_SELECT_PARENT_GROUP =
  "paged.object.selectParentGroup";
export const PAGED_OBJECT_DELETE = "paged.object.delete";
export const PAGED_OBJECT_NUDGE_LEFT = "paged.object.nudgeLeft";
export const PAGED_OBJECT_NUDGE_RIGHT = "paged.object.nudgeRight";
export const PAGED_OBJECT_NUDGE_UP = "paged.object.nudgeUp";
export const PAGED_OBJECT_NUDGE_DOWN = "paged.object.nudgeDown";
// The keybinding registry maps a key to a command ID and nothing else
// — no argument, no event — so "Shift is ×10" has to be four commands
// of its own rather than a flag on the four above.
export const PAGED_OBJECT_NUDGE_LEFT_LARGE = "paged.object.nudgeLeftLarge";
export const PAGED_OBJECT_NUDGE_RIGHT_LARGE = "paged.object.nudgeRightLarge";
export const PAGED_OBJECT_NUDGE_UP_LARGE = "paged.object.nudgeUpLarge";
export const PAGED_OBJECT_NUDGE_DOWN_LARGE = "paged.object.nudgeDownLarge";
export const PAGED_OBJECT_MAKE_CLIPPING_MASK = "paged.object.makeClippingMask";
export const PAGED_OBJECT_RELEASE_CLIPPING_MASK =
  "paged.object.releaseClippingMask";

/** The plugin-metadata key the object layer keeps its clipping index
 *  under (fact 11). The engine reserves `x-paged:<owner>`; the host's
 *  object layer is the owner. */
export const OBJECT_METADATA_KEY = "x-paged:paged.object";

/** One arrow press, in points — InDesign's default cursor-key
 *  increment. */
export const NUDGE_STEP_PT = 1;
/** One Shift+arrow press: ten steps. */
export const NUDGE_LARGE_STEP_PT = 10;

export type NudgeDirection = "left" | "right" | "up" | "down";

/** Attribution the object layer publishes diagnostics under. */
export const OBJECT_DIAGNOSTIC_SOURCE = "paged.object";

/** The four Arrange verbs, spelled the way the wire spells them. */
export type ArrangeTarget = "front" | "forward" | "backward" | "back";

/** How a command reports back to the user. `info` is a fact about the
 *  edit that DID apply (the within-layer limit); `error` is the
 *  engine's own sentence for one that did not. */
export type ObjectReport = (
  severity: "error" | "info",
  message: string,
) => void;

/** Everything the object verbs need from the app. Supplied by
 *  `CanvasAppIntegration`, which owns the live client + selection. */
export interface ObjectCommandDeps {
  client: Pick<
    CanvasClient,
    | "mutate"
    | "sceneTree"
    | "setElementSelection"
    | "elementGeometry"
    | "layers"
    | "elementProperties"
  >;
  /** The LIVE element selection (read through a ref, never captured). */
  getSelection: () => readonly ElementId[];
  /** Replace the selection — worker first, then the main-thread mirror
   *  and the geometry the overlays key on (the `tree-panel` chain). */
  setSelection: (ids: ElementId[]) => Promise<void>;
  report: ObjectReport;
  /**
   * ADR 024 — the edit context the user is inside, or `null` at the
   * document root.
   *
   * These seven verbs are DOCUMENT-STRUCTURE operations: they reorder
   * and group PAGE ITEMS. Inside a plugin content type there are no
   * page items to arrange — the content is a raster stack, a grid, a
   * DOM — and the host element selection is the FRAME the user entered.
   * So every one of them read that frame and silently reordered or
   * grouped it in the document while the user believed they were
   * editing what was inside it. Ungroup was the destructive one.
   */
  activeEditContext: () => { type: string } | null;
  /**
   * Re-read the geometry the selection chrome is drawn from.
   *
   * The selection mirror caches each element's bounds + transform and
   * refreshes them only on the click, marquee and gesture-commit paths
   * — so after a move that arrives as a plain mutation the handles
   * would stay where the object used to be. A separate door from
   * `setSelection` because a nudge must not CHANGE the selection: a
   * selected group is drawn through its leaves, and re-selecting the
   * group id would ask for geometry a group does not have.
   */
  refreshSelectionGeometry: () => Promise<void>;
}

/**
 * The single guard for every verb here. Returns true when the command
 * must NOT run, having already told the user why.
 *
 * A REPORT, not a silent return: the command was reachable (a menu can
 * be open across a context change, a shortcut has no menu at all), so
 * the user pressed something and is owed an answer. Silence here is
 * what made the original defect invisible — the mutation landed on the
 * wrong target and nothing said anything either way.
 */
function blockedByEditContext(deps: ObjectCommandDeps, verb: string): boolean {
  const ctx = deps.activeEditContext();
  if (!ctx) return false;
  deps.report(
    "info",
    `${verb} arranges page items, and you are editing inside a ${ctx.type}. ` +
      "Leave the frame (Esc) to arrange it in the document.",
  );
  return true;
}

/** The closures a host binds to the commands. `nudge` is ONE closure
 *  for eight commands — direction and step are the command's identity,
 *  not the host's business. */
export interface ObjectCommandHandlers {
  bringToFront: () => void | Promise<void>;
  bringForward: () => void | Promise<void>;
  sendBackward: () => void | Promise<void>;
  sendToBack: () => void | Promise<void>;
  group: () => void | Promise<void>;
  ungroup: () => void | Promise<void>;
  selectParentGroup: () => void | Promise<void>;
  delete: () => void | Promise<void>;
  nudge: (direction: NudgeDirection, large: boolean) => void | Promise<void>;
  makeClippingMask: () => void | Promise<void>;
  releaseClippingMask: () => void | Promise<void>;
}

// ---------------------------------------------------------------- pure

/** Key an element id the way the scene tree's leaves key (the
 *  pathfinder panel's convention — `id` is a string for every page
 *  item; story/table addresses never carry a stacking position). */
export function elementKey(id: ElementId): string {
  return `${id.kind}:${String((id as { id: unknown }).id)}`;
}

/** One node's place in the engine's stacking model, read off the
 *  scene tree. */
export interface ZSlot {
  /** The sibling list the node belongs to. `reorderElement` moves it
   *  only WITHIN this list. */
  bucket: string;
  /** Index inside that list — 0 = BACKMOST, matching the engine
   *  (`ZOrderTarget::Back => 0`, `Front => last`). */
  siblingIndex: number;
  /** Position in the whole-document paint walk. Orders the APPLY
   *  sequence across buckets; monotonic within any one bucket. */
  rank: number;
}

/** Derive every addressable node's sibling list + slot from the scene
 *  tree.
 *
 *  The bucket is the nearest ID-BEARING ancestor — a group (its
 *  `members`) or a container frame (its nested children). Spread and
 *  Page rows carry no `ElementId`, and the engine's top-level list is
 *  the SPREAD's `frames_in_order`, not the page's: two pages of one
 *  spread share one stacking list, so they deliberately share one
 *  bucket here even though the tree nests them separately. */
export function zSlots(roots: readonly SceneTreeNode[]): Map<string, ZSlot> {
  const out = new Map<string, ZSlot>();
  const counters = new Map<string, number>();
  let rank = 0;
  const walk = (nodes: readonly SceneTreeNode[], bucket: string) => {
    for (const node of nodes) {
      let childBucket = bucket;
      if (node.id) {
        const key = elementKey(node.id);
        const siblingIndex = counters.get(bucket) ?? 0;
        counters.set(bucket, siblingIndex + 1);
        out.set(key, { bucket, siblingIndex, rank: rank++ });
        childBucket = key;
      }
      if (node.children) walk(node.children, childBucket);
    }
  };
  roots.forEach((root, i) => walk([root], `spread:${i}`));
  return out;
}

/**
 * Order a multi-selection so its RELATIVE stacking order survives the
 * move — Illustrator's rule, and the only reason this is not a plain
 * `forEach`.
 *
 * Two independent parts:
 *
 *  · APPLY SEQUENCE. Each op is read-modify-write against the list as
 *    the previous op left it, so the order the ops go out in decides
 *    the result. Bring to front and Send backward walk BACK-TO-FRONT;
 *    Send to back and Bring forward walk FRONT-TO-BACK. Reverse either
 *    and the selection comes out mirrored: with `[A,B,C]` all selected,
 *    Bring to front applied front-to-back lands `[C,B,A]`.
 *
 *  · BLOCKING, for the two single-step verbs only. The run of selected
 *    items already sitting AT the destination end of its sibling list
 *    cannot step further — the only thing beyond it is another selected
 *    item, and swapping those two would reverse them. `[A,B,C]` with
 *    `{A,B}` selected must stay `[A,B,C]` under Send backward, not
 *    become `[B,A,C]`. Front and Back need no blocking: everything
 *    lands at the extreme, and a no-op reorder applies cleanly (the
 *    engine logs an inverse for it, as InDesign does).
 *
 * Ids the scene tree does not carry (a stale selection) keep their
 * selection order at the end of the plan and are never blocked — a
 * partial answer still runs, and the engine gives the honest refusal
 * for an id it cannot resolve.
 */
export function arrangePlan(
  selection: readonly ElementId[],
  slots: Map<string, ZSlot>,
  target: ArrangeTarget,
): ElementId[] {
  const selectedKeys = new Set(selection.map(elementKey));

  // Blocked = the maximal run of selected items occupying the far end
  // of a sibling list, in the direction of travel.
  const blocked = new Set<string>();
  if (target === "forward" || target === "backward") {
    const buckets = new Map<string, Array<{ key: string; index: number }>>();
    for (const [key, slot] of slots) {
      const list = buckets.get(slot.bucket) ?? [];
      list.push({ key, index: slot.siblingIndex });
      buckets.set(slot.bucket, list);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => a.index - b.index);
      const ordered = target === "forward" ? [...list].reverse() : list;
      for (const entry of ordered) {
        if (!selectedKeys.has(entry.key)) break;
        blocked.add(entry.key);
      }
    }
  }

  const ascending = target === "front" || target === "backward";
  return selection
    .map((id, i) => ({ id, i, key: elementKey(id), slot: slots.get(elementKey(id)) }))
    .filter((e) => !blocked.has(e.key))
    .sort((a, b) => {
      // Unknown ids sort last whichever way we walk.
      if (!a.slot || !b.slot) {
        if (a.slot) return -1;
        if (b.slot) return 1;
        return a.i - b.i;
      }
      const delta = ascending
        ? a.slot.rank - b.slot.rank
        : b.slot.rank - a.slot.rank;
      return delta !== 0 ? delta : a.i - b.i;
    })
    .map((e) => e.id);
}

/** The nearest GROUP ancestor of `target` in the scene tree, or null
 *  when the element is not inside a group (or is not in the tree).
 *
 *  PARENTAGE DOOR: `document.tree()` is the only CLICK-FREE parentage
 *  read. `hitTest`'s `groupChain` carries ancestry too but needs a
 *  pointer event, and `elementProperties` exposes no parent member.
 *  The cost is a whole-tree read per invocation — fine at a menu
 *  verb's cadence; a targeted `parentOf(id)` door is the RFI candidate
 *  if it ever bites. */
export function parentGroupOf(
  roots: readonly SceneTreeNode[],
  target: ElementId,
): ElementId | null {
  if (typeof target.id !== "string") return null;
  const targetId = target.id;
  let found: ElementId | null = null;
  const walk = (
    nodes: readonly SceneTreeNode[],
    groups: ElementId[],
  ): boolean => {
    for (const node of nodes) {
      const id = node.id ?? null;
      if (id && typeof id.id === "string" && id.id === targetId) {
        found = groups.length > 0 ? groups[groups.length - 1] : null;
        return true;
      }
      const children = node.children ?? [];
      if (children.length > 0) {
        const nextGroups = id && id.kind === "group" ? [...groups, id] : groups;
        if (walk(children, nextGroups)) return true;
      }
    }
    return false;
  };
  walk(roots, []);
  return found;
}

/** A group node's DIRECT selectable children — the members Ungroup
 *  re-selects after the dissolve. A facade-only read on purpose: the
 *  wire's `requestGroupLeaves` flattens to LEAVES, which would lose a
 *  nested sub-group. */
export function groupMembersOf(
  roots: readonly SceneTreeNode[],
  groupId: string,
): ElementId[] {
  const stack: SceneTreeNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id && node.id.kind === "group" && node.id.id === groupId) {
      return (node.children ?? [])
        .map((c) => c.id)
        .filter((id): id is ElementId => id != null);
    }
    if (node.children) stack.push(...node.children);
  }
  return [];
}

/** A page item — the six kinds that sit on a spread and that delete
 *  and nudge act on. A story range, a table and a table cell are
 *  CONTENT addresses; they have no place on the page to remove or move. */
export type PageItemId = Extract<ElementId, { id: string }>;

const PAGE_ITEM_KINDS: ReadonlySet<string> = new Set([
  "textFrame",
  "rectangle",
  "oval",
  "polygon",
  "graphicLine",
  "group",
]);

export function isPageItem(id: ElementId): id is PageItemId {
  return PAGE_ITEM_KINDS.has(id.kind) && typeof id.id === "string";
}

const KIND_WORDS: Record<string, string> = {
  textFrame: "text frame",
  rectangle: "rectangle",
  oval: "ellipse",
  polygon: "path",
  graphicLine: "line",
  group: "group",
};

/** How a diagnostic names an element: the word a user would use, and
 *  the id the Layers panel shows. */
export function describeElement(id: ElementId): string {
  return `${KIND_WORDS[id.kind] ?? id.kind} ${String((id as { id: unknown }).id)}`;
}

/** One id-bearing node's place in the group structure. */
interface TreePlace {
  node: SceneTreeNode;
  /** The groups enclosing it, OUTERMOST FIRST. Empty at the top level. */
  groups: ElementId[];
}

/** Index every id-bearing node of the scene tree by `elementKey`, with
 *  the chain of groups around it. One walk serves delete and nudge. */
export function treePlaces(
  roots: readonly SceneTreeNode[],
): Map<string, TreePlace> {
  const out = new Map<string, TreePlace>();
  const walk = (nodes: readonly SceneTreeNode[], groups: ElementId[]) => {
    for (const node of nodes) {
      const id = node.id ?? null;
      if (id) out.set(elementKey(id), { node, groups });
      if (node.children) {
        walk(node.children, id && id.kind === "group" ? [...groups, id] : groups);
      }
    }
  };
  walk(roots, []);
  return out;
}

/** What `deletePlan` hands the runner. */
export type DeletePlan =
  | {
      ok: true;
      /** The wire ops, in order. Empty when the selection holds no page
       *  item — an honest no-op. */
      ops: Mutation[];
      /** Every LEAF that will be gone (group members included). */
      removed: PageItemId[];
    }
  | { ok: false; reason: string };

/**
 * Turn a selection into the ONE batch that deletes it.
 *
 *  · A LEAF is a `deleteFrame` (the op takes the bare id).
 *  · A GROUP is a `dissolveGroup` for itself and for every group nested
 *    inside it, OUTERMOST FIRST, then a `deleteFrame` per leaf. Order
 *    matters only in that every dissolve precedes the deletes: a group
 *    whose leaves all go while it still stands is left behind empty
 *    (fact 6).
 *  · A selected item INSIDE a selected group is covered by the group
 *    and emits nothing of its own (the engine would refuse the second
 *    delete of an id that is already gone).
 *  · A selected item inside a group that is NOT selected is REFUSED,
 *    here, before the wire (fact 6). Up to engine 0.64 the engine left
 *    the group holding the wrong members; 0.65 takes one member out
 *    correctly, but taking every member out leaves an empty group, so
 *    the host keeps asking for the whole group or an ungroup first.
 *
 * An id the tree does not carry still gets its op — a stale leaf is
 * the engine's to refuse, in its own words, and a pasted-into child is
 * absent from the tree by design and refused with the reason
 * ("release it before removing").
 *
 *  · A CLIPPING PATH goes with its content (fact 13). `clipContent`
 *    maps a container's key to the nested items the object layer's
 *    index lists for it (`clipContentIndex`); each is released and
 *    removed BEFORE the container, deepest first, so the engine never
 *    sees a delete of a nested item and one undo re-nests every one of
 *    them. Without the map the container is deleted alone, and the
 *    engine (0.65+) takes its content with it; up to 0.64 it popped the
 *    content back out (engine-findings §12).
 */
export function deletePlan(
  selection: readonly ElementId[],
  roots: readonly SceneTreeNode[],
  clipContent: ReadonlyMap<string, readonly PageItemId[]> = new Map(),
): DeletePlan {
  const places = treePlaces(roots);
  const targets: PageItemId[] = [];
  const seen = new Set<string>();
  for (const id of selection) {
    if (!isPageItem(id)) continue;
    const key = elementKey(id);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(id);
  }

  const dissolves: Mutation[] = [];
  const deletes: Mutation[] = [];
  const removed: PageItemId[] = [];
  const unnested = new Set<string>();

  /** Release + remove everything clipped inside `container`, deepest
   *  first. Guarded, so an index that lists an item twice (or a cycle
   *  no engine would allow) cannot emit a second delete. */
  const removeContent = (container: PageItemId) => {
    for (const child of clipContent.get(elementKey(container)) ?? []) {
      const key = elementKey(child);
      if (unnested.has(key)) continue;
      unnested.add(key);
      removeContent(child);
      deletes.push({ op: "releaseFrom", args: { childId: child } });
      deletes.push({ op: "deleteFrame", args: { frameId: child.id } });
      removed.push(child);
    }
  };

  const collect = (node: SceneTreeNode) => {
    const id = node.id;
    if (!id || !isPageItem(id)) return;
    if (id.kind === "group") {
      dissolves.push({ op: "dissolveGroup", args: { groupId: id.id } });
      for (const child of node.children ?? []) collect(child);
    } else {
      removeContent(id);
      removed.push(id);
      deletes.push({ op: "deleteFrame", args: { frameId: id.id } });
    }
  };

  for (const id of targets) {
    const place = places.get(elementKey(id));
    if (!place) {
      // Not in the tree: let the engine answer for it.
      if (id.kind === "group") {
        dissolves.push({ op: "dissolveGroup", args: { groupId: id.id } });
      } else {
        removed.push(id);
        deletes.push({ op: "deleteFrame", args: { frameId: id.id } });
      }
      continue;
    }
    if (place.groups.some((g) => seen.has(elementKey(g)))) continue; // covered.
    const parent = place.groups[place.groups.length - 1];
    if (parent) {
      return {
        ok: false,
        reason:
          `${describeElement(id)} is inside ${describeElement(parent)}. ` +
          "Items are not deleted out of a group one by one here — select " +
          "the whole group, or ungroup first.",
      };
    }
    collect(place.node);
  }

  return { ok: true, ops: [...dissolves, ...deletes], removed };
}

/** A 2×3 affine as the wire carries it: `[a b c d tx ty]`. */
export type Affine = [number, number, number, number, number, number];

/** The step a nudge command stands for, in spread space (y grows
 *  DOWN the page, so "up" is negative). */
export function nudgeDelta(
  direction: NudgeDirection,
  large: boolean,
): [number, number] {
  const step = large ? NUDGE_LARGE_STEP_PT : NUDGE_STEP_PT;
  switch (direction) {
    case "left":
      return [-step, 0];
    case "right":
      return [step, 0];
    case "up":
      return [0, -step];
    case "down":
      return [0, step];
  }
}

/** `transform` moved by `(dx, dy)` in the PARENT's space. The linear
 *  part is untouched, which is the whole point: a rotated frame moves
 *  along the page's axes, not its own. `null` is the engine's identity. */
export function translated(
  transform: readonly number[] | null | undefined,
  dx: number,
  dy: number,
): Affine {
  const [a, b, c, d, tx, ty] = transform ?? [1, 0, 0, 1, 0, 0];
  return [a, b, c, d, tx + dx, ty + dy];
}

/** The page items a nudge moves: the selection without content
 *  addresses, without repeats, and without anything inside a group
 *  that is itself selected — the group's move already carries its
 *  members (fact 8), so moving them as well would move them twice.
 *  `roots` is only needed for that last rule; pass `null` when the
 *  selection holds no group alongside something else. */
export function nudgeTargets(
  selection: readonly ElementId[],
  roots: readonly SceneTreeNode[] | null,
): PageItemId[] {
  const out: PageItemId[] = [];
  const seen = new Set<string>();
  for (const id of selection) {
    if (!isPageItem(id)) continue;
    const key = elementKey(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  if (!roots) return out;
  const places = treePlaces(roots);
  return out.filter((id) => {
    const place = places.get(elementKey(id));
    return !place || !place.groups.some((g) => seen.has(elementKey(g)));
  });
}

/** A group's OWN `ItemTransform`, read off its property snapshot.
 *  `null` is identity; `undefined` means the snapshot does not carry
 *  one (the group is gone, or this is not a group's snapshot). */
export function ownTransformOf(
  props: ElementProperties | null,
): number[] | null | undefined {
  const entry = props?.entries.find((e) => e.path === "frameTransform");
  const value = entry?.value;
  if (!value || value.type !== "transform") return undefined;
  return value.value;
}

/** The three kinds the engine clips BY (fact 10). */
const CLIP_PATH_KINDS: ReadonlySet<string> = new Set([
  "rectangle",
  "oval",
  "polygon",
]);

/** Can this page item be a clipping path — hold pasted-in content? */
export function canClipBy(id: ElementId): id is PageItemId {
  return isPageItem(id) && CLIP_PATH_KINDS.has(id.kind);
}

/** The content a container's object-layer index lists, read off its
 *  property snapshot — or `[]` when it carries no index (fact 11).
 *  Tolerant of anything malformed: an unreadable index is no index. */
export function clipContentOf(props: ElementProperties | null): PageItemId[] {
  for (const entry of props?.entries ?? []) {
    const value = entry.value;
    if (entry.path !== "pluginMetadata" || value?.type !== "pluginMetadata") {
      continue;
    }
    if (value.value.key !== OBJECT_METADATA_KEY || !value.value.value) continue;
    try {
      const parsed = JSON.parse(value.value.value) as {
        data?: { clipContent?: unknown };
      };
      const list = parsed.data?.clipContent;
      if (!Array.isArray(list)) return [];
      return list.filter(
        (id): id is PageItemId =>
          id != null &&
          typeof id === "object" &&
          isPageItem(id as ElementId) &&
          (id as ElementId).kind !== "group",
      );
    } catch {
      return [];
    }
  }
  return [];
}

/** The write that sets (or, for an empty list, clears) a container's
 *  clipping index. It rides the SAME batch as the nesting it describes,
 *  so undo restores both together. */
export function clipIndexMutation(
  container: PageItemId,
  content: readonly PageItemId[],
): Mutation {
  return {
    op: "setPluginMetadata",
    args: {
      elementId: container,
      key: OBJECT_METADATA_KEY,
      value:
        content.length === 0
          ? null
          : JSON.stringify({
              v: 1,
              data: {
                clipContent: content.map((id) => ({ kind: id.kind, id: id.id })),
              },
            }),
    },
  };
}

/** What `clipPlan` hands the runner. */
export type ClipPlan =
  | {
      ok: true;
      /** The ONE batch: a `pasteInto` per content item, back to front,
       *  then the index write. */
      ops: Mutation[];
      /** The topmost selected object — the clipping path. */
      clip: PageItemId;
      /** The rest, back to front. */
      content: PageItemId[];
    }
  | { ok: false; reason: string };

/**
 * Turn a selection into the batch that makes a clipping mask of it.
 *
 * TOPMOST is the renderer's order: layer first (`layerZ`, higher paints
 * later — absent means one layer), then the paint walk of the scene
 * tree (`zSlots` rank). The content is pasted BACK TO FRONT, because
 * the container paints its children in the order they were pasted —
 * so the stack keeps its relative order inside the mask.
 *
 * `existing` is what the clipping path already holds (its index,
 * filtered to what is still nested): pasting more content into a mask
 * keeps the old content listed.
 *
 * Every refusal here is one the engine would make anyway, or a state it
 * cannot express, said in words a user can act on and BEFORE the wire.
 */
export function clipPlan(
  selection: readonly ElementId[],
  roots: readonly SceneTreeNode[],
  options: {
    existing?: readonly PageItemId[];
    layerZ?: ReadonlyMap<string, number>;
  } = {},
): ClipPlan {
  const targets: PageItemId[] = [];
  const seen = new Set<string>();
  for (const id of selection) {
    if (!isPageItem(id)) continue;
    const key = elementKey(id);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(id);
  }
  if (targets.length < 2) {
    return {
      ok: false,
      reason:
        "a clipping mask needs two or more objects — the topmost becomes " +
        "the clipping path and the rest are clipped by it.",
    };
  }

  const places = treePlaces(roots);
  const slots = zSlots(roots);
  for (const id of targets) {
    if (!places.has(elementKey(id))) {
      return {
        ok: false,
        reason:
          `${describeElement(id)} is not a free object on the page (it may ` +
          "already be inside a clipping path).",
      };
    }
  }
  const layerOf = (id: PageItemId) =>
    options.layerZ?.get(elementKey(id)) ?? 0;
  const ordered = [...targets].sort((a, b) => {
    const byLayer = layerOf(a) - layerOf(b);
    if (byLayer !== 0) return byLayer;
    return slots.get(elementKey(a))!.rank - slots.get(elementKey(b))!.rank;
  });
  const clip = ordered[ordered.length - 1];
  const content = ordered.slice(0, -1);

  if (!canClipBy(clip)) {
    return {
      ok: false,
      reason:
        `the topmost object, ${describeElement(clip)}, cannot be a clipping ` +
        "path — the engine clips only by a rectangle, an ellipse or a path. " +
        "Bring one of those to the front of the selection.",
    };
  }
  for (const item of content) {
    if (item.kind === "group") {
      return {
        ok: false,
        reason:
          `${describeElement(item)} cannot be clipped: the engine pastes ` +
          "single objects into a frame, never a group. Ungroup it first.",
      };
    }
    const parent = places.get(elementKey(item))!.groups.at(-1);
    if (parent) {
      return {
        ok: false,
        reason:
          `${describeElement(item)} is inside ${describeElement(parent)}, and ` +
          "the engine cannot paste a grouped object into a frame. Ungroup " +
          "first.",
      };
    }
  }

  const ops: Mutation[] = content.map((childId) => ({
    op: "pasteInto" as const,
    args: { containerId: clip, childId },
  }));
  const kept = (options.existing ?? []).filter(
    (id) => !content.some((c) => elementKey(c) === elementKey(id)),
  );
  ops.push(clipIndexMutation(clip, [...kept, ...content]));
  return { ok: true, ops, clip, content };
}

/** One clipping path and the content Release pops out of it. */
export interface ClipRelease {
  container: PageItemId;
  content: readonly PageItemId[];
}

/**
 * The batch that releases clipping masks (fact 12): every `releaseFrom`
 * first, then a `reorderElement { index }` per released item that puts
 * it directly beneath its clipping path — or beneath the outermost group
 * holding the path — in the order it held inside, then the index clears.
 *
 * The indices are computed by REPLAYING the batch against the spread's
 * list as the engine will hold it at each step: a release appends, an
 * index reorder is remove-then-insert. That replay is the engine's own
 * rule (the Node tier's `applyReorder` model), so an out-of-range index
 * would be the engine's refusal, never a silent clamp.
 */
export function releasePlan(
  releases: readonly ClipRelease[],
  roots: readonly SceneTreeNode[],
): Mutation[] {
  const places = treePlaces(roots);
  const slots = zSlots(roots);
  const lists = new Map<string, string[]>();
  for (const [key, slot] of slots) {
    const list = lists.get(slot.bucket) ?? [];
    list[slot.siblingIndex] = key;
    lists.set(slot.bucket, list);
  }

  const releaseOps: Mutation[] = [];
  const reorderOps: Mutation[] = [];
  const indexOps: Mutation[] = [];
  const anchored: Array<{ anchor: string; bucket: string; child: PageItemId }> =
    [];
  for (const { container, content } of releases) {
    const place = places.get(elementKey(container));
    const anchorId = place?.groups[0] ?? container;
    const anchorSlot = slots.get(elementKey(anchorId));
    for (const child of content) {
      releaseOps.push({ op: "releaseFrom", args: { childId: child } });
      if (anchorSlot) {
        lists.get(anchorSlot.bucket)!.push(elementKey(child));
        anchored.push({
          anchor: elementKey(anchorId),
          bucket: anchorSlot.bucket,
          child,
        });
      }
    }
    indexOps.push(clipIndexMutation(container, []));
  }
  for (const { anchor, bucket, child } of anchored) {
    const list = lists.get(bucket)!;
    list.splice(list.indexOf(elementKey(child)), 1);
    const index = list.indexOf(anchor);
    list.splice(index, 0, elementKey(child));
    reorderOps.push({
      op: "reorderElement",
      args: { elementId: child, to: { index } },
    });
  }
  return [...releaseOps, ...reorderOps, ...indexOps];
}

/** The engine's own sentence for a refused mutation, or null when it
 *  applied. `client.mutate` RESOLVES on a refusal — this is the reply
 *  inspection that fact demands. */
export function refusalOf(reply: WorkerToMain): string | null {
  if (reply.kind !== "mutationFailed") return null;
  const error = reply.payload.error;
  if (error.kind === "notImplemented") return error.details.what;
  if (error.kind === "noDocument") return "no document loaded";
  return `the engine refused the operation (${error.kind})`;
}

/** One mutation, or a BATCH when there are several. A batch is atomic
 *  in the engine (a failing child rolls back the ones before it) and
 *  costs ONE undo step — so a five-object Bring to front is one Cmd+Z,
 *  which is what a DTP user means by it. */
export function asOneMutation(ops: Mutation[]): Mutation {
  return ops.length === 1 ? ops[0] : { op: "batch", args: { ops } };
}

// ------------------------------------------------------------- runners

/** Arrange the current selection. Multi-selection keeps its relative
 *  order — see `arrangePlan`. */
export async function arrangeSelection(
  deps: ObjectCommandDeps,
  target: ArrangeTarget,
): Promise<void> {
  if (blockedByEditContext(deps, "Arrange")) return;
  const selection = [...deps.getSelection()];
  if (selection.length === 0) return;

  let plan = selection;
  try {
    plan = arrangePlan(selection, zSlots(await deps.client.sceneTree()), target);
  } catch {
    // An unreadable tree leaves selection order in place rather than
    // aborting: the single-selection case (the common one) is correct
    // either way, and a multi-selection still moves.
  }
  if (plan.length === 0) return; // every operand was blocked — nothing to do.

  const reply = await deps.client.mutate(
    asOneMutation(
      plan.map((elementId) => ({
        op: "reorderElement" as const,
        args: { elementId, to: target },
      })),
    ),
  );
  const refusal = refusalOf(reply);
  if (refusal) {
    deps.report("error", `Arrange refused: ${refusal}`);
    return;
  }
  await reportLayerLimit(deps);
}

/** Fact 3, surfaced rather than discovered. The z table moved; whether
 *  anything moves ON CANVAS depends on `ItemLayer`, which outranks it.
 *  Best-effort — a failed layers read never turns a successful arrange
 *  into an error. */
async function reportLayerLimit(deps: ObjectCommandDeps): Promise<void> {
  try {
    const layers = await deps.client.layers();
    if (layers.length > 1) {
      deps.report(
        "info",
        `Arrange is within a layer. This document has ${layers.length} layers, ` +
          `and the renderer sorts by layer before stacking order — an item on a ` +
          `higher layer still paints above the one you moved. Move it between ` +
          `layers to change that (InDesign's model).`,
      );
    }
  } catch {
    /* no layers read — the arrange still applied. */
  }
}

/** Wrap the selection (≥ 2 page items — the InDesign floor) in a new
 *  group and select it. */
export async function groupSelection(deps: ObjectCommandDeps): Promise<void> {
  if (blockedByEditContext(deps, "Group")) return;
  const memberIds = [...deps.getSelection()];
  if (memberIds.length < 2) return;

  const reply = await deps.client.mutate({
    op: "createGroup",
    args: { memberIds },
  });
  const refusal = refusalOf(reply);
  if (refusal) {
    deps.report("error", `Group refused: ${refusal}`);
    return;
  }
  // The engine echoes the minted group id, so follow-up verbs (move,
  // Ungroup, Arrange) address the group rather than its members.
  if (reply.kind === "mutationApplied" && reply.payload.createdId) {
    await deps.setSelection([reply.payload.createdId]);
  }
}

/** Dissolve every selected GROUP back into its members and select
 *  those members. A selection holding no group is a no-op. */
export async function ungroupSelection(deps: ObjectCommandDeps): Promise<void> {
  if (blockedByEditContext(deps, "Ungroup")) return;
  const selection = [...deps.getSelection()];
  const groups = selection.filter((id) => id.kind === "group");
  if (groups.length === 0) return;

  // Capture each group's direct members BEFORE the dissolve — the
  // group node vanishes from the tree afterwards.
  let roots: SceneTreeNode[] = [];
  try {
    roots = await deps.client.sceneTree();
  } catch {
    /* no tree — the dissolve still runs, the re-selection is thinner. */
  }
  const members: ElementId[] = [];
  for (const group of groups) {
    members.push(...groupMembersOf(roots, group.id as string));
  }

  const reply = await deps.client.mutate(
    asOneMutation(
      groups.map((group) => ({
        op: "dissolveGroup" as const,
        args: { groupId: group.id as string },
      })),
    ),
  );
  const refusal = refusalOf(reply);
  if (refusal) {
    deps.report("error", `Ungroup refused: ${refusal}`);
    return;
  }
  await deps.setSelection([
    ...selection.filter((id) => id.kind !== "group"),
    ...members,
  ]);
}

/** Climb one level: select the group CONTAINING the selection. Invoke
 *  again to climb another (nested groups cycle upward). Pure
 *  selection — no mutation. */
export async function selectParentGroup(
  deps: ObjectCommandDeps,
): Promise<void> {
  if (blockedByEditContext(deps, "Select parent group")) return;
  const selection = deps.getSelection();
  if (selection.length === 0) return;
  const roots = await deps.client.sceneTree();
  // The FIRST selected element anchors the climb.
  const parent = parentGroupOf(roots, selection[0]);
  if (!parent) return; // already at the top — an honest no-op.
  await deps.setSelection([parent]);
}

/**
 * Delete every selected page item in ONE batch — one undo step brings
 * all of them back, at the z slots they left. Afterwards the selection
 * is empty.
 *
 * Two ways this ends without deleting, each of them reported:
 *
 *  · THE PLAN REFUSES — an item inside a group that is staying
 *    (`deletePlan`).
 *  · THE ENGINE REFUSES — an id it cannot resolve, or an item pasted
 *    into a container ("release it before removing"). A batch is
 *    atomic, so a refusal deletes nothing; the engine's sentence is
 *    surfaced verbatim.
 *
 * Up to engine 0.64 there was a third: the engine accepted a delete
 * below a group and re-seated that group's members (fact 6), so the
 * member tables were read back and a damaging delete undone. 0.65 fixed
 * the renumbering; AC-OBJ-ENGINE-1 turned red on the 0.66 pin and the
 * read-back was removed.
 */
export async function deleteSelection(deps: ObjectCommandDeps): Promise<void> {
  if (blockedByEditContext(deps, "Delete")) return;
  const selection = [...deps.getSelection()];
  if (!selection.some(isPageItem)) return;

  // The tree is not optional here the way it is for Arrange: without
  // it a group cannot be taken apart, and a member of a surviving group
  // cannot be told from a free item.
  let roots: SceneTreeNode[];
  try {
    roots = await deps.client.sceneTree();
  } catch {
    deps.report(
      "error",
      "Delete refused: the document structure could not be read, so " +
        "nothing was removed.",
    );
    return;
  }

  let plan = deletePlan(selection, roots);
  if (!plan.ok) {
    deps.report("error", `Delete refused: ${plan.reason}`);
    return;
  }
  // Fact 13 — a clipping path goes with what it clips. The first plan
  // names every leaf that will go; the index read is only for those that
  // can clip, and a second plan folds their content in. An index that
  // cannot be read is no reason to refuse any more: since engine 0.65 a
  // container's delete takes its content along by itself (up to 0.64 the
  // content popped back out, so this refused).
  const clipPaths = plan.removed.filter(canClipBy);
  if (clipPaths.length > 0) {
    let index = new Map<string, PageItemId[]>();
    try {
      index = await clipContentIndex(deps.client, clipPaths, roots);
    } catch {
      /* the plain plan: the engine removes the content with its container. */
    }
    if (index.size > 0) {
      plan = deletePlan(selection, roots, index);
      if (!plan.ok) {
        deps.report("error", `Delete refused: ${plan.reason}`);
        return;
      }
    }
  }
  if (plan.ops.length === 0) return;

  const reply = await deps.client.mutate(asOneMutation(plan.ops));
  const refusal = refusalOf(reply);
  if (refusal) {
    deps.report("error", `Delete refused: ${refusal}`);
    return;
  }

  // No notice for a deleted image frame any more: up to engine 0.64 undo
  // brought the frame back without its image (engine-findings §11) and
  // the user was told; 0.65 captures the whole node, image included.
  await deps.setSelection([]);
}

/** One selection's worth of pending movement. */
interface PendingNudge {
  deps: ObjectCommandDeps;
  /** The selection the presses were made against, as a key and as ids. */
  key: string;
  selection: ElementId[];
  dx: number;
  dy: number;
}

interface NudgeQueue {
  pending: PendingNudge[];
  draining: Promise<void> | null;
}

/** One queue per ENGINE, not per deps bag: the host rebuilds its deps
 *  on every camera change, and two queues against one document would
 *  interleave exactly the read-modify-write this exists to serialise. */
const NUDGE_QUEUES = new WeakMap<object, NudgeQueue>();

/**
 * Move the selection by one step (`NUDGE_STEP_PT`; `large` is ten of
 * them), as ONE batch and therefore one undo step.
 *
 * SERIALISED, because `moveFrame` and `setGroupTransform` are ABSOLUTE
 * writes: each nudge reads the current transform and writes it back
 * moved. Two presses that both read before either wrote would move the
 * object once. So presses queue behind the one in flight.
 *
 * AND FOLDED, because the engine rebuilds the document per mutation
 * and a key repeats faster than that on a large one: presses that
 * arrive while a batch is in flight are summed into the NEXT batch
 * rather than each waiting its own turn. Without that a held key keeps
 * the object coasting for seconds after it is released. This is input
 * coalescing, not undo coalescing (fact 9): a single press is always
 * exactly one undo step, and a held key is one step per engine round
 * trip — fewer than its presses, each still exactly reversible.
 * Presses fold only with the SAME selection; a selection change in
 * between starts a new batch, so a press never moves what was not
 * selected when it was made.
 */
export function nudgeSelection(
  deps: ObjectCommandDeps,
  direction: NudgeDirection,
  large: boolean,
): Promise<void> {
  if (blockedByEditContext(deps, "Nudge")) return Promise.resolve();
  const selection = [...deps.getSelection()];
  if (!selection.some(isPageItem)) return Promise.resolve();
  const [dx, dy] = nudgeDelta(direction, large);
  const key = selection.map(elementKey).join("|");

  let queue = NUDGE_QUEUES.get(deps.client);
  if (!queue) {
    queue = { pending: [], draining: null };
    NUDGE_QUEUES.set(deps.client, queue);
  }
  const tail = queue.pending[queue.pending.length - 1];
  if (tail && tail.key === key) {
    tail.dx += dx;
    tail.dy += dy;
    tail.deps = deps;
  } else {
    queue.pending.push({ deps, key, selection, dx, dy });
  }
  queue.draining ??= drainNudges(queue);
  return queue.draining;
}

async function drainNudges(queue: NudgeQueue): Promise<void> {
  // Yield once, so the caller has stored this promise before the loop
  // can finish and clear it — a loop with nothing to await would
  // otherwise null `draining` first and leave a settled promise parked
  // there, and no later press would ever start a drain.
  await Promise.resolve();
  try {
    for (
      let next = queue.pending.shift();
      next;
      next = queue.pending.shift()
    ) {
      // Opposite presses can cancel out while they wait.
      if (next.dx === 0 && next.dy === 0) continue;
      await applyNudge(next);
    }
  } catch (err) {
    // A batch that THREW (the worker went away mid-flight — a refusal
    // resolves, and is reported, without getting here) takes the presses
    // behind it down too. Left queued they would run on the next,
    // unrelated key press: a move nobody asked for.
    queue.pending.length = 0;
    throw err;
  } finally {
    queue.draining = null;
  }
}

/** The reads a translation needs — a subset of `CanvasClient`, so a
 *  panel can plan one from the client it already holds. */
export type TranslationClient = Pick<
  CanvasClient,
  "sceneTree" | "elementGeometry" | "elementProperties"
>;

/** What `translationPlan` hands its caller: the ops, or why not. */
export type TranslationPlan =
  | { ok: true; ops: Mutation[] }
  | { ok: false; reason: string };

/**
 * The ops that move `selection` by `(dx, dy)` in spread space, rigidly,
 * for every kind (facts 7, 8 and 13): a leaf rides `moveFrame` (its
 * whole transform, translated), a group `setGroupTransform`, a group's
 * own selected members are not moved twice, and whatever the object
 * layer clipped inside a moving clipping path moves by the same step.
 *
 * Shared by the nudge and by the Transform panel's X / Y, so a typed
 * position and an arrow press are one write path. Reads only; the
 * caller sends the ops (as ONE batch) and reports a refusal.
 */
export async function translationPlan(
  client: TranslationClient,
  selection: readonly ElementId[],
  dx: number,
  dy: number,
): Promise<TranslationPlan> {
  const holdsGroup = selection.some((id) => id.kind === "group");

  let roots: SceneTreeNode[] | null = null;
  if (holdsGroup && selection.length > 1) {
    try {
      roots = await client.sceneTree();
    } catch {
      return {
        ok: false,
        reason:
          "the document structure could not be read, so a group and its " +
          "own members could not be told apart.",
      };
    }
  }
  const targets = nudgeTargets(selection, roots);
  const leaves = targets.filter((id) => id.kind !== "group");
  const groups = targets.filter((id) => id.kind === "group");

  const ops: Mutation[] = [];
  try {
    if (leaves.length > 0) {
      const geometry = await client.elementGeometry(leaves);
      const byKey = new Map(geometry.map((g) => [elementKey(g.id), g]));
      for (const leaf of leaves) {
        const item = byKey.get(elementKey(leaf));
        if (!item) {
          // No geometry is the engine saying this is not a free page
          // item — an anchored frame rides its text, a stale id is
          // gone. There is no transform to write back.
          return {
            ok: false,
            reason:
              `the engine reports no geometry for ${describeElement(leaf)}, ` +
              "so there is no position to move.",
          };
        }
        ops.push({
          op: "moveFrame",
          args: {
            frameId: leaf.id,
            transform: translated(item.itemTransform, dx, dy),
          },
        });
      }
    }
    for (const group of groups) {
      const own = ownTransformOf(await client.elementProperties(group));
      if (own === undefined) {
        return {
          ok: false,
          reason: `${describeElement(group)} is not in the document.`,
        };
      }
      ops.push({
        op: "setGroupTransform",
        args: { groupId: group.id, transform: translated(own, dx, dy) },
      });
    }
    // Fact 13 — what is clipped inside a moving clipping path moves by
    // the same step, or the mask would slide over content that stayed.
    // A group's `setGroupTransform` rebases its MEMBERS, and nested
    // content is no member, so clipping paths inside a group count too.
    if (groups.length > 0) roots ??= await client.sceneTree();
    const containers = [
      ...leaves.filter(canClipBy),
      ...clipPathsInside(groups, roots),
    ];
    if (containers.length > 0) {
      const index = await clipContentIndex(client, containers, roots);
      const moving = new Set(leaves.map(elementKey));
      const content = clippedContent(index, containers).filter(
        (id) => !moving.has(elementKey(id)),
      );
      if (content.length > 0) {
        for (const item of await client.elementGeometry(content)) {
          if (!isPageItem(item.id)) continue;
          ops.push({
            op: "moveFrame",
            args: {
              frameId: item.id.id,
              transform: translated(item.itemTransform, dx, dy),
            },
          });
        }
      }
    }
  } catch (err) {
    return {
      ok: false,
      reason:
        "the selection's position could not be read " +
        `(${err instanceof Error ? err.message : String(err)}).`,
    };
  }
  return { ok: true, ops };
}

/** One batch: read each target's transform, write it back moved. */
async function applyNudge(nudge: PendingNudge): Promise<void> {
  const { deps, selection, dx, dy } = nudge;
  const plan = await translationPlan(deps.client, selection, dx, dy);
  if (!plan.ok) {
    deps.report("error", `Nudge refused: ${plan.reason}`);
    return;
  }
  if (plan.ops.length === 0) return;

  const refusal = refusalOf(await deps.client.mutate(asOneMutation(plan.ops)));
  if (refusal) {
    deps.report("error", `Nudge refused: ${refusal}`);
    return;
  }
  try {
    await deps.refreshSelectionGeometry();
  } catch {
    /* geometry is selection CHROME — its absence never fails the move. */
  }
}

// ------------------------------------------------------ clipping masks

/** Every clipping-path-kind leaf inside `groups`, at any depth. */
function clipPathsInside(
  groups: readonly PageItemId[],
  roots: readonly SceneTreeNode[] | null,
): PageItemId[] {
  if (!roots || groups.length === 0) return [];
  const places = treePlaces(roots);
  const out: PageItemId[] = [];
  const walk = (node: SceneTreeNode) => {
    for (const child of node.children ?? []) {
      if (child.id && canClipBy(child.id)) out.push(child.id);
      walk(child);
    }
  };
  for (const group of groups) {
    const place = places.get(elementKey(group));
    if (place) walk(place.node);
  }
  return out;
}

/** Everything `index` says is clipped inside `containers`, at any
 *  depth (a clipping path can itself be content), each item once. */
export function clippedContent(
  index: ReadonlyMap<string, readonly PageItemId[]>,
  containers: readonly PageItemId[],
): PageItemId[] {
  const out: PageItemId[] = [];
  const seen = new Set<string>();
  const visit = (container: PageItemId) => {
    for (const child of index.get(elementKey(container)) ?? []) {
      const key = elementKey(child);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(child);
      visit(child);
    }
  };
  containers.forEach(visit);
  return out;
}

/**
 * Read the object layer's clipping index for `candidates` and every
 * clipping path nested inside them (fact 11), keyed by container.
 *
 * An index entry counts only while it is STILL NESTED: absent from the
 * scene tree (a nested item is the one thing the tree never lists) and
 * still answering `elementGeometry` (it exists). Anything else — an item
 * a script released, one that no longer exists — is dropped here, so a
 * stale index can never put a `releaseFrom` the engine would refuse into
 * a batch that would then roll back whole.
 *
 * Reads the tree only when some container actually lists content, so a
 * nudge of a plain rectangle costs one property read and nothing more.
 * Throws when a read fails; each caller decides what that means.
 */
async function clipContentIndex(
  client: TranslationClient,
  candidates: readonly PageItemId[],
  roots: readonly SceneTreeNode[] | null,
): Promise<Map<string, PageItemId[]>> {
  const out = new Map<string, PageItemId[]>();
  let inTree: Set<string> | null = roots ? new Set(treePlaces(roots).keys()) : null;
  const queue = candidates.filter(canClipBy);
  const visited = new Set<string>();
  for (let container = queue.shift(); container; container = queue.shift()) {
    const key = elementKey(container);
    if (visited.has(key)) continue;
    visited.add(key);
    const listed = clipContentOf(await client.elementProperties(container));
    if (listed.length === 0) continue;
    inTree ??= new Set(treePlaces(await client.sceneTree()).keys());
    const hidden = listed.filter((id) => !inTree!.has(elementKey(id)));
    if (hidden.length === 0) continue;
    const exists = new Set(
      (await client.elementGeometry(hidden)).map((g) => elementKey(g.id)),
    );
    const nested = hidden.filter((id) => exists.has(elementKey(id)));
    if (nested.length === 0) continue;
    out.set(key, nested);
    queue.push(...nested.filter(canClipBy));
  }
  return out;
}

/** Each selected item's LAYER position, when the document has more
 *  than one layer — the renderer sorts by layer before stacking order
 *  (fact 3), so "topmost" means topmost layer first. `undefined` when
 *  there is one layer or the reads fail: stacking order alone decides. */
async function layerPositions(
  deps: ObjectCommandDeps,
  selection: readonly ElementId[],
): Promise<Map<string, number> | undefined> {
  try {
    const layers = await deps.client.layers();
    if (layers.length < 2) return undefined;
    // `z == 0` is the BACKMOST layer (the wire's own LayerSummary doc).
    const zOf = new Map(layers.map((l) => [l.selfId, l.z]));
    const out = new Map<string, number>();
    for (const id of selection.filter(isPageItem)) {
      const entry = (await deps.client.elementProperties(id))?.entries.find(
        (e) => e.path === "itemLayer",
      );
      const layer = entry?.value?.type === "text" ? entry.value.value : null;
      out.set(elementKey(id), (layer != null ? zOf.get(layer) : undefined) ?? 0);
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Make clipping mask — Illustrator's rule: the TOPMOST selected object
 * becomes the clipping path and the rest its content, in ONE batch and
 * so one undo step. Afterwards the clipping path is selected (the
 * content is invisible to selection while nested — fact 11).
 *
 * Refused, with the reason, before the wire: fewer than two objects, a
 * topmost object that cannot clip, a group or a grouped object as
 * content (`clipPlan`). Refused by the engine, verbatim: anything else
 * (two spreads, a stale id) — the batch is atomic, so nothing is half
 * clipped.
 */
export async function makeClippingMask(deps: ObjectCommandDeps): Promise<void> {
  if (blockedByEditContext(deps, "Make clipping mask")) return;
  const selection = [...deps.getSelection()];
  if (!selection.some(isPageItem)) return;

  let roots: SceneTreeNode[];
  try {
    roots = await deps.client.sceneTree();
  } catch {
    deps.report(
      "error",
      "Make clipping mask refused: the document structure could not be " +
        "read, so the topmost object could not be found.",
    );
    return;
  }
  const layerZ = await layerPositions(deps, selection);
  let plan = clipPlan(selection, roots, { layerZ });
  if (!plan.ok) {
    deps.report("error", `Make clipping mask refused: ${plan.reason}`);
    return;
  }
  // A clipping path that already holds content keeps it listed.
  const clip = plan.clip;
  let existing: PageItemId[];
  try {
    existing =
      (await clipContentIndex(deps.client, [clip], roots)).get(elementKey(clip)) ??
      [];
  } catch {
    deps.report(
      "error",
      `Make clipping mask refused: what ${describeElement(clip)} already ` +
        "clips could not be read, so its index would have been lost.",
    );
    return;
  }
  if (existing.length > 0) {
    plan = clipPlan(selection, roots, { layerZ, existing });
    if (!plan.ok) {
      deps.report("error", `Make clipping mask refused: ${plan.reason}`);
      return;
    }
  }

  const reply = await deps.client.mutate(asOneMutation(plan.ops));
  const refusal = refusalOf(reply);
  if (refusal) {
    deps.report("error", `Make clipping mask refused: ${refusal}`);
    return;
  }
  await deps.setSelection([plan.clip]);
}

/**
 * Release clipping mask — pop the content out of every selected
 * clipping path, in ONE batch and one undo step, each item landing
 * directly beneath its clipping path in the order it held inside
 * (`releasePlan`). Afterwards the released content and the former
 * clipping paths are selected, as Illustrator leaves them.
 *
 * Finds the content through the object layer's own index (fact 11).
 * A clipping path with no index — content pasted in by InDesign, a
 * script or a plugin — is reported, not guessed at: nothing on the wire
 * lists what is inside a frame (engine-findings §15).
 */
export async function releaseClippingMask(
  deps: ObjectCommandDeps,
): Promise<void> {
  if (blockedByEditContext(deps, "Release clipping mask")) return;
  const selection = [...deps.getSelection()];
  if (!selection.some(isPageItem)) return;
  const containers: PageItemId[] = [];
  const seen = new Set<string>();
  for (const id of selection) {
    if (!canClipBy(id) || seen.has(elementKey(id))) continue;
    seen.add(elementKey(id));
    containers.push(id);
  }
  if (containers.length === 0) {
    deps.report(
      "error",
      "Release clipping mask refused: select a clipping path — a " +
        "rectangle, an ellipse or a path that holds clipped content.",
    );
    return;
  }

  let roots: SceneTreeNode[];
  let index: Map<string, PageItemId[]>;
  try {
    roots = await deps.client.sceneTree();
    index = await clipContentIndex(deps.client, containers, roots);
  } catch {
    deps.report(
      "error",
      "Release clipping mask refused: what the selection clips could not " +
        "be read, so nothing was released.",
    );
    return;
  }
  const releases: ClipRelease[] = [];
  const empty: PageItemId[] = [];
  for (const container of containers) {
    const content = index.get(elementKey(container));
    if (content && content.length > 0) releases.push({ container, content });
    else empty.push(container);
  }
  const noIndex = (ids: PageItemId[]) =>
    `${ids.map(describeElement).join(", ")} ${ids.length === 1 ? "holds" : "hold"} ` +
    "no content this editor clipped. Content pasted in elsewhere — by " +
    "InDesign, a script or a plugin — cannot be found: the engine has no " +
    "read that lists what is inside a frame.";
  if (releases.length === 0) {
    deps.report("error", `Release clipping mask refused: ${noIndex(empty)}`);
    return;
  }

  const reply = await deps.client.mutate(
    asOneMutation(releasePlan(releases, roots)),
  );
  const refusal = refusalOf(reply);
  if (refusal) {
    deps.report("error", `Release clipping mask refused: ${refusal}`);
    return;
  }
  await deps.setSelection([
    ...releases.flatMap((r) => r.content),
    ...releases.map((r) => r.container),
  ]);
  if (empty.length > 0) {
    deps.report("info", `Released what could be found; ${noIndex(empty)}`);
  }
}

// ------------------------------------------------------------ commands

/** Build the object command set. `handlers` is the bag of closures
 *  owned by `CanvasAppIntegration` — the same shape `buildAppCommands`
 *  takes, so both register through one path. */
/**
 * ADR 024 — the first seven arrange PAGE ITEMS, so they do not apply while
 * the user is inside a plugin content type. Declared here so the menu
 * and palette GREY them rather than offering a click that reports a
 * refusal; the runner guard stays as well, because a shortcut reaches
 * the handler with no menu in between and a menu can be open across a
 * context change.
 *
 * The predicate reads the handle every command handler already
 * receives. It could not be written before `PagedEditor.editContext`
 * existed — which is why `when` was declared on five contribution
 * types and honoured by one: there was nothing useful to ask.
 */
const notInsideAnEditContext = (state: unknown): boolean =>
  !(state as { editContext?: unknown } | null)?.editContext;

/** The slices of `PagedEditor` the delete + nudge guards read. Read
 *  structurally (every member optional) so the predicates stay total
 *  against a partial handle — a standalone mount, a test. */
interface KeyOwnerState {
  editContext?: unknown;
  contentSelection?: { contentSelection?: unknown } | null;
  selection?: { pathEditMode?: boolean } | null;
  tool?: { effectiveTool?: string } | null;
  overlaySignals?: { toolPreview?: unknown; marqueeRect?: unknown } | null;
}

/**
 * Delete and nudge act on the OBJECT. They do not apply while the user
 * is working INSIDE one, where the same keys mean something else:
 *
 *  · inside a plugin edit context (a modal session is one) — the first
 *    seven verbs' rule, and the context's own `onContentKey` gets
 *    Backspace;
 *  · with a text caret — Backspace deletes a character and the arrows
 *    move the caret (`useTextEditing`), and that listener does not stop
 *    Backspace from propagating, so without this the frame would go
 *    with the character;
 *  · in path-edit mode — Backspace removes the selected ANCHOR
 *    (`usePathEditMode`).
 *
 * On the COMMAND and the MENU ITEM as well as the keys, so the menu
 * greys and the palette hides where the keys go quiet: "Delete" on the
 * Object menu while typing would be a verb aimed at a different thing
 * than the one the user is looking at.
 */
export const objectVerbApplies = (state: unknown): boolean => {
  const s = state as KeyOwnerState | null;
  return (
    notInsideAnEditContext(s) &&
    s?.contentSelection?.contentSelection == null &&
    !s?.selection?.pathEditMode
  );
};

/** The Page tool's id (`@paged-media/tools`), spelled here rather than
 *  imported: this module stays type-only so its pure half runs in Node. */
const PAGE_TOOL_ID = "paged.tool.page";

/**
 * The Backspace/Delete KEYS, on top of `objectVerbApplies`: while the
 * Page tool is in hand those keys delete the armed PAGE (its `onKey`),
 * and one press must not take a page and the selected frames with it.
 * Keys only — choosing Object ▸ Delete from the menu with the Page tool
 * active is unambiguous and still runs.
 */
export const deleteKeyApplies = (state: unknown): boolean =>
  objectVerbApplies(state) &&
  (state as KeyOwnerState | null)?.tool?.effectiveTool !== PAGE_TOOL_ID;

/**
 * The ARROW keys, on top of `objectVerbApplies`: while a tool is
 * drawing (the rubber band is up) or a marquee is open, the arrows
 * belong to that drag — the Rectangle tool grids its frame with them,
 * and says so ("the selection doesn't nudge while we gridify").
 */
export const nudgeKeyApplies = (state: unknown): boolean => {
  const signals = (state as KeyOwnerState | null)?.overlaySignals;
  return (
    objectVerbApplies(state) &&
    signals?.toolPreview == null &&
    signals?.marqueeRect == null
  );
};

/** The eight nudge commands, as data: id, title, direction, step. */
const NUDGE_COMMANDS: ReadonlyArray<{
  id: string;
  title: string;
  direction: NudgeDirection;
  large: boolean;
}> = [
  { id: PAGED_OBJECT_NUDGE_LEFT, title: "Nudge left", direction: "left", large: false },
  { id: PAGED_OBJECT_NUDGE_RIGHT, title: "Nudge right", direction: "right", large: false },
  { id: PAGED_OBJECT_NUDGE_UP, title: "Nudge up", direction: "up", large: false },
  { id: PAGED_OBJECT_NUDGE_DOWN, title: "Nudge down", direction: "down", large: false },
  { id: PAGED_OBJECT_NUDGE_LEFT_LARGE, title: "Nudge left ×10", direction: "left", large: true },
  { id: PAGED_OBJECT_NUDGE_RIGHT_LARGE, title: "Nudge right ×10", direction: "right", large: true },
  { id: PAGED_OBJECT_NUDGE_UP_LARGE, title: "Nudge up ×10", direction: "up", large: true },
  { id: PAGED_OBJECT_NUDGE_DOWN_LARGE, title: "Nudge down ×10", direction: "down", large: true },
];

export function buildObjectCommands(
  handlers: ObjectCommandHandlers,
): CommandContribution[] {
  return [
    {
      id: PAGED_OBJECT_BRING_TO_FRONT,
      title: "Bring to front",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.bringToFront(),
    },
    {
      id: PAGED_OBJECT_BRING_FORWARD,
      title: "Bring forward",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.bringForward(),
    },
    {
      id: PAGED_OBJECT_SEND_BACKWARD,
      title: "Send backward",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.sendBackward(),
    },
    {
      id: PAGED_OBJECT_SEND_TO_BACK,
      title: "Send to back",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.sendToBack(),
    },
    {
      id: PAGED_OBJECT_GROUP,
      title: "Group",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.group(),
    },
    {
      id: PAGED_OBJECT_UNGROUP,
      title: "Ungroup",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.ungroup(),
    },
    {
      id: PAGED_OBJECT_SELECT_PARENT_GROUP,
      title: "Select parent group",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.selectParentGroup(),
    },
    {
      id: PAGED_OBJECT_DELETE,
      title: "Delete",
      category: "Object",
      when: objectVerbApplies,
      handler: () => handlers.delete(),
    },
    ...NUDGE_COMMANDS.map(
      ({ id, title, direction, large }): CommandContribution => ({
        id,
        title,
        category: "Object",
        when: objectVerbApplies,
        handler: () => handlers.nudge(direction, large),
      }),
    ),
    {
      id: PAGED_OBJECT_MAKE_CLIPPING_MASK,
      title: "Make clipping mask",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.makeClippingMask(),
    },
    {
      id: PAGED_OBJECT_RELEASE_CLIPPING_MASK,
      title: "Release clipping mask",
      category: "Object",
      when: notInsideAnEditContext,
      handler: () => handlers.releaseClippingMask(),
    },
  ];
}

/** Menu projection. The Object menu already had its slot in the kit's
 *  nine-menu line and its `Arrange` / `Group` rows as DISABLED seams
 *  (`cockpit-menus.ts`); those two are deleted by this change, which
 *  is the honest-stub convention doing its job — a seam lights up when
 *  its backing lands. Titles are sentence case, per the brand content
 *  rules the rest of the menu follows. */
/** D1 — the MENU items carry the same `when` their COMMANDS do.
 *
 *  Every `paged.object.*` command already declared
 *  `when: notInsideAnEditContext`, and the menu entries declared
 *  nothing — so inside a plugin edit context the menu rendered them
 *  ENABLED, the user clicked, `CommandRegistry.invoke` checked the
 *  predicate and returned undefined, and nothing happened with no
 *  feedback whatsoever. The INSERT items got this right from the start
 *  (`when: insertApplies` on every entry); these did not.
 *
 *  A false `when` greys WITHOUT a "soon" badge, which is the distinction
 *  MenuBar draws deliberately: `disabled` means the feature does not
 *  exist yet, a false `when` means it does not apply where you are
 *  standing. The second is exactly the fact a user inside a vector
 *  graphic needs told about Group and Send to back.
 */
export const OBJECT_MENU_ITEMS: MenuItemContribution[] = [
  {
    path: "Object/Bring to front",
    command: PAGED_OBJECT_BRING_TO_FRONT,
    order: 11,
    group: "arrange",
    when: notInsideAnEditContext,
  },
  {
    path: "Object/Bring forward",
    command: PAGED_OBJECT_BRING_FORWARD,
    order: 12,
    group: "arrange",
    when: notInsideAnEditContext,
  },
  {
    path: "Object/Send backward",
    command: PAGED_OBJECT_SEND_BACKWARD,
    order: 13,
    group: "arrange",
    when: notInsideAnEditContext,
  },
  {
    path: "Object/Send to back",
    command: PAGED_OBJECT_SEND_TO_BACK,
    order: 14,
    group: "arrange",
    when: notInsideAnEditContext,
  },
  {
    path: "Object/Group",
    command: PAGED_OBJECT_GROUP,
    order: 20,
    group: "group",
    when: notInsideAnEditContext,
  },
  {
    path: "Object/Ungroup",
    command: PAGED_OBJECT_UNGROUP,
    order: 21,
    group: "group",
    when: notInsideAnEditContext,
  },
  {
    path: "Object/Select parent group",
    command: PAGED_OBJECT_SELECT_PARENT_GROUP,
    order: 22,
    group: "group",
    when: notInsideAnEditContext,
  },
  // The four single-step nudges. The ×10 four are reachable by key and
  // palette only ("Nudge left ×10") — eight rows of arrows would bury
  // the rest of the menu.
  //
  // ORDERS 23–27, and not the round 30/40 that would have been the
  // obvious next band: the menu is sorted by `order` alone, and 30–33
  // are already taken on this menu (the plugin-insert fallbacks, the
  // `Effects…` seam, paged.draw's rows on the tens). Sharing a number
  // with them shuffled these rows between "Insert web frame…" and
  // "Insert spreadsheet…".
  {
    path: "Object/Nudge left",
    command: PAGED_OBJECT_NUDGE_LEFT,
    order: 23,
    group: "nudge",
    when: objectVerbApplies,
  },
  {
    path: "Object/Nudge right",
    command: PAGED_OBJECT_NUDGE_RIGHT,
    order: 24,
    group: "nudge",
    when: objectVerbApplies,
  },
  {
    path: "Object/Nudge up",
    command: PAGED_OBJECT_NUDGE_UP,
    order: 25,
    group: "nudge",
    when: objectVerbApplies,
  },
  {
    path: "Object/Nudge down",
    command: PAGED_OBJECT_NUDGE_DOWN,
    order: 26,
    group: "nudge",
    when: objectVerbApplies,
  },
  // In a group of its own: the one destructive row should not sit a
  // pixel away from its neighbours.
  {
    path: "Object/Delete",
    command: PAGED_OBJECT_DELETE,
    order: 27,
    group: "delete",
    when: objectVerbApplies,
  },
  // 28–29: the last free pair below the 30s (see the nudge note above).
  {
    path: "Object/Make clipping mask",
    command: PAGED_OBJECT_MAKE_CLIPPING_MASK,
    order: 28,
    group: "clip",
    when: notInsideAnEditContext,
  },
  {
    path: "Object/Release clipping mask",
    command: PAGED_OBJECT_RELEASE_CLIPPING_MASK,
    order: 29,
    group: "clip",
    when: notInsideAnEditContext,
  },
];

/** Both `cmd` (macOS) and `ctrl` (Linux/Windows) variants register, the
 *  convention `APP_KEYBINDINGS` already follows.
 *
 *  THE BRACKET PAIR NEEDS FOUR ENTRIES, not two. `eventMatches`
 *  compares `event.key`, and `event.key` for Shift+`]` on a US layout
 *  is `}` — so a lone `cmd+shift+]` would parse a combo no keystroke
 *  can produce. Registering the shifted glyph AS WELL covers both the
 *  layouts that transform it and those that don't. Each entry is a
 *  distinct key→command signature, so INV-REG-3 stays satisfied.
 *
 *  THE CLIPPING-MASK PAIR HAS NO KEYS, deliberately. Illustrator's are
 *  Cmd+7 and Cmd+Alt+7. The second cannot be matched here: Option
 *  rewrites `event.key` on macOS to a LAYOUT-dependent glyph ("¶" on a
 *  US layout, "|" on a German one), so unlike the bracket pair there is
 *  no second spelling to register. And Cmd/Ctrl+7 is the browser's
 *  switch-to-tab-7 chord. Half a pair on a contested chord is worse
 *  than none; both verbs are on the Object menu and in the palette. */
export const OBJECT_KEYBINDINGS: KeybindingContribution[] = [
  { key: "cmd+shift+]", command: PAGED_OBJECT_BRING_TO_FRONT },
  { key: "ctrl+shift+]", command: PAGED_OBJECT_BRING_TO_FRONT },
  { key: "cmd+shift+}", command: PAGED_OBJECT_BRING_TO_FRONT },
  { key: "ctrl+shift+}", command: PAGED_OBJECT_BRING_TO_FRONT },
  { key: "cmd+]", command: PAGED_OBJECT_BRING_FORWARD },
  { key: "ctrl+]", command: PAGED_OBJECT_BRING_FORWARD },
  { key: "cmd+[", command: PAGED_OBJECT_SEND_BACKWARD },
  { key: "ctrl+[", command: PAGED_OBJECT_SEND_BACKWARD },
  { key: "cmd+shift+[", command: PAGED_OBJECT_SEND_TO_BACK },
  { key: "ctrl+shift+[", command: PAGED_OBJECT_SEND_TO_BACK },
  { key: "cmd+shift+{", command: PAGED_OBJECT_SEND_TO_BACK },
  { key: "ctrl+shift+{", command: PAGED_OBJECT_SEND_TO_BACK },
  { key: "cmd+g", command: PAGED_OBJECT_GROUP },
  { key: "ctrl+g", command: PAGED_OBJECT_GROUP },
  { key: "cmd+shift+g", command: PAGED_OBJECT_UNGROUP },
  { key: "ctrl+shift+g", command: PAGED_OBJECT_UNGROUP },
  // Bare keys, so each carries a `when`: who owns the key is a fact
  // about where the user is (`deleteKeyApplies` / `nudgeKeyApplies`).
  // Which WIDGET has focus is the registry's question, not a
  // predicate's — a `when` sees state, not the event — and it answers
  // it for these keys in `targetOwnsKey`.
  { key: "backspace", command: PAGED_OBJECT_DELETE, when: deleteKeyApplies },
  { key: "delete", command: PAGED_OBJECT_DELETE, when: deleteKeyApplies },
  { key: "arrowleft", command: PAGED_OBJECT_NUDGE_LEFT, when: nudgeKeyApplies },
  { key: "arrowright", command: PAGED_OBJECT_NUDGE_RIGHT, when: nudgeKeyApplies },
  { key: "arrowup", command: PAGED_OBJECT_NUDGE_UP, when: nudgeKeyApplies },
  { key: "arrowdown", command: PAGED_OBJECT_NUDGE_DOWN, when: nudgeKeyApplies },
  {
    key: "shift+arrowleft",
    command: PAGED_OBJECT_NUDGE_LEFT_LARGE,
    when: nudgeKeyApplies,
  },
  {
    key: "shift+arrowright",
    command: PAGED_OBJECT_NUDGE_RIGHT_LARGE,
    when: nudgeKeyApplies,
  },
  {
    key: "shift+arrowup",
    command: PAGED_OBJECT_NUDGE_UP_LARGE,
    when: nudgeKeyApplies,
  },
  {
    key: "shift+arrowdown",
    command: PAGED_OBJECT_NUDGE_DOWN_LARGE,
    when: nudgeKeyApplies,
  },
];
