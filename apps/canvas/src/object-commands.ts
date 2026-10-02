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
//  6. `deleteFrame` DOES NOT RENUMBER GROUP MEMBER TABLES. A group
//     holds its members as indices into those leaf lists, and removing
//     a leaf shifts every later index of that kind — in the z table,
//     but not in any group. So deleting one member of a group, or any
//     OLDER item of the same kind on the spread, leaves a surviving
//     group pointing at its neighbours: `[A,B]` becomes `[B,C]`, A
//     falls out and an unrelated C is pulled in. The engine reports
//     success. See `deletePlan` (the member case is refused before the
//     wire) and `deleteSelection` (the bystander case is detected and
//     undone); docs/engine-findings.md §10 has the reproduction.
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
//     there); and on a line or a pen path it moves the box and leaves
//     the anchors where they were, so nothing repaints at all — a
//     dragged line snaps back (engine-findings §14). For a plain
//     rectangle the two writes paint the same pixels.
//
//     The cost of choosing the transform: readouts that project
//     `frameBounds` (Properties ▸ Bounds, Transform ▸ X/Y) do not move
//     with a nudge, exactly as they do not for a rotated frame's drag.
//     They show the frame's inner box, and the fix for that belongs in
//     the readout (compose the transform), not in a second move path.
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
//     commits a bounds write for an un-rotated frame. So a nudge is one
//     undo step per engine round trip — see `nudgeSelection` for what
//     that means under key repeat.

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
    | "undo"
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

/** Every group's DIRECT children, by key — the member tables as the
 *  scene tree reports them. This is what fact 6 corrupts, so it is what
 *  `deleteSelection` compares before and after. */
export function groupTable(
  roots: readonly SceneTreeNode[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (nodes: readonly SceneTreeNode[]) => {
    for (const node of nodes) {
      if (node.id && node.id.kind === "group") {
        out.set(
          elementKey(node.id),
          (node.children ?? [])
            .map((c) => (c.id ? elementKey(c.id) : ""))
            .filter(Boolean),
        );
      }
      if (node.children) walk(node.children);
    }
  };
  walk(roots);
  return out;
}

/** The first group whose member table differs between `expected` and
 *  what the tree now holds, or null when every expected group is
 *  intact. Groups the tree holds beyond `expected` are not this
 *  function's business. */
export function firstDisturbedGroup(
  expected: ReadonlyMap<string, readonly string[]>,
  actual: ReadonlyMap<string, readonly string[]>,
): string | null {
  for (const [key, members] of expected) {
    const now = actual.get(key);
    if (!now || now.length !== members.length) return key;
    for (let i = 0; i < members.length; i += 1) {
      if (now[i] !== members[i]) return key;
    }
  }
  return null;
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
      /** The member tables that must come out of the delete untouched —
       *  every group the delete does not itself dissolve. */
      survivors: Map<string, string[]>;
    }
  | { ok: false; reason: string };

/**
 * Turn a selection into the ONE batch that deletes it.
 *
 *  · A LEAF is a `deleteFrame` (the op takes the bare id).
 *  · A GROUP is a `dissolveGroup` for itself and for every group nested
 *    inside it, OUTERMOST FIRST, then a `deleteFrame` per leaf. Order
 *    matters only in that every dissolve precedes the deletes: a leaf
 *    removed while its group still stands is exactly fact 6.
 *  · A selected item INSIDE a selected group is covered by the group
 *    and emits nothing of its own (the engine would refuse the second
 *    delete of an id that is already gone).
 *  · A selected item inside a group that is NOT selected is REFUSED,
 *    here, before the wire. The engine would accept it and then leave
 *    the group holding the wrong members — and unlike the bystander
 *    case, undo does not put it right (the member comes back twice).
 *    Refusing is the only safe answer the host has; re-creating the
 *    group around the hole would mint a new id and drop the group's
 *    own transparency.
 *
 * An id the tree does not carry still gets its op — a stale leaf is
 * the engine's to refuse, in its own words, and a pasted-into child is
 * absent from the tree by design and refused with the reason
 * ("release it before removing").
 */
export function deletePlan(
  selection: readonly ElementId[],
  roots: readonly SceneTreeNode[],
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
  const dissolved = new Set<string>();

  const collect = (node: SceneTreeNode) => {
    const id = node.id;
    if (!id || !isPageItem(id)) return;
    if (id.kind === "group") {
      dissolved.add(elementKey(id));
      dissolves.push({ op: "dissolveGroup", args: { groupId: id.id } });
      for (const child of node.children ?? []) collect(child);
    } else {
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
          "The engine cannot take one item out of a group — it leaves the " +
          "group holding the wrong members. Select the whole group, or " +
          "ungroup first.",
      };
    }
    collect(place.node);
  }

  const survivors = new Map<string, string[]>();
  for (const [key, members] of groupTable(roots)) {
    if (!dissolved.has(key)) survivors.set(key, members);
  }
  return { ok: true, ops: [...dissolves, ...deletes], removed, survivors };
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
function asOneMutation(ops: Mutation[]): Mutation {
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
 * Three ways this ends without deleting, each of them reported:
 *
 *  · THE PLAN REFUSES — an item inside a group that is staying
 *    (`deletePlan`).
 *  · THE ENGINE REFUSES — an id it cannot resolve, or an item pasted
 *    into a container ("release it before removing"). A batch is
 *    atomic, so a refusal deletes nothing; the engine's sentence is
 *    surfaced verbatim.
 *  · THE ENGINE ACCEPTS AND DAMAGES A BYSTANDER (fact 6). The member
 *    tables of every surviving group are read back and compared; on a
 *    difference the delete is undone, and the redo entry that undo
 *    leaves behind is dropped by an empty batch (any applied mutation
 *    clears the redo log, and an empty batch is the one that changes
 *    nothing). The price is one inert undo step, which is the cheaper
 *    thing to leave in the log than a Redo that re-breaks the group.
 *    Remove this branch when core renumbers member tables on remove —
 *    AC-OBJ-ENGINE-1 turns red that day.
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

  const plan = deletePlan(selection, roots);
  if (!plan.ok) {
    deps.report("error", `Delete refused: ${plan.reason}`);
    return;
  }
  if (plan.ops.length === 0) return;

  // Which of the leaves carry a placed image — asked BEFORE they are
  // gone, for the notice below.
  let withImage = 0;
  try {
    const geometry = await deps.client.elementGeometry(plan.removed);
    withImage = geometry.filter((g) => g.hasImage).length;
  } catch {
    /* the notice is a courtesy; the delete does not wait on it. */
  }

  const reply = await deps.client.mutate(asOneMutation(plan.ops));
  const refusal = refusalOf(reply);
  if (refusal) {
    deps.report("error", `Delete refused: ${refusal}`);
    return;
  }

  if (plan.survivors.size > 0) {
    const disturbed = await disturbedSurvivor(deps, plan.survivors);
    if (disturbed) {
      const restored = await undoDamagingDelete(deps, roots);
      deps.report(
        "error",
        `Delete undone: removing the selection made the engine re-seat the ` +
          `members of ${disturbed.replace(":", " ")} (it does not renumber a ` +
          `group's member table when an older item of the same kind is ` +
          `removed). ` +
          (restored
            ? "The document is back as it was. Ungroup that group to delete " +
              "safely."
            : "The undo did NOT restore the group structure — check the " +
              "Layers panel before saving."),
      );
      return;
    }
  }

  await deps.setSelection([]);
  if (withImage > 0) {
    // The engine's undo record for a removed frame carries its
    // geometry, fill and stroke — not its image (nor its opacity,
    // effects or corners; engine-findings §11). The image is the one
    // loss this layer can detect exactly, and it is CONTENT, so it is
    // the one the user is told about.
    deps.report(
      "info",
      (withImage === 1
        ? "The deleted frame held a placed image. "
        : `${withImage} of the deleted frames held a placed image. `) +
        "Undo brings the frame back empty — this engine version does not " +
        "keep image content in its undo record.",
    );
  }
}

/** The first surviving group whose member table no longer matches, or
 *  null. An unreadable tree answers null: the delete applied, and a
 *  check that could not run is not evidence of damage. */
async function disturbedSurvivor(
  deps: ObjectCommandDeps,
  survivors: ReadonlyMap<string, readonly string[]>,
): Promise<string | null> {
  try {
    return firstDisturbedGroup(
      survivors,
      groupTable(await deps.client.sceneTree()),
    );
  } catch {
    return null;
  }
}

/** Undo the delete that damaged a group and drop its redo entry.
 *  Returns whether the group structure is back to `before`. */
async function undoDamagingDelete(
  deps: ObjectCommandDeps,
  before: readonly SceneTreeNode[],
): Promise<boolean> {
  await deps.client.undo();
  await deps.client.mutate({ op: "batch", args: { ops: [] } });
  try {
    return (
      firstDisturbedGroup(
        groupTable(before),
        groupTable(await deps.client.sceneTree()),
      ) === null
    );
  } catch {
    return false;
  }
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

/** One batch: read each target's transform, write it back moved. */
async function applyNudge(nudge: PendingNudge): Promise<void> {
  const { deps, selection, dx, dy } = nudge;
  const holdsGroup = selection.some((id) => id.kind === "group");

  let roots: SceneTreeNode[] | null = null;
  if (holdsGroup && selection.length > 1) {
    try {
      roots = await deps.client.sceneTree();
    } catch {
      deps.report(
        "error",
        "Nudge refused: the document structure could not be read, so a " +
          "group and its own members could not be told apart.",
      );
      return;
    }
  }
  const targets = nudgeTargets(selection, roots);
  const leaves = targets.filter((id) => id.kind !== "group");
  const groups = targets.filter((id) => id.kind === "group");

  const ops: Mutation[] = [];
  try {
    if (leaves.length > 0) {
      const geometry = await deps.client.elementGeometry(leaves);
      const byKey = new Map(geometry.map((g) => [elementKey(g.id), g]));
      for (const leaf of leaves) {
        const item = byKey.get(elementKey(leaf));
        if (!item) {
          // No geometry is the engine saying this is not a free page
          // item — an anchored frame rides its text, a stale id is
          // gone. There is no transform to write back.
          deps.report(
            "error",
            `Nudge refused: the engine reports no geometry for ` +
              `${describeElement(leaf)}, so there is no position to move.`,
          );
          return;
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
      const own = ownTransformOf(await deps.client.elementProperties(group));
      if (own === undefined) {
        deps.report(
          "error",
          `Nudge refused: ${describeElement(group)} is not in the document.`,
        );
        return;
      }
      ops.push({
        op: "setGroupTransform",
        args: { groupId: group.id, transform: translated(own, dx, dy) },
      });
    }
  } catch (err) {
    deps.report(
      "error",
      `Nudge refused: the selection's position could not be read ` +
        `(${err instanceof Error ? err.message : String(err)}).`,
    );
    return;
  }
  if (ops.length === 0) return;

  const refusal = refusalOf(await deps.client.mutate(asOneMutation(ops)));
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
];

/** Both `cmd` (macOS) and `ctrl` (Linux/Windows) variants register, the
 *  convention `APP_KEYBINDINGS` already follows.
 *
 *  THE BRACKET PAIR NEEDS FOUR ENTRIES, not two. `eventMatches`
 *  compares `event.key`, and `event.key` for Shift+`]` on a US layout
 *  is `}` — so a lone `cmd+shift+]` would parse a combo no keystroke
 *  can produce. Registering the shifted glyph AS WELL covers both the
 *  layouts that transform it and those that don't. Each entry is a
 *  distinct key→command signature, so INV-REG-3 stays satisfied. */
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
