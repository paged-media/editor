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
  elementKey,
  groupMembersOf,
  groupSelection,
  parentGroupOf,
  ungroupSelection,
  zSlots,
  type ArrangeTarget,
  type ObjectCommandDeps,
} from "../src/object-commands";

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
      setElementSelection: async (ids) => ids,
      elementGeometry: async () => [],
      layers: async () => [],
    } as unknown as ObjectCommandDeps["client"],
    getSelection: () => selection,
    setSelection: async () => {},
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
