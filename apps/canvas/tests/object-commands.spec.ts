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

import type { ElementId, SceneTreeNode } from "@paged-media/client";

import {
  arrangePlan,
  arrangeSelection,
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
      sceneTree: async () => [group("g1", [leaf("a"), leaf("b")])],
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
      elementProperties: async () => null,
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
