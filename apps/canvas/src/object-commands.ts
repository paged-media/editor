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

import type {
  CommandContribution,
  KeybindingContribution,
  MenuItemContribution,
} from "@paged-media/shell";
import type {
  CanvasClient,
  ElementId,
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

/** Everything the seven verbs need from the app. Supplied by
 *  `CanvasAppIntegration`, which owns the live client + selection. */
export interface ObjectCommandDeps {
  client: Pick<
    CanvasClient,
    "mutate" | "sceneTree" | "setElementSelection" | "elementGeometry" | "layers"
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
}

/**
 * The single guard for all seven verbs. Returns true when the command
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

/** The seven closures a host binds to the seven commands. */
export interface ObjectCommandHandlers {
  bringToFront: () => void | Promise<void>;
  bringForward: () => void | Promise<void>;
  sendBackward: () => void | Promise<void>;
  sendToBack: () => void | Promise<void>;
  group: () => void | Promise<void>;
  ungroup: () => void | Promise<void>;
  selectParentGroup: () => void | Promise<void>;
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

// ------------------------------------------------------------ commands

/** Build the object command set. `handlers` is the bag of closures
 *  owned by `CanvasAppIntegration` — the same shape `buildAppCommands`
 *  takes, so both register through one path. */
/**
 * ADR 024 — these seven arrange PAGE ITEMS, so they do not apply while
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
  ];
}

/** Menu projection. The Object menu already had its slot in the kit's
 *  nine-menu line and its `Arrange` / `Group` rows as DISABLED seams
 *  (`cockpit-menus.ts`); those two are deleted by this change, which
 *  is the honest-stub convention doing its job — a seam lights up when
 *  its backing lands. Titles are sentence case, per the brand content
 *  rules the rest of the menu follows. */
export const OBJECT_MENU_ITEMS: MenuItemContribution[] = [
  {
    path: "Object/Bring to front",
    command: PAGED_OBJECT_BRING_TO_FRONT,
    order: 11,
    group: "arrange",
  },
  {
    path: "Object/Bring forward",
    command: PAGED_OBJECT_BRING_FORWARD,
    order: 12,
    group: "arrange",
  },
  {
    path: "Object/Send backward",
    command: PAGED_OBJECT_SEND_BACKWARD,
    order: 13,
    group: "arrange",
  },
  {
    path: "Object/Send to back",
    command: PAGED_OBJECT_SEND_TO_BACK,
    order: 14,
    group: "arrange",
  },
  {
    path: "Object/Group",
    command: PAGED_OBJECT_GROUP,
    order: 20,
    group: "group",
  },
  {
    path: "Object/Ungroup",
    command: PAGED_OBJECT_UNGROUP,
    order: 21,
    group: "group",
  },
  {
    path: "Object/Select parent group",
    command: PAGED_OBJECT_SELECT_PARENT_GROUP,
    order: 22,
    group: "group",
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
];
