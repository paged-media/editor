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

// `paged.object.*` — the ORDERING ALGEBRA, tested in the open.
//
// These run in Node, not the browser: `object-commands.ts` imports only
// TYPES, so its pure half (`zSlots`, `arrangePlan`, `parentGroupOf`,
// `groupMembersOf`) is directly importable here. The engine half is
// proven against the real wasm in `e2e/object-commands.spec.ts`; this
// tier proves the thing an e2e test can only sample — that a
// multi-selection Arrange comes out in the SAME relative order it went
// in, for every verb and at both boundaries.
//
// `applyReorder` below mirrors core's `apply_reorder_node` exactly
// (`remove(from)` + `insert(to)`, with Front → last, Back → 0,
// Forward → min(from+1,last), Backward → max(from-1,0)). If core's
// verb semantics ever change, the e2e tier catches it and this tier's
// model has to follow — the model is a convenience, never the source.

import { expect, test } from "@playwright/test";

import type {
  ElementId,
  ElementProperties,
  SceneTreeNode,
} from "@paged-media/client";

import {
  arrangePlan,
  arrangeSelection,
  buildObjectCommands,
  canClipBy,
  clipContentOf,
  clipIndexMutation,
  clipPlan,
  clippedContent,
  makeClippingMask,
  OBJECT_KEYBINDINGS,
  OBJECT_MENU_ITEMS,
  OBJECT_METADATA_KEY,
  PAGED_OBJECT_MAKE_CLIPPING_MASK,
  PAGED_OBJECT_RELEASE_CLIPPING_MASK,
  releaseClippingMask,
  releasePlan,
  type ObjectCommandHandlers,
  type PageItemId,
  deleteKeyApplies,
  deletePlan,
  deleteSelection,
  elementKey,
  firstDisturbedGroup,
  groupMembersOf,
  groupSelection,
  groupTable,
  nudgeDelta,
  nudgeKeyApplies,
  nudgeSelection,
  nudgeTargets,
  objectVerbApplies,
  parentGroupOf,
  translated,
  ungroupSelection,
  zSlots,
  type ArrangeTarget,
  type ObjectCommandDeps,
} from "../src/object-commands";
import { targetOwnsKey } from "../../../packages/shell/src/registries/keybinding";

const rect = (id: string): ElementId => ({ kind: "rectangle", id });

const leaf = (id: string): SceneTreeNode => ({
  id: rect(id),
  kind: "Rectangle",
  label: id,
});

const group = (id: string, children: SceneTreeNode[]): SceneTreeNode => ({
  id: { kind: "group", id },
  kind: "Group",
  label: id,
  children,
});

/** A one-spread, one-page tree over `ids` in paint order. */
const spreadOf = (children: SceneTreeNode[]): SceneTreeNode[] => [
  {
    kind: "Spread",
    label: "spread",
    children: [{ kind: "Page", label: "page", children }],
  },
];

/** The engine's own reorder, in miniature — see the header note. */
function applyReorder(
  list: string[],
  plan: readonly ElementId[],
  target: ArrangeTarget,
): string[] {
  const out = [...list];
  for (const id of plan) {
    const key = elementKey(id);
    const from = out.indexOf(key);
    if (from < 0) continue;
    const last = out.length - 1;
    const to =
      target === "front"
        ? last
        : target === "back"
          ? 0
          : target === "forward"
            ? Math.min(from + 1, last)
            : Math.max(from - 1, 0);
    out.splice(from, 1);
    out.splice(to, 0, key);
  }
  return out;
}

/** Run the real planner over a flat back-to-front list and report the
 *  resulting order as plain letters. */
function arrange(
  order: string[],
  selection: string[],
  target: ArrangeTarget,
): string[] {
  const roots = spreadOf(order.map(leaf));
  const plan = arrangePlan(selection.map(rect), zSlots(roots), target);
  return applyReorder(
    order.map((id) => elementKey(rect(id))),
    plan,
    target,
  ).map((k) => k.slice("rectangle:".length));
}

test.describe("paged.object — the arrange ordering algebra", () => {
  test("AC-OBJ-PURE-1 — zSlots reads the engine's stacking model off the tree @feat:layers.z-ordering @level:happy", () => {
    const roots = spreadOf([leaf("a"), group("g", [leaf("x"), leaf("y")]), leaf("b")]);
    const slots = zSlots(roots);

    // Index 0 is BACKMOST, matching `ZOrderTarget::Back => 0`.
    expect(slots.get("rectangle:a")?.siblingIndex).toBe(0);
    expect(slots.get("group:g")?.siblingIndex).toBe(1);
    expect(slots.get("rectangle:b")?.siblingIndex).toBe(2);
    // Top-level items share the SPREAD's list; a group's members are
    // their own list, which is why a reorder cannot leave the group.
    expect(slots.get("rectangle:a")?.bucket).toBe("spread:0");
    expect(slots.get("group:g")?.bucket).toBe("spread:0");
    expect(slots.get("rectangle:x")?.bucket).toBe("group:g");
    expect(slots.get("rectangle:y")?.bucket).toBe("group:g");
    expect(slots.get("rectangle:x")?.siblingIndex).toBe(0);
    expect(slots.get("rectangle:y")?.siblingIndex).toBe(1);
  });

  test("AC-OBJ-PURE-2 — two pages of ONE spread share one stacking list @feat:layers.z-ordering @level:edge", () => {
    // The tree nests Spread → Page → items, but the engine's top-level
    // list is `Spread::frames_in_order`. A selection spanning both
    // pages is ONE sibling list, so the plan must order it as one.
    const roots: SceneTreeNode[] = [
      {
        kind: "Spread",
        label: "spread",
        children: [
          { kind: "Page", label: "left", children: [leaf("a"), leaf("b")] },
          { kind: "Page", label: "right", children: [leaf("c"), leaf("d")] },
        ],
      },
    ];
    const slots = zSlots(roots);
    expect([...slots.values()].map((s) => s.bucket)).toEqual([
      "spread:0",
      "spread:0",
      "spread:0",
      "spread:0",
    ]);
    expect(slots.get("rectangle:c")?.siblingIndex).toBe(2);
    expect(slots.get("rectangle:d")?.siblingIndex).toBe(3);
  });

  test("AC-OBJ-PURE-3 — bring to front keeps the selection's relative order @feat:layers.z-ordering @level:happy", () => {
    expect(arrange(["a", "b", "c", "d", "e"], ["b", "c"], "front")).toEqual([
      "a",
      "d",
      "e",
      "b",
      "c",
    ]);
    // The CLICK order is irrelevant — the plan reads the engine's order.
    expect(arrange(["a", "b", "c", "d", "e"], ["c", "b"], "front")).toEqual([
      "a",
      "d",
      "e",
      "b",
      "c",
    ]);
    // A three-way selection spanning the whole list is a no-op, not a
    // reversal (which is what a naive forEach produces).
    expect(arrange(["a", "b", "c"], ["a", "b", "c"], "front")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("AC-OBJ-PURE-4 — send to back keeps the selection's relative order @feat:layers.z-ordering @level:happy", () => {
    expect(arrange(["a", "b", "c", "d", "e"], ["c", "d"], "back")).toEqual([
      "c",
      "d",
      "a",
      "b",
      "e",
    ]);
    expect(arrange(["a", "b", "c", "d", "e"], ["d", "c"], "back")).toEqual([
      "c",
      "d",
      "a",
      "b",
      "e",
    ]);
    expect(arrange(["a", "b", "c"], ["a", "b", "c"], "back")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("AC-OBJ-PURE-5 — bring forward / send backward step the whole run by one @feat:layers.z-ordering @level:happy", () => {
    // The run {b,c} steps past exactly one unselected neighbour, and
    // stays in order — which is what distinguishes forward from front.
    expect(arrange(["a", "b", "c", "d", "e"], ["b", "c"], "forward")).toEqual([
      "a",
      "d",
      "b",
      "c",
      "e",
    ]);
    expect(arrange(["a", "b", "c", "d", "e"], ["c", "d"], "backward")).toEqual([
      "a",
      "c",
      "d",
      "b",
      "e",
    ]);
    // A non-contiguous selection moves each part one step.
    expect(arrange(["a", "b", "c", "d"], ["a", "c"], "forward")).toEqual([
      "b",
      "a",
      "d",
      "c",
    ]);
  });

  test("AC-OBJ-PURE-6 — the run already AT the end cannot step past itself @feat:layers.z-ordering @level:edge", () => {
    // Without blocking, `backward` on {a,b} swaps two SELECTED items
    // and comes out ["b","a","c"] — the relative order violated at the
    // boundary. Illustrator's rule: the blocked run stays put.
    expect(arrange(["a", "b", "c"], ["a", "b"], "backward")).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(arrange(["a", "b", "c"], ["b", "c"], "forward")).toEqual([
      "a",
      "b",
      "c",
    ]);
    // Only the blocked PREFIX is held — the rest still moves.
    expect(arrange(["a", "b", "c", "d"], ["a", "b", "d"], "backward")).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
  });

  test("AC-OBJ-PURE-7 — a grouped item arranges INSIDE its group @feat:layers.z-ordering @feat:frames-paths.groups @level:edge", () => {
    // `reorderElement` derives the sibling list from where the node
    // already is, so this cannot lift `x` out of `g` — by design.
    const roots = spreadOf([leaf("a"), group("g", [leaf("x"), leaf("y")])]);
    const plan = arrangePlan([rect("x")], zSlots(roots), "front");
    expect(plan.map(elementKey)).toEqual(["rectangle:x"]);
    // Both group members selected: they keep their order within the
    // group, and the top-level list is untouched.
    const both = arrangePlan([rect("y"), rect("x")], zSlots(roots), "front");
    expect(both.map(elementKey)).toEqual(["rectangle:x", "rectangle:y"]);
  });

  test("AC-OBJ-PURE-8 — ids the tree does not carry still run, last @feat:layers.z-ordering @level:edge", () => {
    const roots = spreadOf([leaf("a"), leaf("b")]);
    const plan = arrangePlan(
      [rect("ghost"), rect("a")],
      zSlots(roots),
      "front",
    );
    expect(plan.map(elementKey)).toEqual(["rectangle:a", "rectangle:ghost"]);
  });
});

test.describe("paged.object — the parentage + membership reads", () => {
  const roots = spreadOf([
    group("gOuter", [group("gInner", [leaf("deep")]), leaf("shallow")]),
    leaf("free"),
  ]);

  test("AC-OBJ-PURE-9 — parentGroupOf resolves the NEAREST group ancestor @feat:frames-paths.groups @feat:editor-tools.select.group-descent @level:happy", () => {
    expect(parentGroupOf(roots, rect("deep"))).toEqual({
      kind: "group",
      id: "gInner",
    });
    expect(parentGroupOf(roots, rect("shallow"))).toEqual({
      kind: "group",
      id: "gOuter",
    });
    // Cycling: the inner group's own parent is the outer group.
    expect(parentGroupOf(roots, { kind: "group", id: "gInner" })).toEqual({
      kind: "group",
      id: "gOuter",
    });
    // Top level (or unknown) → null, which the command reads as an
    // honest no-op.
    expect(parentGroupOf(roots, rect("free"))).toBeNull();
    expect(parentGroupOf(roots, { kind: "group", id: "gOuter" })).toBeNull();
    expect(parentGroupOf(roots, rect("ghost"))).toBeNull();
  });

  test("AC-OBJ-PURE-10 — groupMembersOf returns DIRECT children, not leaves @feat:frames-paths.groups @level:happy", () => {
    // `requestGroupLeaves` would flatten `gInner` away; Ungroup must
    // re-select the nested group itself.
    expect(groupMembersOf(roots, "gOuter")).toEqual([
      { kind: "group", id: "gInner" },
      rect("shallow"),
    ]);
    expect(groupMembersOf(roots, "gInner")).toEqual([rect("deep")]);
    expect(groupMembersOf(roots, "nope")).toEqual([]);
  });
});


// ── ADR 024 — the verbs must not reach the document from inside a
//    plugin edit context ────────────────────────────────────────────
//
// THE DEFECT THIS PINS. These seven arrange and group PAGE ITEMS. They
// read the host element selection — which, inside an edit context, IS
// the frame the user entered (the shell selects the scope root on
// entry). So editing a raster image or a spreadsheet and picking
// `Object ▸ Send to back` silently reordered THE FRAME in the
// document, and `Ungroup` on a group-backed plugin object destroyed
// its structure. Live, undimmed, and silent either way.
//
// The assertion that matters is `mutate` NOT being called. A test that
// only checked the report would pass while the mutation still landed.

interface Recorded {
  mutations: number;
  reports: Array<{ severity: string; message: string }>;
}

function depsWith(
  context: { type: string } | null,
  selection: ElementId[] = [rect("a"), rect("b")],
): {
  deps: ObjectCommandDeps;
  rec: Recorded;
} {
  const rec: Recorded = { mutations: 0, reports: [] };
  const deps: ObjectCommandDeps = {
    client: {
      mutate: async () => {
        rec.mutations += 1;
        return {
          kind: "mutationApplied",
          payload: { createdId: null, pageIds: [] },
        } as never;
      },
      // Two FREE rectangles beside the group, so a clipping mask has a
      // selection it can make (grouped items are refused before the wire).
      sceneTree: async () => [
        group("g1", [leaf("a"), leaf("b")]),
        leaf("c"),
        leaf("d"),
      ],
      setElementSelection: async (ids: unknown[]) => ids,
      // Every id answers with an un-transformed frame, so a nudge has a
      // transform to write back (an empty answer is its own refusal).
      elementGeometry: async (ids: ElementId[]) =>
        ids.map((id) => ({
          id,
          bounds: [0, 0, 10, 10],
          itemTransform: null,
          hasImage: false,
        })),
      layers: async () => [],
      // `d` is a clipping path whose index lists `n` — nested, so absent
      // from the tree above — giving Release something to release.
      elementProperties: async (id: ElementId) =>
        id.kind === "rectangle" && id.id === "d"
          ? clipIndexed(id, [rect("n")])
          : null,
      undo: async () => ({ kind: "undoApplied", payload: {} }) as never,
    } as unknown as ObjectCommandDeps["client"],
    getSelection: () => selection,
    setSelection: async () => {},
    refreshSelectionGeometry: async () => {},
    report: (severity, message) => rec.reports.push({ severity, message }),
    activeEditContext: () => context,
  };
  return { deps, rec };
}

/** A property snapshot carrying the object layer's clipping index — the
 *  exact entry shape the engine returns for a plugin-metadata label. */
function clipIndexed(id: ElementId, content: ElementId[]): ElementProperties {
  const write = clipIndexMutation(id as PageItemId, content as PageItemId[]);
  const args = (write as { args: { key: string; value: string | null } }).args;
  return {
    id,
    kind: "Rectangle",
    entries: [
      {
        path: "pluginMetadata",
        value: {
          type: "pluginMetadata",
          value: { key: args.key, value: args.value, caller: null, prev: null },
        },
      },
    ],
  } as unknown as ElementProperties;
}

/** Each verb with a selection it would actually act on — ungroup needs
 *  a GROUP selected, so a shared selection would make its control case
 *  pass for the wrong reason (nothing to ungroup, hence no mutation). */
const VERBS: Array<
  [string, (d: ObjectCommandDeps) => Promise<void>, ElementId[]]
> = [
  [
    "arrange",
    (d) => arrangeSelection(d, "front" as ArrangeTarget),
    [rect("a"), rect("b")],
  ],
  ["group", groupSelection, [rect("a"), rect("b")]],
  ["ungroup", ungroupSelection, [{ kind: "group", id: "g1" }]],
  // Delete needs the WHOLE group: a lone member of a surviving group is
  // refused before the wire, which would pass the guard test for the
  // wrong reason.
  ["delete", deleteSelection, [{ kind: "group", id: "g1" }]],
  ["nudge", (d) => nudgeSelection(d, "right", false), [rect("a")]],
  ["make clipping mask", makeClippingMask, [rect("c"), rect("d")]],
  ["release clipping mask", releaseClippingMask, [rect("d")]],
];

test.describe("paged.object — the edit-context guard", () => {
  test("AC-OBJ-CTX-1 — at the document root the verbs reach the engine @feat:editor-tools.select.group-descent @level:happy", async () => {
    // The CONTROL. Without it the guard tests below would pass just as
    // well against a function that never mutates at all.
    for (const [name, run, sel] of VERBS) {
      const { deps, rec } = depsWith(null, sel);
      await run(deps);
      expect(rec.mutations, `${name} reached the engine`).toBeGreaterThan(0);
    }
  });

  test("AC-OBJ-CTX-2 — inside a context NOTHING reaches the engine @feat:editor-tools.select.group-descent @level:edge", async () => {
    for (const [name, run, sel] of VERBS) {
      const { deps, rec } = depsWith({ type: "rasterImage" }, sel);
      await run(deps);
      expect(rec.mutations, `${name} sent no mutation`).toBe(0);
    }
  });

  test("AC-OBJ-CTX-3 — and the user is TOLD, naming the context @level:edge", async () => {
    // Silence is what made the original defect invisible. The command
    // was reachable — a shortcut has no menu to grey — so the user
    // pressed something and is owed an answer.
    const { deps, rec } = depsWith({ type: "sheet" });
    await ungroupSelection(deps);
    expect(rec.reports).toHaveLength(1);
    expect(rec.reports[0]!.message).toContain("sheet");
    expect(rec.reports[0]!.message).toContain("Esc");
  });
});


// ── Delete ───────────────────────────────────────────────────────────
//
// The plan is where the two things the ENGINE gets wrong are kept off
// the wire (a group id handed to `deleteFrame`; a member removed from
// a group that is staying). The e2e tier proves the engine really
// behaves that way; this tier proves the plan for every shape of
// selection, which an e2e test can only sample.

const g = (id: string): ElementId => ({ kind: "group", id });

test.describe("paged.object — the delete plan", () => {
  const roots = spreadOf([
    leaf("free"),
    group("gOuter", [group("gInner", [leaf("deep1"), leaf("deep2")]), leaf("shallow")]),
    group("gOther", [leaf("o1"), leaf("o2")]),
    leaf("top"),
  ]);

  test("AC-OBJ-PURE-11 — a leaf is one deleteFrame, by bare id @feat:frames-paths.frame.delete @level:happy", () => {
    const plan = deletePlan([rect("free"), rect("top")], roots);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops).toEqual([
      { op: "deleteFrame", args: { frameId: "free" } },
      { op: "deleteFrame", args: { frameId: "top" } },
    ]);
    expect(plan.removed.map(elementKey)).toEqual([
      "rectangle:free",
      "rectangle:top",
    ]);
    // Both groups survive, so both member tables are to be checked.
    expect([...plan.survivors.keys()].sort()).toEqual([
      "group:gInner",
      "group:gOther",
      "group:gOuter",
    ]);
  });

  test("AC-OBJ-PURE-12 — a group is dissolved outermost-first, THEN its leaves go @feat:frames-paths.frame.delete @feat:frames-paths.groups @level:happy", () => {
    const plan = deletePlan([g("gOuter")], roots);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops).toEqual([
      { op: "dissolveGroup", args: { groupId: "gOuter" } },
      { op: "dissolveGroup", args: { groupId: "gInner" } },
      { op: "deleteFrame", args: { frameId: "deep1" } },
      { op: "deleteFrame", args: { frameId: "deep2" } },
      { op: "deleteFrame", args: { frameId: "shallow" } },
    ]);
    // Every dissolve precedes every delete — a leaf removed while its
    // group still stands is the engine defect the plan exists to avoid.
    const firstDelete = plan.ops.findIndex((o) => o.op === "deleteFrame");
    expect(
      plan.ops.slice(firstDelete).every((o) => o.op === "deleteFrame"),
    ).toBe(true);
    // Only the bystander group is left to verify.
    expect([...plan.survivors.keys()]).toEqual(["group:gOther"]);
    expect(plan.survivors.get("group:gOther")).toEqual([
      "rectangle:o1",
      "rectangle:o2",
    ]);
  });

  test("AC-OBJ-PURE-13 — an item inside a SELECTED group is covered, not deleted twice @feat:frames-paths.frame.delete @feat:frames-paths.groups @level:edge", () => {
    // Order of the selection must not matter: member first, group first.
    for (const selection of [
      [rect("deep1"), g("gOuter"), g("gInner")],
      [g("gOuter"), rect("shallow"), rect("deep2")],
    ]) {
      const plan = deletePlan(selection, roots);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.ops.filter((o) => o.op === "deleteFrame")).toHaveLength(3);
      expect(plan.ops.filter((o) => o.op === "dissolveGroup")).toHaveLength(2);
    }
  });

  test("AC-OBJ-PURE-14 — a member of a group that STAYS is refused, naming both @feat:frames-paths.frame.delete @feat:frames-paths.groups @level:edge", () => {
    const leafCase = deletePlan([rect("free"), rect("o1")], roots);
    expect(leafCase.ok).toBe(false);
    if (leafCase.ok) return;
    expect(leafCase.reason).toContain("rectangle o1");
    expect(leafCase.reason).toContain("group gOther");
    expect(leafCase.reason).toContain("ungroup first");

    // A nested group inside a surviving one is the same case: its
    // dissolve would splice the leaves into the parent, and deleting
    // them there is a member delete.
    const nested = deletePlan([g("gInner")], roots);
    expect(nested.ok).toBe(false);
    if (nested.ok) return;
    expect(nested.reason).toContain("group gInner");
    expect(nested.reason).toContain("group gOuter");
  });

  test("AC-OBJ-PURE-15 — content addresses are not page items; stale ids still reach the engine @feat:frames-paths.frame.delete @level:edge", () => {
    const cell: ElementId = {
      kind: "tableCell",
      id: { story_id: "s", table_id: "t", row: 0, col: 0 },
    };
    const none = deletePlan([cell], roots);
    expect(none.ok && none.ops).toEqual([]);

    // Not in the tree: the op still goes out, so the ENGINE answers
    // (a pasted-into child is absent from the tree by design and gets
    // the engine's own "release it before removing").
    const stale = deletePlan([rect("ghost"), g("ghostGroup")], roots);
    expect(stale.ok).toBe(true);
    if (!stale.ok) return;
    expect(stale.ops).toEqual([
      { op: "dissolveGroup", args: { groupId: "ghostGroup" } },
      { op: "deleteFrame", args: { frameId: "ghost" } },
    ]);
  });

  test("AC-OBJ-PURE-16 — the member-table check sees a re-seated group @feat:frames-paths.groups @level:edge", () => {
    const before = groupTable(roots);
    expect(before.get("group:gOuter")).toEqual([
      "group:gInner",
      "rectangle:shallow",
    ]);
    expect(firstDisturbedGroup(before, groupTable(roots))).toBeNull();

    // What the engine actually leaves behind when an older rectangle is
    // removed: the table slides one slot along the spread's list.
    const slid = spreadOf([
      group("gOuter", [group("gInner", [leaf("deep1"), leaf("deep2")]), leaf("shallow")]),
      group("gOther", [leaf("o2"), leaf("top")]),
      leaf("top"),
    ]);
    expect(firstDisturbedGroup(before, groupTable(slid))).toBe("group:gOther");
    // A group that vanished is disturbed too.
    expect(
      firstDisturbedGroup(before, groupTable(spreadOf([leaf("free")]))),
    ).not.toBeNull();
  });
});

test.describe("paged.object — delete, against a recorded client", () => {
  /** A client that records every mutation and serves two trees: the
   *  one before the delete and the one "the engine" holds after. */
  function recordingDeps(
    selection: ElementId[],
    before: SceneTreeNode[],
    after: SceneTreeNode[],
    images: string[] = [],
  ) {
    const sent: unknown[] = [];
    const reports: Array<{ severity: string; message: string }> = [];
    const selections: ElementId[][] = [];
    let undone = 0;
    let deleted = false;
    const deps: ObjectCommandDeps = {
      client: {
        mutate: async (m: { op: string; args: { ops?: unknown[] } }) => {
          sent.push(m);
          // The purge after a revert is an EMPTY batch; anything else
          // is the delete itself.
          if (!(m.op === "batch" && m.args.ops?.length === 0)) deleted = true;
          return {
            kind: "mutationApplied",
            payload: { createdId: null, pageIds: [] },
          } as never;
        },
        sceneTree: async () => (deleted && undone === 0 ? after : before),
        setElementSelection: async (ids: unknown[]) => ids,
        elementGeometry: async (ids: ElementId[]) =>
          ids.map((id) => ({
            id,
            bounds: [0, 0, 10, 10],
            itemTransform: null,
            hasImage: images.includes(String((id as { id: unknown }).id)),
          })),
        layers: async () => [],
        elementProperties: async () => null,
        undo: async () => {
          undone += 1;
          return { kind: "undoApplied", payload: {} } as never;
        },
      } as unknown as ObjectCommandDeps["client"],
      getSelection: () => selection,
      setSelection: async (ids) => {
        selections.push(ids);
      },
      refreshSelectionGeometry: async () => {},
      report: (severity, message) => reports.push({ severity, message }),
      activeEditContext: () => null,
    };
    return { deps, sent, reports, selections, undone: () => undone };
  }

  const before = spreadOf([
    leaf("x"),
    group("g1", [leaf("a"), leaf("b")]),
    leaf("z"),
  ]);

  test("AC-OBJ-PURE-17 — a clean delete is ONE batch and leaves the selection empty @feat:frames-paths.frame.delete @feat:round-tripping.undo-redo @level:happy", async () => {
    const after = spreadOf([group("g1", [leaf("a"), leaf("b")])]);
    const r = recordingDeps([rect("x"), rect("z")], before, after);
    await deleteSelection(r.deps);
    expect(r.sent).toEqual([
      {
        op: "batch",
        args: {
          ops: [
            { op: "deleteFrame", args: { frameId: "x" } },
            { op: "deleteFrame", args: { frameId: "z" } },
          ],
        },
      },
    ]);
    expect(r.selections).toEqual([[]]);
    expect(r.reports).toEqual([]);
    expect(r.undone()).toBe(0);
  });

  test("AC-OBJ-PURE-18 — a delete that re-seats a bystander group is UNDONE and reported @feat:frames-paths.frame.delete @feat:frames-paths.groups @level:edge", async () => {
    // What the engine leaves after removing `x`: g1 now claims b and z.
    const damaged = spreadOf([group("g1", [leaf("b"), leaf("z")]), leaf("z")]);
    const r = recordingDeps([rect("x")], before, damaged);
    await deleteSelection(r.deps);

    expect(r.undone(), "the damaging delete was undone").toBe(1);
    // The delete, then the empty batch that drops its redo entry — a
    // Redo that re-breaks the group must not be left lying around.
    expect(r.sent).toEqual([
      { op: "deleteFrame", args: { frameId: "x" } },
      { op: "batch", args: { ops: [] } },
    ]);
    // The selection is NOT cleared: nothing was deleted.
    expect(r.selections).toEqual([]);
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]!.severity).toBe("error");
    expect(r.reports[0]!.message).toContain("Delete undone");
    expect(r.reports[0]!.message).toContain("group g1");
    expect(r.reports[0]!.message).toContain("back as it was");
  });

  test("AC-OBJ-PURE-19 — a member of a surviving group never reaches the wire @feat:frames-paths.frame.delete @feat:frames-paths.groups @level:edge", async () => {
    const r = recordingDeps([rect("a")], before, before);
    await deleteSelection(r.deps);
    expect(r.sent).toEqual([]);
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]!.message).toContain("Delete refused");
    expect(r.reports[0]!.message).toContain("group g1");
  });

  test("AC-OBJ-PURE-20 — a deleted image frame says what undo will not bring back @feat:frames-paths.frame.delete @feat:round-tripping.undo-redo @level:edge", async () => {
    const after = spreadOf([group("g1", [leaf("a"), leaf("b")]), leaf("z")]);
    const r = recordingDeps([rect("x")], before, after, ["x"]);
    await deleteSelection(r.deps);
    expect(r.selections).toEqual([[]]);
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]!.severity).toBe("info");
    expect(r.reports[0]!.message).toContain("placed image");
  });
});

// ── Nudge ────────────────────────────────────────────────────────────

test.describe("paged.object — nudge", () => {
  test("AC-OBJ-PURE-21 — the step is 1 pt, ×10 when large, and up is NEGATIVE y @feat:editor-tools.move.translate @level:happy", () => {
    expect(nudgeDelta("left", false)).toEqual([-1, 0]);
    expect(nudgeDelta("right", false)).toEqual([1, 0]);
    expect(nudgeDelta("up", false)).toEqual([0, -1]);
    expect(nudgeDelta("down", false)).toEqual([0, 1]);
    expect(nudgeDelta("left", true)).toEqual([-10, 0]);
    expect(nudgeDelta("down", true)).toEqual([0, 10]);
  });

  test("AC-OBJ-PURE-22 — a move touches the translation and nothing else @feat:frames-paths.frame.move-op @level:happy", () => {
    // `null` is the engine's identity.
    expect(translated(null, 3, -2)).toEqual([1, 0, 0, 1, 3, -2]);
    // A rotated frame keeps its rotation: it moves along the PAGE's
    // axes, which is why this is a transform write and not a bounds one.
    const rotated = [0.8660254, 0.5, -0.5, 0.8660254, 40, 60];
    expect(translated(rotated, 10, 0)).toEqual([
      0.8660254, 0.5, -0.5, 0.8660254, 50, 60,
    ]);
  });

  test("AC-OBJ-PURE-23 — a group's own members are not moved a second time @feat:editor-tools.move.translate @feat:frames-paths.groups @level:edge", () => {
    const roots = spreadOf([
      group("gOuter", [group("gInner", [leaf("deep")]), leaf("shallow")]),
      leaf("free"),
    ]);
    const cell: ElementId = {
      kind: "tableCell",
      id: { story_id: "s", table_id: "t", row: 0, col: 0 },
    };
    expect(
      nudgeTargets(
        [rect("deep"), g("gOuter"), rect("free"), g("gInner"), cell, rect("free")],
        roots,
      ).map(elementKey),
    ).toEqual(["group:gOuter", "rectangle:free"]);
    // A member on its own (its group NOT selected) moves on its own.
    expect(nudgeTargets([rect("deep")], roots).map(elementKey)).toEqual([
      "rectangle:deep",
    ]);
  });

  /** A client whose `mutate` resolves only when the test says so — the
   *  only way to see what a press does while another is in flight. */
  function gatedDeps(selectionRef: { current: ElementId[] }) {
    const sent: Array<{ op: string; args: Record<string, unknown> }> = [];
    const gates: Array<() => void> = [];
    const transforms = new Map<string, number[] | null>();
    const refreshes = { count: 0 };
    const reports: Array<{ severity: string; message: string }> = [];
    const apply = (m: { op: string; args: Record<string, unknown> }) => {
      if (m.op === "batch") (m.args.ops as (typeof m)[]).forEach(apply);
      if (m.op === "moveFrame") {
        transforms.set(`leaf:${m.args.frameId}`, m.args.transform as number[]);
      }
      if (m.op === "setGroupTransform") {
        transforms.set(`group:${m.args.groupId}`, m.args.transform as number[]);
      }
    };
    const deps: ObjectCommandDeps = {
      client: {
        mutate: (m: { op: string; args: Record<string, unknown> }) =>
          new Promise((resolve) => {
            sent.push(m);
            gates.push(() => {
              apply(m);
              resolve({
                kind: "mutationApplied",
                payload: { createdId: null, pageIds: [] },
              } as never);
            });
          }),
        sceneTree: async () =>
          spreadOf([group("g1", [leaf("a"), leaf("b")]), leaf("c")]),
        setElementSelection: async (ids: unknown[]) => ids,
        elementGeometry: async (ids: ElementId[]) =>
          ids.map((id) => ({
            id,
            bounds: [0, 0, 10, 10],
            itemTransform:
              transforms.get(`leaf:${(id as { id: string }).id}`) ?? null,
            hasImage: false,
          })),
        layers: async () => [],
        elementProperties: async (id: ElementId) => ({
          id,
          kind: "Group",
          entries: [
            {
              path: "frameTransform",
              value: {
                type: "transform",
                value:
                  transforms.get(`group:${(id as { id: string }).id}`) ?? null,
              },
            },
          ],
        }),
        undo: async () => ({ kind: "undoApplied", payload: {} }) as never,
      } as unknown as ObjectCommandDeps["client"],
      getSelection: () => selectionRef.current,
      setSelection: async () => {},
      refreshSelectionGeometry: async () => {
        refreshes.count += 1;
      },
      report: (severity, message) => reports.push({ severity, message }),
      activeEditContext: () => null,
    };
    /** Let pending microtasks (the reads before a write) run. */
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return { deps, sent, gates, refreshes, reports, settle };
  }

  test("AC-OBJ-PURE-24 — a leaf rides moveFrame, a group rides setGroupTransform, in ONE batch @feat:frames-paths.frame.move-op @feat:frames-paths.groups @level:happy", async () => {
    // The group AND one of its members AND a free leaf: the member is
    // carried by the group, so exactly two ops go out.
    const sel = { current: [g("g1"), rect("a"), rect("c")] };
    const h = gatedDeps(sel);
    const done = nudgeSelection(h.deps, "right", true);
    await h.settle();
    expect(h.sent).toEqual([
      {
        op: "batch",
        args: {
          ops: [
            {
              op: "moveFrame",
              args: { frameId: "c", transform: [1, 0, 0, 1, 10, 0] },
            },
            {
              op: "setGroupTransform",
              args: { groupId: "g1", transform: [1, 0, 0, 1, 10, 0] },
            },
          ],
        },
      },
    ]);
    h.gates[0]!();
    await done;
    // The selection chrome is re-read, and nothing was reported.
    expect(h.refreshes.count).toBe(1);
    expect(h.reports).toEqual([]);
  });

  test("AC-OBJ-PURE-25 — presses during a round trip FOLD into the next batch, and none is lost @feat:editor-tools.move.translate @feat:round-tripping.undo-redo @level:edge", async () => {
    const sel = { current: [rect("c")] };
    const h = gatedDeps(sel);

    // One press goes out at once: a single press is always one batch.
    const first = nudgeSelection(h.deps, "right", false);
    await h.settle();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toEqual({
      op: "moveFrame",
      args: { frameId: "c", transform: [1, 0, 0, 1, 1, 0] },
    });

    // Four more while it is in flight — a held key. Nothing is sent
    // yet: each is an ABSOLUTE write built from a read, and reading
    // before the first write landed would lose the first move.
    void nudgeSelection(h.deps, "right", false);
    void nudgeSelection(h.deps, "right", false);
    void nudgeSelection(h.deps, "down", true);
    const last = nudgeSelection(h.deps, "right", false);
    await h.settle();
    expect(h.sent).toHaveLength(1);

    // The first lands; the four fold into ONE batch, read AFTER it —
    // so the transform is the first move plus all four, not just four.
    h.gates[0]!();
    await h.settle();
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1]).toEqual({
      op: "moveFrame",
      args: { frameId: "c", transform: [1, 0, 0, 1, 4, 10] },
    });
    h.gates[1]!();
    await Promise.all([first, last]);
    expect(h.sent).toHaveLength(2);

    // The queue is idle again, and the next press starts a fresh batch.
    const again = nudgeSelection(h.deps, "left", false);
    await h.settle();
    expect(h.sent).toHaveLength(3);
    expect(h.sent[2]!.args.transform).toEqual([1, 0, 0, 1, 3, 10]);
    h.gates[2]!();
    await again;
  });

  test("AC-OBJ-PURE-26 — a press never moves what was not selected when it was made @feat:editor-tools.move.translate @level:edge", async () => {
    const sel = { current: [rect("c")] as ElementId[] };
    const h = gatedDeps(sel);
    const first = nudgeSelection(h.deps, "right", false);
    await h.settle();
    void nudgeSelection(h.deps, "right", false); // still `c`
    sel.current = [rect("a")]; // the selection changes mid-flight
    const last = nudgeSelection(h.deps, "right", false); // meant for `a`

    h.gates[0]!();
    await h.settle();
    // `c`'s queued press goes out alone — it does not absorb `a`'s.
    expect(h.sent[1]).toEqual({
      op: "moveFrame",
      args: { frameId: "c", transform: [1, 0, 0, 1, 2, 0] },
    });
    h.gates[1]!();
    await h.settle();
    expect(h.sent[2]).toEqual({
      op: "moveFrame",
      args: { frameId: "a", transform: [1, 0, 0, 1, 1, 0] },
    });
    h.gates[2]!();
    await Promise.all([first, last]);
  });

  test("AC-OBJ-PURE-27 — an element with no geometry is refused, not skipped @feat:editor-tools.move.translate @level:edge", async () => {
    const sel = { current: [rect("c")] };
    const h = gatedDeps(sel);
    (h.deps.client as unknown as { elementGeometry: unknown }).elementGeometry =
      async () => [];
    await nudgeSelection(h.deps, "right", false);
    expect(h.sent).toEqual([]);
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]!.message).toContain("Nudge refused");
    expect(h.reports[0]!.message).toContain("rectangle c");
  });
});

// ── Who owns the key ─────────────────────────────────────────────────
//
// Two layers, and each answers a different question. `when` predicates
// are handed application STATE: is the user inside something where
// Backspace means something else? The registry is handed the EVENT: is
// the focused widget going to consume this key itself?

test.describe("paged.object — the keyboard guards", () => {
  const root = {
    editContext: null,
    contentSelection: { contentSelection: null },
    selection: { pathEditMode: false },
    tool: { effectiveTool: "paged.tool.select" },
    overlaySignals: { toolPreview: null, marqueeRect: null },
  };

  test("AC-OBJ-KEY-1 — the verbs go quiet where the same key means something else @feat:editor-shell.keyboard-shortcuts @feat:editor-tools.text.caret-typing @feat:editor-tools.path.direct-edit @level:edge", () => {
    for (const applies of [objectVerbApplies, deleteKeyApplies, nudgeKeyApplies]) {
      expect(applies(root)).toBe(true);
      // A partial handle (standalone mount) must not disable them.
      expect(applies(null)).toBe(true);
      expect(applies({})).toBe(true);
      // Inside a plugin edit context / modal session.
      expect(applies({ ...root, editContext: { type: "sheet" } })).toBe(false);
      // A text caret: Backspace is a character, the arrows are the caret.
      expect(
        applies({
          ...root,
          contentSelection: {
            contentSelection: { storyId: "s", start: 1, end: 1 },
          },
        }),
      ).toBe(false);
      // Path-edit mode: Backspace is an anchor.
      expect(applies({ ...root, selection: { pathEditMode: true } })).toBe(false);
    }
  });

  test("AC-OBJ-KEY-2 — the Page tool keeps Backspace; a drag keeps the arrows @feat:editor-shell.keyboard-shortcuts @feat:editor-tools.page-tool @feat:editor-tools.draw.gridify @level:edge", () => {
    const pageTool = { ...root, tool: { effectiveTool: "paged.tool.page" } };
    expect(deleteKeyApplies(pageTool)).toBe(false);
    // …the KEY, not the verb: Object ▸ Delete is still unambiguous.
    expect(objectVerbApplies(pageTool)).toBe(true);
    expect(nudgeKeyApplies(pageTool)).toBe(true);

    const drawing = {
      ...root,
      overlaySignals: { toolPreview: { kind: "rect" }, marqueeRect: null },
    };
    expect(nudgeKeyApplies(drawing)).toBe(false);
    expect(deleteKeyApplies(drawing)).toBe(true);
    expect(
      nudgeKeyApplies({
        ...root,
        overlaySignals: { toolPreview: null, marqueeRect: { x: 0 } },
      }),
    ).toBe(false);
  });

  /** A structural stand-in for a focused element. */
  const el = (
    tagName: string,
    opts: { editable?: boolean; inside?: string } = {},
  ) => ({
    tagName,
    isContentEditable: opts.editable ?? false,
    closest: (selector: string) =>
      opts.inside && selector.includes(`[role="${opts.inside}"]`) ? {} : null,
  });
  const key = (
    k: string,
    target: unknown,
    mods: {
      metaKey?: boolean;
      ctrlKey?: boolean;
      altKey?: boolean;
      defaultPrevented?: boolean;
    } = {},
  ) =>
    ({
      key: k,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      defaultPrevented: false,
      ...mods,
      target,
    }) as unknown as Parameters<typeof targetOwnsKey>[0];

  test("AC-OBJ-KEY-3 — a focused field owns Backspace and the arrows, modifiers and all @feat:editor-shell.keyboard-shortcuts @level:edge", () => {
    for (const field of [
      el("INPUT"),
      el("TEXTAREA"),
      el("DIV", { editable: true }),
    ]) {
      for (const k of [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ]) {
        expect(targetOwnsKey(key(k, field)), `${field.tagName} ${k}`).toBe(true);
      }
      // Cmd+Left is "line start" in a field; Alt+Backspace is "delete word".
      expect(targetOwnsKey(key("ArrowLeft", field, { metaKey: true }))).toBe(true);
      expect(targetOwnsKey(key("Backspace", field, { altKey: true }))).toBe(true);
      // The rule this replaced, unchanged: a typed letter is text, a
      // Cmd chord still opens the palette, and Tab/Escape still fire.
      expect(targetOwnsKey(key("v", field))).toBe(true);
      expect(targetOwnsKey(key("k", field, { metaKey: true }))).toBe(false);
      expect(targetOwnsKey(key("Tab", field))).toBe(false);
      expect(targetOwnsKey(key("Escape", field))).toBe(false);
    }
  });

  test("AC-OBJ-KEY-4 — a menu, a slider, a tree and a dialog own the arrows; the canvas and a toolbar do not @feat:editor-shell.keyboard-shortcuts @feat:editor-shell.menus @level:edge", () => {
    for (const role of ["menu", "menubar", "listbox", "tree", "tablist", "slider", "dialog"]) {
      const inside = el("DIV", { inside: role });
      expect(targetOwnsKey(key("ArrowDown", inside)), role).toBe(true);
      expect(targetOwnsKey(key("Backspace", inside)), role).toBe(true);
      // Letters are NOT claimed there — tool shortcuts keep working
      // with focus on a tab or a tree row, as they always have.
      expect(targetOwnsKey(key("v", inside)), role).toBe(false);
    }
    expect(targetOwnsKey(key("ArrowDown", el("SELECT")))).toBe(true);

    // The canvas (body), a plain button, a tool-rail button: the keys
    // are free, and the bindings' `when` decides.
    expect(targetOwnsKey(key("ArrowLeft", el("BODY")))).toBe(false);
    expect(targetOwnsKey(key("Backspace", el("BUTTON")))).toBe(false);
    expect(
      targetOwnsKey(key("ArrowLeft", el("BUTTON", { inside: "toolbar" }))),
    ).toBe(false);
    // No element at all (the event came off `window`).
    expect(targetOwnsKey(key("ArrowLeft", null))).toBe(false);

    // A handler upstream that already took the key owns it, role or
    // no role — a focused menu trigger opening on ArrowDown. Only for
    // these keys: a prevented Cmd chord or letter is not this rule's.
    const button = el("BUTTON");
    expect(
      targetOwnsKey(key("ArrowDown", button, { defaultPrevented: true })),
    ).toBe(true);
    expect(
      targetOwnsKey(key("Backspace", null, { defaultPrevented: true })),
    ).toBe(true);
    expect(
      targetOwnsKey(key("g", button, { metaKey: true, defaultPrevented: true })),
    ).toBe(false);
  });
});

// ── Clipping masks ───────────────────────────────────────────────────
//
// Make / Release ride B-18's `pasteInto` / `releaseFrom`. The plan
// decides WHICH object clips (the topmost, layer first), in WHAT order
// the content is pasted (back to front), what is refused before the
// wire, and — for Release — the reorder indices that put the content
// back beneath its clipping path. The e2e tier proves the engine clips,
// undoes and releases; this tier proves the plan for every shape.

const ov = (id: string): PageItemId => ({ kind: "oval", id });
const poly = (id: string): PageItemId => ({ kind: "polygon", id });
const ln = (id: string): PageItemId => ({ kind: "graphicLine", id });
const tf = (id: string): PageItemId => ({ kind: "textFrame", id });
const r = (id: string): PageItemId => ({ kind: "rectangle", id });

/** A scene-tree leaf for any page-item kind. */
const node = (id: PageItemId): SceneTreeNode => ({
  id,
  kind: id.kind,
  label: id.id,
});

const metaArgs = (m: unknown) =>
  (m as { args: { elementId: ElementId; key: string; value: string | null } })
    .args;

/** The index a metadata write carries, as plain keys. */
const indexOf = (m: unknown): string[] => {
  const value = metaArgs(m).value;
  if (value === null) return [];
  return (
    JSON.parse(value) as { data: { clipContent: ElementId[] } }
  ).data.clipContent.map(elementKey);
};

/** The engine's list rules, in miniature: a release APPENDS, an index
 *  reorder is remove-then-insert (core `apply_reorder_node`). Replays a
 *  release batch over one spread's top-level list. */
function replay(list: string[], ops: unknown[]): string[] {
  const out = [...list];
  for (const op of ops as Array<{ op: string; args: Record<string, unknown> }>) {
    if (op.op === "releaseFrom") {
      out.push(elementKey(op.args.childId as ElementId));
    } else if (op.op === "reorderElement") {
      const key = elementKey(op.args.elementId as ElementId);
      const to = (op.args.to as { index: number }).index;
      out.splice(out.indexOf(key), 1);
      out.splice(to, 0, key);
    }
  }
  return out;
}

test.describe("paged.object — the clipping-mask plan", () => {
  test("AC-OBJ-PURE-30 — the TOPMOST clips; the rest are pasted back to front, and indexed, in one batch @feat:frames-paths.nested-content @feat:frames-paths.path-clipping @level:happy", () => {
    const roots = spreadOf([node(r("a")), node(ov("o")), node(r("b")), node(poly("p"))]);
    // Selection order is NOT paint order — the plan must not care.
    const plan = clipPlan([r("b"), poly("p"), r("a")], roots);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.clip).toEqual(poly("p"));
    expect(plan.content).toEqual([r("a"), r("b")]);
    expect(plan.ops.slice(0, 2)).toEqual([
      { op: "pasteInto", args: { containerId: poly("p"), childId: r("a") } },
      { op: "pasteInto", args: { containerId: poly("p"), childId: r("b") } },
    ]);
    // The index rides the SAME batch, on the clipping path.
    expect(plan.ops).toHaveLength(3);
    expect(metaArgs(plan.ops[2]).elementId).toEqual(poly("p"));
    expect(metaArgs(plan.ops[2]).key).toBe(OBJECT_METADATA_KEY);
    expect(indexOf(plan.ops[2])).toEqual(["rectangle:a", "rectangle:b"]);
  });

  test("AC-OBJ-PURE-31 — a higher LAYER outranks paint order, as the renderer does @feat:frames-paths.nested-content @feat:layers.z-ordering @level:edge", () => {
    const roots = spreadOf([node(r("a")), node(r("b"))]);
    // `a` paints first, but sits on the upper layer.
    const plan = clipPlan([r("a"), r("b")], roots, {
      layerZ: new Map([
        ["rectangle:a", 1],
        ["rectangle:b", 0],
      ]),
    });
    expect(plan.ok && plan.clip).toEqual(r("a"));
    expect(plan.ok && plan.content).toEqual([r("b")]);
  });

  test("AC-OBJ-PURE-32 — every refusal is made before the wire, in words a user can act on @feat:frames-paths.nested-content @feat:editor-shell.panels.problems @level:edge", () => {
    const refusal = (sel: ElementId[], roots: SceneTreeNode[]) => {
      const plan = clipPlan(sel, roots);
      return plan.ok ? null : plan.reason;
    };
    expect(refusal([r("a")], spreadOf([node(r("a"))]))).toBe(
      "a clipping mask needs two or more objects — the topmost becomes the " +
        "clipping path and the rest are clipped by it.",
    );
    for (const top of [ln("l"), tf("t")]) {
      expect(
        refusal([r("a"), top], spreadOf([node(r("a")), node(top)])),
      ).toBe(
        `the topmost object, ${top.kind === "graphicLine" ? "line" : "text frame"} ` +
          `${top.id}, cannot be a clipping path — the engine clips only by a ` +
          "rectangle, an ellipse or a path. Bring one of those to the front " +
          "of the selection.",
      );
    }
    const grouped = spreadOf([group("g", [leaf("x"), leaf("y")]), node(r("a"))]);
    expect(refusal([g("g"), r("a")], grouped)).toBe(
      "group g cannot be clipped: the engine pastes single objects into a " +
        "frame, never a group. Ungroup it first.",
    );
    expect(refusal([rect("x"), r("a")], grouped)).toBe(
      "rectangle x is inside group g, and the engine cannot paste a grouped " +
        "object into a frame. Ungroup first.",
    );
    // A group on TOP is the clip-kind refusal, not the content one.
    expect(refusal([r("a"), g("g")], spreadOf([node(r("a")), group("g", [leaf("x")])]))).toContain(
      "the topmost object, group g, cannot be a clipping path",
    );
    // An id the tree does not list — already nested, or gone.
    expect(refusal([r("a"), r("n")], spreadOf([node(r("a"))]))).toBe(
      "rectangle n is not a free object on the page (it may already be " +
        "inside a clipping path).",
    );
    // A clipping path INSIDE a group is the engine's to accept (measured).
    expect(
      refusal([r("a"), ov("o")], spreadOf([node(r("a")), group("g", [node(ov("o"))])])),
    ).toBeNull();
  });

  test("AC-OBJ-PURE-33 — clipping into a path that already clips keeps the old content listed @feat:frames-paths.nested-content @level:edge", () => {
    const roots = spreadOf([node(r("a")), node(ov("o"))]);
    const plan = clipPlan([r("a"), ov("o")], roots, { existing: [r("n")] });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(indexOf(plan.ops[plan.ops.length - 1])).toEqual([
      "rectangle:n",
      "rectangle:a",
    ]);
  });

  test("AC-OBJ-PURE-34 — Release puts the content back BENEATH its clipping path, in order, then clears the index @feat:frames-paths.nested-content @feat:layers.z-ordering @level:happy", () => {
    // One clipping path between two bystanders.
    const roots = spreadOf([node(r("x")), node(ov("k")), node(r("y"))]);
    const ops = releasePlan([{ container: ov("k"), content: [r("a"), r("b")] }], roots);
    expect(ops).toEqual([
      { op: "releaseFrom", args: { childId: r("a") } },
      { op: "releaseFrom", args: { childId: r("b") } },
      { op: "reorderElement", args: { elementId: r("a"), to: { index: 1 } } },
      { op: "reorderElement", args: { elementId: r("b"), to: { index: 2 } } },
      clipIndexMutation(ov("k"), []),
    ]);
    expect(
      replay(["rectangle:x", "oval:k", "rectangle:y"], ops),
    ).toEqual(["rectangle:x", "rectangle:a", "rectangle:b", "oval:k", "rectangle:y"]);

    // A clipping path inside a group: a reorder cannot reparent, so the
    // content lands beneath the GROUP.
    const inGroup = spreadOf([node(r("x")), group("g", [node(ov("k")), leaf("z")]), node(r("y"))]);
    expect(
      replay(
        ["rectangle:x", "group:g", "rectangle:y"],
        releasePlan([{ container: ov("k"), content: [r("a")] }], inGroup),
      ),
    ).toEqual(["rectangle:x", "rectangle:a", "group:g", "rectangle:y"]);

    // Two clipping paths in one batch: each index is computed against
    // the list as the previous reorder left it.
    const two = spreadOf([node(ov("k1")), node(r("x")), node(ov("k2"))]);
    expect(
      replay(
        ["oval:k1", "rectangle:x", "oval:k2"],
        releasePlan(
          [
            { container: ov("k1"), content: [r("a")] },
            { container: ov("k2"), content: [r("b")] },
          ],
          two,
        ),
      ),
    ).toEqual(["rectangle:a", "oval:k1", "rectangle:x", "rectangle:b", "oval:k2"]);
  });

  test("AC-OBJ-PURE-35 — the index reads back what it wrote, and nothing it did not @feat:frames-paths.nested-content @level:edge", () => {
    const props = clipIndexed(ov("k"), [r("a"), tf("t")]);
    expect(clipContentOf(props)).toEqual([r("a"), tf("t")]);
    // Clearing writes `null`, which deletes the label.
    expect(metaArgs(clipIndexMutation(ov("k"), [])).value).toBeNull();
    // Malformed, foreign or group-bearing labels read as no index / no group.
    const entry = (key: string, value: string) =>
      ({
        id: ov("k"),
        kind: "Oval",
        entries: [
          {
            path: "pluginMetadata",
            value: { type: "pluginMetadata", value: { key, value, caller: null, prev: null } },
          },
        ],
      }) as unknown as ElementProperties;
    expect(clipContentOf(entry(OBJECT_METADATA_KEY, "{not json"))).toEqual([]);
    expect(
      clipContentOf(entry("x-paged:media.paged.draw", JSON.stringify({ v: 1, data: { clipContent: [r("a")] } }))),
    ).toEqual([]);
    expect(
      clipContentOf(entry(OBJECT_METADATA_KEY, JSON.stringify({ v: 1, data: { clipContent: [g("g"), r("a"), { kind: "storyRange" }] } }))),
    ).toEqual([r("a")]);
    expect(clipContentOf(null)).toEqual([]);
    expect([r("a"), ov("o"), poly("p"), ln("l"), tf("t"), g("g")].map(canClipBy)).toEqual([
      true, true, true, false, false, false,
    ]);
  });

  test("AC-OBJ-PURE-36 — a deleted clipping path takes its content, deepest first @feat:frames-paths.frame.delete @feat:frames-paths.nested-content @level:happy", () => {
    const roots = spreadOf([node(ov("k")), node(r("x"))]);
    // k clips a and o2; o2 is itself a clipping path holding c.
    const index = new Map<string, PageItemId[]>([
      ["oval:k", [r("a"), ov("o2")]],
      ["oval:o2", [r("c")]],
    ]);
    const plan = deletePlan([ov("k")], roots, index);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops).toEqual([
      { op: "releaseFrom", args: { childId: r("a") } },
      { op: "deleteFrame", args: { frameId: "a" } },
      { op: "releaseFrom", args: { childId: r("c") } },
      { op: "deleteFrame", args: { frameId: "c" } },
      { op: "releaseFrom", args: { childId: ov("o2") } },
      { op: "deleteFrame", args: { frameId: "o2" } },
      { op: "deleteFrame", args: { frameId: "k" } },
    ]);
    expect(plan.removed.map(elementKey)).toEqual([
      "rectangle:a",
      "rectangle:c",
      "oval:o2",
      "oval:k",
    ]);
    // Without an index the container goes alone (engine-findings §12).
    const bare = deletePlan([ov("k")], roots);
    expect(bare.ok && bare.ops).toEqual([{ op: "deleteFrame", args: { frameId: "k" } }]);
    // Flattening visits every level once.
    expect(clippedContent(index, [ov("k")]).map(elementKey)).toEqual([
      "rectangle:a",
      "oval:o2",
      "rectangle:c",
    ]);
  });
});

test.describe("paged.object — clipping masks, against a recorded client", () => {
  /** A client over a fixed tree, a per-element property table, and a
   *  set of ids that EXIST (answer `elementGeometry`). */
  function clipDeps(options: {
    selection: ElementId[];
    tree: SceneTreeNode[];
    props?: Map<string, ElementProperties>;
    exists?: Set<string>;
    refuse?: string;
  }) {
    const sent: Array<{ op: string; args: Record<string, unknown> }> = [];
    const reports: Array<{ severity: string; message: string }> = [];
    const selections: ElementId[][] = [];
    const deps: ObjectCommandDeps = {
      client: {
        mutate: async (m: { op: string; args: Record<string, unknown> }) => {
          sent.push(m);
          return (
            options.refuse
              ? {
                  kind: "mutationFailed",
                  payload: {
                    error: { kind: "notImplemented", details: { what: options.refuse } },
                  },
                }
              : { kind: "mutationApplied", payload: { createdId: null, pageIds: [] } }
          ) as never;
        },
        sceneTree: async () => options.tree,
        setElementSelection: async (ids: unknown[]) => ids,
        elementGeometry: async (ids: ElementId[]) =>
          ids
            .filter((id) => !options.exists || options.exists.has(elementKey(id)))
            .map((id) => ({
              id,
              bounds: [0, 0, 10, 10],
              itemTransform: [1, 0, 0, 1, 5, 5],
              hasImage: false,
            })),
        layers: async () => [],
        elementProperties: async (id: ElementId) =>
          options.props?.get(elementKey(id)) ?? null,
        undo: async () => ({ kind: "undoApplied", payload: {} }) as never,
      } as unknown as ObjectCommandDeps["client"],
      getSelection: () => options.selection,
      setSelection: async (ids) => {
        selections.push(ids);
      },
      refreshSelectionGeometry: async () => {},
      report: (severity, message) => reports.push({ severity, message }),
      activeEditContext: () => null,
    };
    return { deps, sent, reports, selections };
  }

  const opsOf = (m: { op: string; args: Record<string, unknown> }) =>
    m.op === "batch" ? (m.args.ops as Array<{ op: string; args: Record<string, unknown> }>) : [m];

  test("AC-OBJ-PURE-37 — Make is ONE batch and selects the clipping path; an engine refusal is reported verbatim @feat:frames-paths.nested-content @feat:round-tripping.undo-redo @feat:editor-shell.panels.problems @level:happy", async () => {
    const tree = spreadOf([node(r("a")), node(ov("k"))]);
    const ok = clipDeps({ selection: [r("a"), ov("k")], tree });
    await makeClippingMask(ok.deps);
    expect(ok.sent).toHaveLength(1);
    expect(opsOf(ok.sent[0]).map((o) => o.op)).toEqual(["pasteInto", "setPluginMetadata"]);
    expect(ok.selections).toEqual([[ov("k")]]);
    expect(ok.reports).toEqual([]);

    const refused = clipDeps({
      selection: [r("a"), ov("k")],
      tree,
      refuse: "B-18: container and child must live on the same spread",
    });
    await makeClippingMask(refused.deps);
    expect(refused.reports).toEqual([
      {
        severity: "error",
        message:
          "Make clipping mask refused: B-18: container and child must live on the same spread",
      },
    ]);
    expect(refused.selections).toEqual([]);

    // A plan refusal never reaches the wire.
    const one = clipDeps({ selection: [r("a")], tree });
    await makeClippingMask(one.deps);
    expect(one.sent).toEqual([]);
    expect(one.reports[0].message).toMatch(/^Make clipping mask refused: a clipping mask needs two/);
  });

  test("AC-OBJ-PURE-38 — Release finds content through the index, keeps only what is still nested, and selects it @feat:frames-paths.nested-content @level:happy", async () => {
    // The index lists a (nested), x (back in the tree — a script released
    // it) and gone (no longer exists). Only `a` may be released: a
    // `releaseFrom` for either of the others would roll the batch back.
    const tree = spreadOf([node(r("x")), node(ov("k"))]);
    const h = clipDeps({
      selection: [ov("k")],
      tree,
      props: new Map([["oval:k", clipIndexed(ov("k"), [r("a"), r("x"), r("gone")])]]),
      exists: new Set(["rectangle:a", "rectangle:x", "oval:k"]),
    });
    await releaseClippingMask(h.deps);
    expect(h.sent).toHaveLength(1);
    const ops = opsOf(h.sent[0]);
    expect(ops.filter((o) => o.op === "releaseFrom").map((o) => o.args.childId)).toEqual([r("a")]);
    expect(h.selections).toEqual([[r("a"), ov("k")]]);
    expect(h.reports).toEqual([]);
  });

  test("AC-OBJ-PURE-39 — Release with nothing to find says why, and sends nothing @feat:frames-paths.nested-content @feat:editor-shell.panels.problems @level:edge", async () => {
    const tree = spreadOf([node(ov("k")), node(r("b"))]);
    const none = clipDeps({ selection: [ov("k")], tree });
    await releaseClippingMask(none.deps);
    expect(none.sent).toEqual([]);
    expect(none.reports).toEqual([
      {
        severity: "error",
        message:
          "Release clipping mask refused: ellipse k holds no content this " +
          "editor clipped. Content pasted in elsewhere — by InDesign, a script " +
          "or a plugin — cannot be found: the engine has no read that lists " +
          "what is inside a frame.",
      },
    ]);
    const wrongKind = clipDeps({ selection: [tf("t")], tree: spreadOf([node(tf("t"))]) });
    await releaseClippingMask(wrongKind.deps);
    expect(wrongKind.reports[0].message).toBe(
      "Release clipping mask refused: select a clipping path — a rectangle, " +
        "an ellipse or a path that holds clipped content.",
    );
  });

  test("AC-OBJ-PURE-40 — a nudged clipping path carries its content; a deleted one takes it @feat:editor-tools.move.translate @feat:frames-paths.frame.delete @feat:frames-paths.nested-content @level:happy", async () => {
    const tree = spreadOf([node(ov("k"))]);
    const props = new Map([["oval:k", clipIndexed(ov("k"), [r("a")])]]);
    const nudge = clipDeps({ selection: [ov("k")], tree, props });
    await nudgeSelection(nudge.deps, "right", true);
    expect(nudge.sent).toHaveLength(1);
    expect(opsOf(nudge.sent[0])).toEqual([
      { op: "moveFrame", args: { frameId: "k", transform: [1, 0, 0, 1, 15, 5] } },
      { op: "moveFrame", args: { frameId: "a", transform: [1, 0, 0, 1, 15, 5] } },
    ]);

    const del = clipDeps({ selection: [ov("k")], tree, props });
    await deleteSelection(del.deps);
    expect(opsOf(del.sent[0])).toEqual([
      { op: "releaseFrom", args: { childId: r("a") } },
      { op: "deleteFrame", args: { frameId: "a" } },
      { op: "deleteFrame", args: { frameId: "k" } },
    ]);
  });

  test("AC-OBJ-PURE-41 — two Object-menu rows and two commands; deliberately no keys @feat:editor-shell.menus @feat:frames-paths.nested-content @level:smoke", () => {
    const noop = () => {};
    const handlers = new Proxy({} as ObjectCommandHandlers, { get: () => noop });
    const commands = buildObjectCommands(handlers);
    for (const id of [PAGED_OBJECT_MAKE_CLIPPING_MASK, PAGED_OBJECT_RELEASE_CLIPPING_MASK]) {
      const command = commands.find((c) => c.id === id);
      expect(command?.category).toBe("Object");
      // Greyed inside a plugin edit context, like Group.
      expect(typeof command?.when).toBe("function");
      const when = command!.when as (s: unknown) => boolean;
      expect(when({ editContext: null })).toBe(true);
      expect(when({ editContext: { type: "sheet" } })).toBe(false);
      expect(OBJECT_KEYBINDINGS.some((k) => k.command === id)).toBe(false);
    }
    expect(
      OBJECT_MENU_ITEMS.filter((m) => m.group === "clip").map((m) => [m.path, m.order]),
    ).toEqual([
      ["Object/Make clipping mask", 28],
      ["Object/Release clipping mask", 29],
    ]);
  });
});
