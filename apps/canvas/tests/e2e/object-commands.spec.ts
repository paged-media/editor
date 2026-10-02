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

// E2E — `paged.object.*`, the structural object command layer, against
// the REAL engine and through the REAL command registry.
//
// This is where paged.draw's Group / Ungroup / Select parent group
// coverage moved to. Those three commands were a plugin's, which meant
// a user without the vector plugin loaded could not group — although
// `createGroup` / `dissolveGroup` have been wire ops the whole time.
// Every assertion below invokes a HOST command id (`paged.object.*`);
// nothing here needs a bundle. Arrange is new: the editor had no
// Arrange at all before this.
//
// The pure ordering algebra (relative-order preservation for every verb
// and both boundaries) is proven exhaustively in `../object-commands.spec.ts`
// — this tier proves it against the engine that actually holds the list.
//
// DELETE and NUDGE follow the same split. The plan (which op for which
// kind, what is refused before the wire, how presses queue) is proven
// for every shape of selection in the Node tier; here each verb is
// proven against the real engine — and so are the four engine
// behaviours the verbs are built around, as `test.fail` anchors that turn
// red the day core fixes them (docs/engine-findings.md §10–§12, §14).

import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { pagePng } from "./harness/gesture";
import { diffPngPixels } from "./harness/pixel-diff";

const BRING_TO_FRONT = "paged.object.bringToFront";
const BRING_FORWARD = "paged.object.bringForward";
const SEND_BACKWARD = "paged.object.sendBackward";
const SEND_TO_BACK = "paged.object.sendToBack";
const GROUP = "paged.object.group";
const UNGROUP = "paged.object.ungroup";
const SELECT_PARENT_GROUP = "paged.object.selectParentGroup";
const DELETE = "paged.object.delete";
const NUDGE_LEFT = "paged.object.nudgeLeft";
const NUDGE_RIGHT = "paged.object.nudgeRight";
const NUDGE_UP = "paged.object.nudgeUp";
const NUDGE_DOWN = "paged.object.nudgeDown";
const NUDGE_LEFT_LARGE = "paged.object.nudgeLeftLarge";
const NUDGE_RIGHT_LARGE = "paged.object.nudgeRightLarge";
const NUDGE_UP_LARGE = "paged.object.nudgeUpLarge";
const NUDGE_DOWN_LARGE = "paged.object.nudgeDownLarge";

interface ElementRef {
  kind: string;
  id: string;
}

interface MutationReply {
  kind: string;
  payload: { createdId?: ElementRef | null; error?: unknown };
}

async function mutate(page: Page, m: unknown): Promise<MutationReply> {
  return page.evaluate(async (mm) => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { mutate: (x: unknown) => Promise<unknown> } };
      }
    ).__canvas;
    return (await c.client.mutate(mm)) as never;
  }, m);
}

/** Invoke a command exactly the way the menu and the keybinding do. */
async function invokeCommand(page: Page, id: string): Promise<void> {
  await page.evaluate(async (commandId) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (id: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas;
    await c.registries.commands.invoke(commandId);
  }, id);
}

/** Every id-bearing scene node, in PAINT order (back to front) —
 *  `paged.tree()` walks the same order `frames_in_order` records. */
async function paintOrder(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const roots = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string; id: string } | null;
      children?: unknown[];
    }>;
    const out: string[] = [];
    const visit = (n: (typeof roots)[number]) => {
      if (n.id) out.push(`${n.id.kind}:${n.id.id}`);
      for (const ch of (n.children ?? []) as typeof roots) visit(ch);
    };
    for (const root of roots) visit(root);
    return out;
  });
}

/** The paint order restricted to `ids`, so a fixture's own furniture
 *  never makes the assertion brittle. */
async function orderOf(page: Page, ids: string[]): Promise<string[]> {
  const all = await paintOrder(page);
  const wanted = new Set(ids);
  return all.filter((k) => wanted.has(k));
}

/** Select through the worker AND the React mirror the commands read,
 *  then wait for the mirror to settle (the commands close over a ref,
 *  so an un-flushed render would hand them the previous selection). */
async function select(page: Page, refs: ElementRef[]): Promise<void> {
  await page.evaluate(async (ids) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            setElementSelection: (
              ids: unknown[],
              mode: string,
            ) => Promise<unknown[]>;
            elementGeometry: (ids: unknown[]) => Promise<unknown[]>;
          };
          setElementSelection?: (ids: unknown[]) => void;
          setElementGeometry?: (items: unknown[]) => void;
          setContentSelection?: (s: unknown | null) => void;
        };
      }
    ).__canvas;
    c.setContentSelection?.(null);
    const applied = await c.client.setElementSelection(ids, "replace");
    c.setElementSelection?.(applied);
    try {
      c.setElementGeometry?.(await c.client.elementGeometry(applied));
    } catch {
      /* geometry is chrome only */
    }
  }, refs);
  await expect.poll(() => selection(page)).toHaveLength(refs.length);
}

/** The selection the commands actually read (the React mirror). */
async function selection(page: Page): Promise<ElementRef[]> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __canvas: { elementSelection: ElementRef[] } })
        .__canvas.elementSelection,
  );
}

/** Force the React mirror WITHOUT telling the worker — the only way to
 *  hand a command an id the engine will refuse. */
async function forceSelection(page: Page, refs: ElementRef[]): Promise<void> {
  await page.evaluate((ids) => {
    (
      globalThis as unknown as {
        __canvas: { setElementSelection?: (ids: unknown[]) => void };
      }
    ).__canvas.setElementSelection?.(ids);
  }, refs);
  await expect.poll(() => selection(page)).toHaveLength(refs.length);
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as { __canvas: { client: { undo: () => Promise<unknown> } } }
    ).__canvas.client.undo();
  });
}

async function firstPageId(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } })
        .__canvas.handle.pageIds[0],
  );
}

/** Insert `n` rectangles; each lands at the FRONT of the spread's
 *  stacking list, so the returned refs are back-to-front. */
async function insertStack(page: Page, n: number): Promise<ElementRef[]> {
  const pageId = await firstPageId(page);
  const out: ElementRef[] = [];
  for (let i = 0; i < n; i += 1) {
    const at = 40 + i * 12;
    const reply = await mutate(page, {
      op: "insertFrame",
      args: { pageId, bounds: [at, at, at + 60, at + 60] },
    });
    expect(reply.kind, "insertFrame should apply").toBe("mutationApplied");
    out.push(reply.payload.createdId!);
  }
  return out;
}

const key = (r: ElementRef) => `${r.kind}:${r.id}`;

async function redo(page: Page): Promise<{ kind: string }> {
  return page.evaluate(async () => {
    return (await (
      globalThis as unknown as {
        __canvas: { client: { redo: () => Promise<{ kind: string }> } };
      }
    ).__canvas.client.redo()) as { kind: string };
  });
}

/** The scene tree as ONE string that keeps the nesting —
 *  `rectangle:u1,group:u5[rectangle:u2,rectangle:u3]`. `paintOrder`
 *  flattens, and a flattened list cannot tell a group that lost a
 *  member from one that never had it. */
async function structure(page: Page): Promise<string> {
  return page.evaluate(async () => {
    interface N {
      id?: { kind: string; id: string } | null;
      children?: N[];
    }
    const c = (
      globalThis as unknown as {
        __canvas: { client: { sceneTree: () => Promise<N[]> } };
      }
    ).__canvas;
    const walk = (n: N): string => {
      const kids = (n.children ?? []).map(walk).filter(Boolean).join(",");
      if (!n.id) return kids; // Spread / Page rows carry no id.
      return `${n.id.kind}:${n.id.id}${kids ? `[${kids}]` : ""}`;
    };
    return (await c.client.sceneTree()).map(walk).filter(Boolean).join(",");
  });
}

interface Geometry {
  key: string;
  /** Raw `GeometricBounds`, `[top, left, bottom, right]` (inner space). */
  bounds: number[];
  /** The item's own `ItemTransform`; `null` is identity. */
  transform: number[] | null;
  hasImage: boolean;
}

/** What the engine holds for each element, in the order asked. */
async function geometry(page: Page, refs: ElementRef[]): Promise<Geometry[]> {
  return page.evaluate(async (ids) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{
                id: { kind: string; id: string };
                bounds: number[];
                itemTransform?: number[] | null;
                hasImage?: boolean;
              }>
            >;
          };
        };
      }
    ).__canvas;
    return (await c.client.elementGeometry(ids)).map((g) => ({
      key: `${g.id.kind}:${g.id.id}`,
      bounds: g.bounds,
      transform: g.itemTransform ?? null,
      hasImage: g.hasImage ?? false,
    }));
  }, refs);
}

/** The four corners of an element where they actually sit on the
 *  spread: the bounds corners through the item transform. This — not
 *  `bounds`, not the transform — is "where the object is". */
function corners(g: Geometry): Array<[number, number]> {
  const [top, left, bottom, right] = g.bounds;
  const [a, b, c, d, tx, ty] = g.transform ?? [1, 0, 0, 1, 0, 0];
  return (
    [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ] as Array<[number, number]>
  ).map(([x, y]) => [a * x + c * y + tx, b * x + d * y + ty]);
}

/** Assert `after` is `before` moved by exactly `(dx, dy)` — every
 *  corner, to f32 precision — and that NOTHING else about the element
 *  changed: same bounds, same linear part. That second half is what
 *  makes it a move and not a re-drawn shape in the right place. */
function expectMovedBy(
  before: Geometry,
  after: Geometry,
  dx: number,
  dy: number,
  label: string,
): void {
  const from = corners(before);
  const to = corners(after);
  for (let i = 0; i < 4; i += 1) {
    expect(to[i][0], `${label}: corner ${i} x`).toBeCloseTo(from[i][0] + dx, 3);
    expect(to[i][1], `${label}: corner ${i} y`).toBeCloseTo(from[i][1] + dy, 3);
  }
  expect(after.bounds, `${label}: bounds are untouched`).toEqual(before.bounds);
  const lin = (g: Geometry) => (g.transform ?? [1, 0, 0, 1, 0, 0]).slice(0, 4);
  expect(lin(after), `${label}: rotation/scale are untouched`).toEqual(
    lin(before),
  );
}

/** One property of one element, as the inspector reads it. */
async function property(
  page: Page,
  ref: ElementRef,
  path: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ id, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value?: { value: unknown } | null }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(id);
      const entry = props?.entries.find((e) => e.path === p);
      return entry?.value?.value ?? null;
    },
    { id: ref, p: path },
  );
}

/** The object layer's line in the Problems panel. */
const objectProblem = (page: Page) =>
  page.locator('[data-problem][data-problem-bundle="paged.object"]');

/** Insert a text frame holding `text`; returns the frame and its story. */
async function insertTextFrameWith(
  page: Page,
  text: string,
): Promise<{ frame: ElementRef; storyId: string }> {
  const pageId = await firstPageId(page);
  const storyIds = () =>
    page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              collection: (n: string) => Promise<Array<{ selfId: string }>>;
            };
          };
        }
      ).__canvas;
      return (await c.client.collection("stories")).map((s) => s.selfId);
    });
  const before = new Set(await storyIds());
  const reply = await mutate(page, {
    op: "insertTextFrame",
    args: { pageId, bounds: [300, 60, 380, 300] },
  });
  expect(reply.kind, "insertTextFrame should apply").toBe("mutationApplied");
  const storyId = (await storyIds()).find((id) => !before.has(id));
  expect(storyId, "the new frame minted a story").toBeTruthy();
  const typed = await mutate(page, {
    op: "insertText",
    args: { storyId, offset: 0, text },
  });
  expect(typed.kind, "insertText should apply").toBe("mutationApplied");
  return { frame: reply.payload.createdId!, storyId: storyId! };
}

async function characterCount(page: Page, storyId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (
              n: string,
            ) => Promise<Array<{ selfId: string; characterCount: number }>>;
          };
        };
      }
    ).__canvas;
    const stories = await c.client.collection("stories");
    return stories.find((s) => s.selfId === id)?.characterCount ?? -1;
  }, storyId);
}

/** Put (or clear) a text caret the way a click in a story does. */
async function setCaret(
  page: Page,
  caret: { storyId: string; start: number; end: number } | null,
): Promise<void> {
  await page.evaluate((sel) => {
    (
      globalThis as unknown as {
        __canvas: { setContentSelection: (s: unknown | null) => void };
      }
    ).__canvas.setContentSelection(sel);
  }, caret);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { contentSelection: unknown } })
            .__canvas.contentSelection != null,
      ),
    )
    .toBe(caret != null);
}

/** A fresh blank document through the real File ▸ New. */
async function newBlankDocument(page: Page): Promise<void> {
  await openCanvas(page);
  await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (id: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas;
    await c.registries.commands.invoke("paged.file.new");
  });
  await page.waitForFunction(
    () =>
      (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas
        ?.ready === true,
    null,
    { timeout: 15_000 },
  );
}

test.describe("E2E paged.object — the structural command layer", () => {
  // File ▸ New through the real command path. A BLANK document is the
  // point: its stacking list holds exactly the frames this spec
  // inserts, so "bring forward" means "swap with the next one of MINE"
  // and every assertion is exact. Load a fixture instead and its own
  // page items sit in the same list — a step verb then walks past
  // furniture the assertion cannot see, which reads as "nothing moved"
  // and would pass a broken blocking rule.
  test.beforeEach(async ({ page }) => {
    await newBlankDocument(page);
  });

  test("AC-OBJ-1 — every object verb is a HOST command under paged.object.* @feat:editor-shell.menus @feat:frames-paths.groups @feat:layers.z-ordering @feat:editor-tools.object-commands @level:smoke", async ({
    page,
  }) => {
    const registered = await page.evaluate(() => {
      const r = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              commands: {
                list: () => Array<{ id: string; title: string; category?: string }>;
              };
              menus: { list: () => Array<{ path: string; command: string }> };
              keybindings: { list: () => Array<{ key: string; command: string }> };
            };
          };
        }
      ).__canvas.registries;
      return {
        commands: r.commands
          .list()
          .filter((c) => c.id.startsWith("paged.object."))
          .map((c) => ({ id: c.id, title: c.title, category: c.category })),
        menus: r.menus
          .list()
          .filter((m) => m.command.startsWith("paged.object."))
          .map((m) => m.path),
        keys: r.keybindings
          .list()
          .filter((k) => k.command.startsWith("paged.object."))
          .map((k) => k.key),
      };
    });

    expect(registered.commands.map((c) => c.id).sort()).toEqual(
      [
        BRING_FORWARD,
        BRING_TO_FRONT,
        GROUP,
        SELECT_PARENT_GROUP,
        SEND_BACKWARD,
        SEND_TO_BACK,
        UNGROUP,
        DELETE,
        NUDGE_LEFT,
        NUDGE_RIGHT,
        NUDGE_UP,
        NUDGE_DOWN,
        NUDGE_LEFT_LARGE,
        NUDGE_RIGHT_LARGE,
        NUDGE_UP_LARGE,
        NUDGE_DOWN_LARGE,
      ].sort(),
    );
    // ONE category, and it is the editor's — not a plugin namespace.
    expect([...new Set(registered.commands.map((c) => c.category))]).toEqual([
      "Object",
    ]);
    expect(registered.menus.sort()).toEqual(
      [
        "Object/Bring to front",
        "Object/Bring forward",
        "Object/Send backward",
        "Object/Send to back",
        "Object/Group",
        "Object/Ungroup",
        "Object/Select parent group",
        "Object/Nudge left",
        "Object/Nudge right",
        "Object/Nudge up",
        "Object/Nudge down",
        "Object/Delete",
      ].sort(),
    );
    // Both platform variants, plus the shifted-glyph alternates the
    // bracket pair needs (`event.key` for Shift+] is `}`).
    expect(registered.keys).toContain("cmd+g");
    expect(registered.keys).toContain("ctrl+g");
    expect(registered.keys).toContain("cmd+shift+g");
    expect(registered.keys).toContain("cmd+]");
    expect(registered.keys).toContain("cmd+[");
    expect(registered.keys).toContain("cmd+shift+]");
    expect(registered.keys).toContain("cmd+shift+}");
    expect(registered.keys).toContain("cmd+shift+[");
    expect(registered.keys).toContain("cmd+shift+{");
    // Delete on both of its keys, and the arrows with their ×10 twins.
    for (const k of [
      "backspace",
      "delete",
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
      "shift+arrowleft",
      "shift+arrowright",
      "shift+arrowup",
      "shift+arrowdown",
    ]) {
      expect(registered.keys, k).toContain(k);
    }
  });

  // ───────────────────────────────────────────────────────── group

  test("AC-OBJ-2 — Group wraps the selection and selects the minted group @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    const [a, b] = await insertStack(page, 2);
    await select(page, [a, b]);
    await invokeCommand(page, GROUP);

    const sel = await selection(page);
    expect(sel).toHaveLength(1);
    expect(sel[0].kind).toBe("group");

    // The tree holds a group wrapping exactly the two members.
    const members = await page.evaluate(async (groupId) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              executeScript: (
                s: string,
              ) => Promise<{ output: string[]; error: string | null }>;
            };
          };
        }
      ).__canvas;
      const r = await c.client.executeScript("paged.tree()");
      const roots = JSON.parse(r.output[0] ?? "[]") as Array<{
        id?: { kind: string; id: string } | null;
        children?: unknown[];
      }>;
      let found: string[] | null = null;
      const visit = (n: (typeof roots)[number]) => {
        if (n.id && n.id.kind === "group" && n.id.id === groupId) {
          found = ((n.children ?? []) as typeof roots)
            .map((c2) => (c2.id ? `${c2.id.kind}:${c2.id.id}` : ""))
            .filter(Boolean);
        }
        for (const ch of (n.children ?? []) as typeof roots) visit(ch);
      };
      for (const root of roots) visit(root);
      return found;
    }, sel[0].id);
    expect(members).not.toBeNull();
    expect([...(members ?? [])].sort()).toEqual([key(a), key(b)].sort());
  });

  test("AC-OBJ-3 — Ungroup dissolves and re-selects the members; undo ×2 is pristine @feat:frames-paths.groups @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const [a, b] = await insertStack(page, 2);
    const groupsBefore = (await paintOrder(page)).filter((k) =>
      k.startsWith("group:"),
    ).length;

    await select(page, [a, b]);
    await invokeCommand(page, GROUP);
    await expect
      .poll(async () =>
        (await paintOrder(page)).filter((k) => k.startsWith("group:")).length,
      )
      .toBe(groupsBefore + 1);

    await invokeCommand(page, UNGROUP);
    await expect
      .poll(async () =>
        (await paintOrder(page)).filter((k) => k.startsWith("group:")).length,
      )
      .toBe(groupsBefore);
    // The members come back as the selection.
    expect((await selection(page)).map(key).sort()).toEqual(
      [key(a), key(b)].sort(),
    );

    // UNDO the dissolve → the group is back. UNDO the create →
    // pristine. Each command is exactly one undo step.
    await undo(page);
    await expect
      .poll(async () =>
        (await paintOrder(page)).filter((k) => k.startsWith("group:")).length,
      )
      .toBe(groupsBefore + 1);
    await undo(page);
    await expect
      .poll(async () =>
        (await paintOrder(page)).filter((k) => k.startsWith("group:")).length,
      )
      .toBe(groupsBefore);
  });

  test("AC-OBJ-4 — Group under two, and Ungroup without a group, are honest no-ops @feat:frames-paths.groups @level:edge", async ({
    page,
  }) => {
    const [a, b] = await insertStack(page, 2);
    const before = await paintOrder(page);

    await select(page, [a]);
    await invokeCommand(page, GROUP); // one element — the InDesign floor.
    expect(await paintOrder(page)).toEqual(before);
    expect((await selection(page)).map(key)).toEqual([key(a)]);

    await select(page, [a, b]);
    await invokeCommand(page, UNGROUP); // no group in the selection.
    expect(await paintOrder(page)).toEqual(before);
    expect((await selection(page)).map(key).sort()).toEqual(
      [key(a), key(b)].sort(),
    );
  });

  test("AC-OBJ-5 — Select parent group climbs one level, then stops @feat:frames-paths.groups @feat:editor-tools.select.group-descent @level:happy", async ({
    page,
  }) => {
    const [a, b] = await insertStack(page, 2);
    await select(page, [a, b]);
    await invokeCommand(page, GROUP);
    const groupRef = (await selection(page))[0];

    // A member climbs to its group.
    await select(page, [a]);
    await invokeCommand(page, SELECT_PARENT_GROUP);
    expect((await selection(page)).map(key)).toEqual([key(groupRef)]);

    // At the top of the chain: an honest no-op, selection unchanged.
    await invokeCommand(page, SELECT_PARENT_GROUP);
    expect((await selection(page)).map(key)).toEqual([key(groupRef)]);

    // Nothing selected: no-op, no throw.
    await select(page, []);
    await invokeCommand(page, SELECT_PARENT_GROUP);
    expect(await selection(page)).toEqual([]);
  });

  // ─────────────────────────────────────────────────────── arrange

  test("AC-OBJ-6 — Arrange moves one element through the engine's stacking list @feat:layers.z-ordering @level:happy", async ({
    page,
  }) => {
    const refs = await insertStack(page, 4);
    const keys = refs.map(key);
    // Inserts append, so the stack is back-to-front in creation order.
    expect(await orderOf(page, keys)).toEqual(keys);

    await select(page, [refs[1]]);
    // The two step verbs first, and back again — a swap with the next
    // neighbour either way.
    await invokeCommand(page, BRING_FORWARD);
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[0], keys[2], keys[1], keys[3]]);

    await invokeCommand(page, SEND_BACKWARD);
    await expect.poll(() => orderOf(page, keys)).toEqual(keys);

    await invokeCommand(page, BRING_TO_FRONT);
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[0], keys[2], keys[3], keys[1]]);

    await invokeCommand(page, SEND_TO_BACK);
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[1], keys[0], keys[2], keys[3]]);
  });

  test("AC-OBJ-7 — a multi-selection Arrange keeps its relative order, in ONE undo step @feat:layers.z-ordering @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const refs = await insertStack(page, 5);
    const keys = refs.map(key);
    expect(await orderOf(page, keys)).toEqual(keys);

    // Select the middle pair in REVERSE stacking order: the plan reads
    // the engine's order, not the click order, so the result is the
    // same either way.
    await select(page, [refs[2], refs[1]]);
    await invokeCommand(page, BRING_TO_FRONT);
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[0], keys[3], keys[4], keys[1], keys[2]]);

    // ONE undo for the whole multi-selection move (the ops ride a
    // single engine `batch`), not one per element.
    await undo(page);
    await expect.poll(() => orderOf(page, keys)).toEqual(keys);

    await select(page, [refs[3], refs[2]]);
    await invokeCommand(page, SEND_TO_BACK);
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[2], keys[3], keys[0], keys[1], keys[4]]);
    await undo(page);
    await expect.poll(() => orderOf(page, keys)).toEqual(keys);
  });

  test("AC-OBJ-8 — a step verb moves the run by one, and the run at the end does not move @feat:layers.z-ordering @level:edge", async ({
    page,
  }) => {
    const refs = await insertStack(page, 5);
    const keys = refs.map(key);
    expect(await orderOf(page, keys)).toEqual(keys);

    await select(page, [refs[1], refs[2]]);
    await invokeCommand(page, BRING_FORWARD);
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[0], keys[3], keys[1], keys[2], keys[4]]);
    await undo(page);
    await expect.poll(() => orderOf(page, keys)).toEqual(keys);

    // The two frontmost, brought forward: blocked. Without the
    // blocking rule this would swap them and reverse the pair.
    await select(page, [refs[3], refs[4]]);
    await invokeCommand(page, BRING_FORWARD);
    expect(await orderOf(page, keys)).toEqual(keys);

    // The two backmost, sent backward: blocked the same way.
    await select(page, [refs[0], refs[1]]);
    await invokeCommand(page, SEND_BACKWARD);
    expect(await orderOf(page, keys)).toEqual(keys);
  });

  test("AC-OBJ-9 — Arrange cannot lift a member OUT of its group @feat:layers.z-ordering @feat:frames-paths.groups @level:edge", async ({
    page,
  }) => {
    const refs = await insertStack(page, 3);
    const keys = refs.map(key);
    await select(page, [refs[0], refs[1]]);
    await invokeCommand(page, GROUP);
    const groupKey = key((await selection(page))[0]);

    // `reorderElement` derives the sibling list from where the node
    // already is, so bring-to-front on a MEMBER moves it inside the
    // group — the group's own slot never changes.
    const before = await orderOf(page, [...keys, groupKey]);
    await select(page, [refs[0]]);
    await invokeCommand(page, BRING_TO_FRONT);
    const after = await orderOf(page, [...keys, groupKey]);
    expect(after).not.toEqual(before);
    // The group is still where it was relative to the ungrouped third
    // frame, and both members are still INSIDE it (the tree nests them
    // after the group node, contiguously).
    expect(after.indexOf(groupKey)).toBe(before.indexOf(groupKey));
    expect(after.slice(after.indexOf(groupKey) + 1, after.indexOf(groupKey) + 3).sort()).toEqual(
      [keys[0], keys[1]].sort(),
    );
  });

  test("AC-OBJ-11 — the real keyboard chords fire, brackets included @feat:layers.z-ordering @feat:editor-shell.keyboard-shortcuts @feat:frames-paths.groups @level:gesture", async ({
    page,
  }) => {
    // The chords, pressed for real. The bracket pair is the reason this
    // test exists: `eventMatches` compares `event.key`, and Shift+] on a
    // US layout produces `}` — so a lone `cmd+shift+]` binding would
    // parse a combo no keystroke can make, and only the alternate entry
    // catches this press.
    const refs = await insertStack(page, 3);
    const keys = refs.map(key);
    await select(page, [refs[0]]);

    await page.keyboard.press("ControlOrMeta+Shift+BracketRight"); // to front
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[1], keys[2], keys[0]]);

    await page.keyboard.press("ControlOrMeta+BracketLeft"); // backward
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[1], keys[0], keys[2]]);

    await page.keyboard.press("ControlOrMeta+BracketRight"); // forward
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[1], keys[2], keys[0]]);

    await page.keyboard.press("ControlOrMeta+Shift+BracketLeft"); // to back
    await expect
      .poll(() => orderOf(page, keys))
      .toEqual([keys[0], keys[1], keys[2]]);

    // Cmd+G / Cmd+Shift+G, the pair every DTP app ships.
    await select(page, [refs[0], refs[1]]);
    await page.keyboard.press("ControlOrMeta+g");
    await expect
      .poll(async () =>
        (await paintOrder(page)).filter((k) => k.startsWith("group:")).length,
      )
      .toBe(1);
    await page.keyboard.press("ControlOrMeta+Shift+g");
    await expect
      .poll(async () =>
        (await paintOrder(page)).filter((k) => k.startsWith("group:")).length,
      )
      .toBe(0);
  });

  test("AC-OBJ-10 — a refused Arrange surfaces the engine's own sentence @feat:layers.z-ordering @feat:editor-shell.panels.problems @level:edge", async ({
    page,
  }) => {
    await openPanel(page, "paged.problems");
    // Hand the command an id the engine cannot resolve, WITHOUT telling
    // the worker. `client.mutate` resolves on a refusal — a bare
    // `.catch` would swallow it, and the user would see nothing.
    await forceSelection(page, [{ kind: "rectangle", id: "u-does-not-exist" }]);
    await invokeCommand(page, BRING_TO_FRONT);

    const problem = page.locator(
      '[data-problem][data-problem-bundle="paged.object"]',
    );
    await expect(problem).toHaveCount(1);
    await expect(problem.locator("[data-problem-message]")).toContainText(
      "Arrange refused",
    );
    await expect(problem).toHaveAttribute("data-problem-severity", "error");

    // The next verb starts from a clean slate, so the panel shows the
    // LAST outcome and never a stale one.
    const refs = await insertStack(page, 2);
    await select(page, [refs[0]]);
    await invokeCommand(page, BRING_TO_FRONT);
    await expect(problem).toHaveCount(0);
  });
});

// ───────────────────────────────────────────────────────────── delete

test.describe("E2E paged.object.delete — against the real engine", () => {
  test.beforeEach(async ({ page }) => {
    await newBlankDocument(page);
  });

  test("AC-OBJ-12 — Delete removes exactly the selection; the rest keep id, geometry and order @feat:frames-paths.frame.delete @feat:editor-tools.object-commands @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.problems");
    const refs = await insertStack(page, 5);
    const keys = refs.map(key);
    // Give a survivor something to lose besides its place: a rotation.
    const rotated = await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: refs[2],
        path: "frameRotationAngle",
        value: { type: "length", value: 30 },
      },
    });
    expect(rotated.kind).toBe("mutationApplied");
    const survivors = [refs[0], refs[2], refs[4]];
    const before = await geometry(page, survivors);
    expect(before[1].transform, "the rotation landed").not.toBeNull();

    // Two NON-adjacent items, selected front-first.
    await select(page, [refs[3], refs[1]]);
    await invokeCommand(page, DELETE);

    // Exactly the two are gone — by id, and in the same stacking order.
    await expect
      .poll(() => structure(page))
      .toBe([keys[0], keys[2], keys[4]].join(","));
    expect(await geometry(page, [refs[1], refs[3]])).toEqual([]);
    // The survivors are byte-for-byte where they were.
    expect(await geometry(page, survivors)).toEqual(before);
    // Afterwards nothing is selected, and nothing was reported.
    expect(await selection(page)).toEqual([]);
    await expect(objectProblem(page)).toHaveCount(0);
  });

  test("AC-OBJ-13 — ONE undo restores every deleted item at its own z slot; redo deletes them again @feat:frames-paths.frame.delete @feat:round-tripping.undo-redo @feat:layers.z-ordering @level:happy", async ({
    page,
  }) => {
    const refs = await insertStack(page, 5);
    const keys = refs.map(key);
    // A transformed item among the deleted: its matrix must come back.
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: refs[1],
        path: "frameRotationAngle",
        value: { type: "length", value: 30 },
      },
    });
    const before = await geometry(page, refs);
    const structureBefore = await structure(page);
    expect(structureBefore).toBe(keys.join(","));

    await select(page, [refs[1], refs[3], refs[4]]);
    await invokeCommand(page, DELETE);
    await expect.poll(() => structure(page)).toBe([keys[0], keys[2]].join(","));

    // ONE undo — the three deletes rode a single engine batch.
    await undo(page);
    await expect.poll(() => structure(page)).toBe(structureBefore);
    expect(await geometry(page, refs)).toEqual(before);

    const again = await redo(page);
    expect(again.kind).not.toBe("mutationFailed");
    await expect.poll(() => structure(page)).toBe([keys[0], keys[2]].join(","));
    await undo(page);
    await expect.poll(() => structure(page)).toBe(structureBefore);
  });

  test("AC-OBJ-14 — a GROUP is deleted whole, nested groups included, and one undo brings it back under its own id @feat:frames-paths.frame.delete @feat:frames-paths.groups @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const [a, b, c, d] = await insertStack(page, 4);
    await select(page, [a, b]);
    await invokeCommand(page, GROUP);
    const inner = (await selection(page))[0];
    await select(page, [inner, c]);
    await invokeCommand(page, GROUP);
    const outer = (await selection(page))[0];
    expect(outer.kind).toBe("group");

    const structureBefore = await structure(page);
    expect(structureBefore).toBe(
      `${key(outer)}[${key(inner)}[${key(a)},${key(b)}],${key(c)}],${key(d)}`,
    );
    const before = await geometry(page, [a, b, c, d]);

    // `deleteFrame` refuses a group id outright, so the verb has to take
    // the group apart and remove its leaves — in one batch.
    await select(page, [outer]);
    await invokeCommand(page, DELETE);
    await expect.poll(() => structure(page)).toBe(key(d));
    expect(await selection(page)).toEqual([]);
    expect(await geometry(page, [d])).toEqual([before[3]]);

    // One undo: both groups are back, same ids, same members, same order.
    await undo(page);
    await expect.poll(() => structure(page)).toBe(structureBefore);
    expect(await geometry(page, [a, b, c, d])).toEqual(before);
  });

  test("AC-OBJ-15 — Backspace and Delete, pressed for real @feat:frames-paths.frame.delete @feat:editor-shell.keyboard-shortcuts @level:gesture", async ({
    page,
  }) => {
    const refs = await insertStack(page, 3);
    const keys = refs.map(key);

    await select(page, [refs[0]]);
    await page.keyboard.press("Backspace");
    await expect.poll(() => structure(page)).toBe([keys[1], keys[2]].join(","));

    await select(page, [refs[2]]);
    await page.keyboard.press("Delete");
    await expect.poll(() => structure(page)).toBe(keys[1]);

    // Nothing selected: the key is an honest no-op, not a stray delete.
    await expect.poll(() => selection(page)).toEqual([]);
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(150);
    expect(await structure(page)).toBe(keys[1]);

    // Each press was its own undo step.
    await undo(page);
    await expect.poll(() => structure(page)).toBe([keys[1], keys[2]].join(","));
    await undo(page);
    await expect.poll(() => structure(page)).toBe(keys.join(","));
  });

  test("AC-OBJ-16 — an engine refusal is surfaced in the engine's words, and nothing is half-deleted @feat:frames-paths.frame.delete @feat:frames-paths.nested-content @feat:editor-shell.panels.problems @level:edge", async ({
    page,
  }) => {
    await openPanel(page, "paged.problems");
    const [container, child, other] = await insertStack(page, 3);
    const pasted = await mutate(page, {
      op: "pasteInto",
      args: { containerId: container, childId: child },
    });
    expect(pasted.kind, "pasteInto should apply").toBe("mutationApplied");
    const structureBefore = await structure(page);

    // The pasted child AND a free item: the batch is atomic, so the
    // free one must survive the child's refusal.
    await forceSelection(page, [other, child]);
    await invokeCommand(page, DELETE);

    const problem = objectProblem(page);
    await expect(problem).toHaveCount(1);
    await expect(problem).toHaveAttribute("data-problem-severity", "error");
    await expect(problem.locator("[data-problem-message]")).toContainText(
      "Delete refused",
    );
    // The engine's own sentence, not a paraphrase.
    await expect(problem.locator("[data-problem-message]")).toContainText(
      "release it before removing",
    );
    expect(await structure(page)).toBe(structureBefore);
    expect(await geometry(page, [other])).toHaveLength(1);

    // An id the engine cannot resolve: refused the same way.
    await forceSelection(page, [{ kind: "rectangle", id: "u-does-not-exist" }]);
    await invokeCommand(page, DELETE);
    await expect(problem.locator("[data-problem-message]")).toContainText(
      "Delete refused",
    );
    expect(await structure(page)).toBe(structureBefore);

    // The next clean delete starts from a clean slate.
    await select(page, [other]);
    await invokeCommand(page, DELETE);
    await expect(problem).toHaveCount(0);
    await expect.poll(() => geometry(page, [other])).toEqual([]);
  });

  test("AC-OBJ-17 — one member of a group that stays is refused BEFORE the wire @feat:frames-paths.frame.delete @feat:frames-paths.groups @feat:editor-shell.panels.problems @level:edge", async ({
    page,
  }) => {
    await openPanel(page, "paged.problems");
    const [a, b, c] = await insertStack(page, 3);
    await select(page, [a, b]);
    await invokeCommand(page, GROUP);
    const groupRef = (await selection(page))[0];
    const structureBefore = await structure(page);
    expect(structureBefore).toBe(
      `${key(groupRef)}[${key(a)},${key(b)}],${key(c)}`,
    );

    await select(page, [a]);
    await invokeCommand(page, DELETE);

    const problem = objectProblem(page);
    await expect(problem).toHaveCount(1);
    await expect(problem.locator("[data-problem-message]")).toContainText(
      "Delete refused",
    );
    await expect(problem.locator("[data-problem-message]")).toContainText(
      `group ${groupRef.id}`,
    );
    // Untouched: the member is still there, still selected, and there
    // is nothing to undo — the document never changed.
    expect(await structure(page)).toBe(structureBefore);
    expect((await selection(page)).map(key)).toEqual([key(a)]);
  });

  test("AC-OBJ-18 — a delete that would re-seat ANOTHER group's members is undone and reported @feat:frames-paths.frame.delete @feat:frames-paths.groups @feat:round-tripping.undo-redo @feat:editor-shell.panels.problems @level:edge", async ({
    page,
  }) => {
    await openPanel(page, "paged.problems");
    // `older` is created BEFORE the group's members. Removing it shifts
    // their slots in the spread's rectangle list, and the engine does
    // not carry that shift into the group's member table.
    const [older, a, b, newer] = await insertStack(page, 4);
    await select(page, [a, b]);
    await invokeCommand(page, GROUP);
    const groupRef = (await selection(page))[0];
    const structureBefore = await structure(page);
    expect(structureBefore).toBe(
      `${key(older)},${key(groupRef)}[${key(a)},${key(b)}],${key(newer)}`,
    );
    const before = await geometry(page, [older, a, b, newer]);

    await select(page, [older]);
    await invokeCommand(page, DELETE);

    // The document is exactly as it was — `older` included.
    await expect.poll(() => structure(page)).toBe(structureBefore);
    expect(await geometry(page, [older, a, b, newer])).toEqual(before);
    const problem = objectProblem(page);
    await expect(problem).toHaveCount(1);
    await expect(problem).toHaveAttribute("data-problem-severity", "error");
    await expect(problem.locator("[data-problem-message]")).toContainText(
      "Delete undone",
    );
    await expect(problem.locator("[data-problem-message]")).toContainText(
      `group ${groupRef.id}`,
    );
    // Still selected: nothing was deleted.
    expect((await selection(page)).map(key)).toEqual([key(older)]);

    // And Redo cannot bring the damage back: its entry was dropped.
    const again = await redo(page);
    expect(again.kind).toBe("mutationFailed");
    expect(await structure(page)).toBe(structureBefore);

    // An item created AFTER the members shifts nothing — it deletes.
    await select(page, [newer]);
    await invokeCommand(page, DELETE);
    await expect
      .poll(() => structure(page))
      .toBe(`${key(older)},${key(groupRef)}[${key(a)},${key(b)}]`);
    await expect(problem).toHaveCount(0);
  });

  test("AC-OBJ-19 — deleting an image frame says what undo will not bring back @feat:frames-paths.frame.delete @feat:round-tripping.undo-redo @feat:editor-shell.panels.problems @level:edge", async ({
    page,
  }) => {
    await openPanel(page, "paged.problems");
    const [frame] = await insertStack(page, 1);
    // A 1×1 PNG, inline — no fixture, no network.
    const placed = await mutate(page, {
      op: "placeImage",
      args: {
        elementId: frame.id,
        uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
      },
    });
    expect(placed.kind, "placeImage should apply").toBe("mutationApplied");
    expect((await geometry(page, [frame]))[0].hasImage).toBe(true);

    await select(page, [frame]);
    await invokeCommand(page, DELETE);
    await expect.poll(() => geometry(page, [frame])).toEqual([]);

    const problem = objectProblem(page);
    await expect(problem).toHaveCount(1);
    await expect(problem).toHaveAttribute("data-problem-severity", "info");
    await expect(problem.locator("[data-problem-message]")).toContainText(
      "placed image",
    );
  });
});

// ────────────────────────────────────────────────────────────── nudge

/** One nudgeable thing: what to select, and the leaves whose corners
 *  prove where it is. */
interface Subject {
  select: ElementRef[];
  leaves: ElementRef[];
}

const SUBJECTS: Array<{
  name: string;
  feat: string;
  make: (page: Page) => Promise<Subject>;
}> = [
  {
    name: "a rectangle",
    feat: "@feat:frames-paths.frame.move-op",
    make: async (page) => {
      const [r] = await insertStack(page, 1);
      return { select: [r], leaves: [r] };
    },
  },
  {
    name: "a ROTATED rectangle",
    feat: "@feat:frames-paths.frame.move-op @feat:editor-tools.rotate",
    make: async (page) => {
      const [r] = await insertStack(page, 1);
      const reply = await mutate(page, {
        op: "setElementProperty",
        args: {
          elementId: r,
          path: "frameRotationAngle",
          value: { type: "length", value: 30 },
        },
      });
      expect(reply.kind).toBe("mutationApplied");
      return { select: [r], leaves: [r] };
    },
  },
  {
    name: "a text frame",
    feat: "@feat:frames-paths.frame.move-op",
    make: async (page) => {
      const { frame } = await insertTextFrameWith(page, "Nudge me");
      return { select: [frame], leaves: [frame] };
    },
  },
  {
    name: "a line",
    feat: "@feat:frames-paths.frame.move-op @feat:frames-paths.line.insert",
    make: async (page) => {
      const reply = await mutate(page, {
        op: "insertLine",
        args: { pageId: await firstPageId(page), start: [60, 80], end: [180, 130] },
      });
      expect(reply.kind).toBe("mutationApplied");
      const line = reply.payload.createdId!;
      expect(line.kind).toBe("graphicLine");
      return { select: [line], leaves: [line] };
    },
  },
  {
    name: "a pen path",
    feat: "@feat:frames-paths.frame.move-op @feat:frames-paths.path.insert",
    make: async (page) => {
      const at = (x: number, y: number) => ({
        anchor: [x, y],
        left: [x, y],
        right: [x, y],
      });
      const reply = await mutate(page, {
        op: "insertPath",
        args: {
          pageId: await firstPageId(page),
          open: false,
          anchors: [at(200, 200), at(260, 200), at(230, 260)],
        },
      });
      expect(reply.kind).toBe("mutationApplied");
      const path = reply.payload.createdId!;
      expect(path.kind).toBe("polygon");
      return { select: [path], leaves: [path] };
    },
  },
  {
    name: "a group",
    feat: "@feat:frames-paths.frame.move-op @feat:frames-paths.groups",
    make: async (page) => {
      const [a, b] = await insertStack(page, 2);
      await select(page, [a, b]);
      await invokeCommand(page, GROUP);
      const groupRef = (await selection(page))[0];
      expect(groupRef.kind).toBe("group");
      return { select: [groupRef], leaves: [a, b] };
    },
  },
];

test.describe("E2E paged.object.nudge — against the real engine", () => {
  test.beforeEach(async ({ page }) => {
    await newBlankDocument(page);
  });

  for (const subject of SUBJECTS) {
    test(`AC-OBJ-20 — nudge moves ${subject.name} by exactly the step, Shift is ×10, and each step undoes @feat:editor-tools.move.translate ${subject.feat} @feat:round-tripping.undo-redo @level:happy`, async ({
      page,
    }) => {
      await openPanel(page, "paged.problems");
      const made = await subject.make(page);
      await select(page, made.select);
      const start = await geometry(page, made.leaves);
      expect(start).toHaveLength(made.leaves.length);

      // Four commands, and where the object must be after each: the
      // running sum, in spread points. (Up is NEGATIVE y.)
      const steps: Array<[string, number, number]> = [
        [NUDGE_RIGHT, 1, 0],
        [NUDGE_DOWN, 1, 1],
        [NUDGE_LEFT_LARGE, -9, 1],
        [NUDGE_UP_LARGE, -9, -9],
      ];
      for (const [command, dx, dy] of steps) {
        await invokeCommand(page, command);
        const now = await geometry(page, made.leaves);
        now.forEach((g, i) =>
          expectMovedBy(start[i], g, dx, dy, `${command} ${g.key}`),
        );
      }
      // Nothing was refused along the way, and the selection is intact.
      await expect(objectProblem(page)).toHaveCount(0);
      expect((await selection(page)).map(key)).toEqual(made.select.map(key));

      // Each command was ONE undo step: walk them back one at a time.
      const back: Array<[number, number]> = [
        [-9, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ];
      for (const [dx, dy] of back) {
        await undo(page);
        const now = await geometry(page, made.leaves);
        now.forEach((g, i) =>
          expectMovedBy(start[i], g, dx, dy, `undo to (${dx},${dy}) ${g.key}`),
        );
      }
      // The four undos took nothing else with them.
      expect(await geometry(page, made.leaves)).toHaveLength(made.leaves.length);
    });
  }

  test("AC-OBJ-21 — a group moves through its OWN transform, and its union box follows @feat:editor-tools.move.translate @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    const [a, b] = await insertStack(page, 2);
    await select(page, [a, b]);
    await invokeCommand(page, GROUP);
    const groupRef = (await selection(page))[0];

    const boxBefore = (await property(page, groupRef, "frameBounds")) as number[];
    expect(await property(page, groupRef, "frameTransform")).toBeNull();

    await invokeCommand(page, NUDGE_RIGHT_LARGE);
    await invokeCommand(page, NUDGE_DOWN);

    // The group's stored matrix carries the move (what IDML export
    // writes), and the union box — `[top, left, bottom, right]` in
    // spread space — is exactly 10 right and 1 down.
    expect(await property(page, groupRef, "frameTransform")).toEqual([
      1, 0, 0, 1, 10, 1,
    ]);
    const boxAfter = (await property(page, groupRef, "frameBounds")) as number[];
    expect(boxAfter[0]).toBeCloseTo(boxBefore[0] + 1, 3);
    expect(boxAfter[1]).toBeCloseTo(boxBefore[1] + 10, 3);
    expect(boxAfter[2]).toBeCloseTo(boxBefore[2] + 1, 3);
    expect(boxAfter[3]).toBeCloseTo(boxBefore[3] + 10, 3);
  });

  test("AC-OBJ-22 — a mixed selection moves each thing ONCE, in one undo step @feat:editor-tools.move.translate @feat:frames-paths.groups @feat:round-tripping.undo-redo @level:edge", async ({
    page,
  }) => {
    const [a, b, free, still] = await insertStack(page, 4);
    await select(page, [a, b]);
    await invokeCommand(page, GROUP);
    const groupRef = (await selection(page))[0];
    const all = [a, b, free, still];
    const start = await geometry(page, all);

    // The group, one of its OWN members, and a free item. The member
    // is carried by the group's move — moving it as well would put it
    // 20 pt away instead of 10.
    await select(page, [groupRef, a, free]);
    await invokeCommand(page, NUDGE_RIGHT_LARGE);
    const moved = await geometry(page, all);
    expectMovedBy(start[0], moved[0], 10, 0, "member a");
    expectMovedBy(start[1], moved[1], 10, 0, "member b");
    expectMovedBy(start[2], moved[2], 10, 0, "free");
    // …and what was not selected did not move.
    expect(moved[3]).toEqual(start[3]);

    await undo(page);
    expect(await geometry(page, all)).toEqual(start);
  });

  test("AC-OBJ-23 — the arrow keys, pressed for real, with Shift for ×10 @feat:editor-tools.move.translate @feat:editor-shell.keyboard-shortcuts @level:gesture", async ({
    page,
  }) => {
    const [r, other] = await insertStack(page, 2);
    await select(page, [r]);
    const [start] = await geometry(page, [r]);
    const [otherStart] = await geometry(page, [other]);
    const at = async () => (await geometry(page, [r]))[0];
    const offset = async () => {
      const now = corners(await at());
      const from = corners(start);
      return [
        Math.round((now[0][0] - from[0][0]) * 1000) / 1000,
        Math.round((now[0][1] - from[0][1]) * 1000) / 1000,
      ];
    };

    await page.keyboard.press("ArrowRight");
    await expect.poll(offset).toEqual([1, 0]);
    await page.keyboard.press("ArrowDown");
    await expect.poll(offset).toEqual([1, 1]);
    await page.keyboard.press("Shift+ArrowLeft");
    await expect.poll(offset).toEqual([-9, 1]);
    await page.keyboard.press("Shift+ArrowUp");
    await expect.poll(offset).toEqual([-9, -9]);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(offset).toEqual([-10, -9]);
    await page.keyboard.press("ArrowUp");
    await expect.poll(offset).toEqual([-10, -10]);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    await expect.poll(offset).toEqual([0, 0]);
    expectMovedBy(start, await at(), 0, 0, "back where it started");

    // The neighbour never moved, and the selection chrome was re-read
    // from the engine — the handles sit on the object, not where it was.
    expect((await geometry(page, [other]))[0]).toEqual(otherStart);
    await page.keyboard.press("ArrowRight");
    await expect.poll(offset).toEqual([1, 0]);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __canvas: {
                  elementGeometry: Array<{ itemTransform?: number[] | null }>;
                };
              }
            ).__canvas.elementGeometry[0]?.itemTransform ?? null,
        ),
      )
      .toEqual((await at()).transform);
  });
});

// ─────────────────────────────────────────────────────── on canvas
//
// The model moving is half the claim. These verbs ride plain mutations
// (not a gesture, whose preview repaints as it goes), so the page has
// to repaint off the mutation alone — and undo has to put back exactly
// the pixels that were there.

test.describe("E2E paged.object — delete and nudge land on the canvas", () => {
  test.beforeEach(async ({ page }) => {
    await newBlankDocument(page);
  });

  /** The page at ONE PIXEL PER POINT, so a step in points is the same
   *  number of pixels and the assertions below can be exact. */
  async function shot(page: Page): Promise<Buffer> {
    const { pageId, widthPt } = await page.evaluate(() => {
      const h = (
        globalThis as unknown as {
          __canvas: { handle: { pageIds: string[]; pageSizesPt: number[][] } };
        }
      ).__canvas.handle;
      return { pageId: h.pageIds[0], widthPt: h.pageSizesPt[0][0] };
    });
    expect(Number.isInteger(widthPt), "a whole-point page width").toBe(true);
    return pagePng(page, pageId, widthPt, widthPt);
  }

  test("AC-OBJ-29 — a nudge repaints the object one step along, and undo is pixel-identical @feat:editor-tools.move.translate @feat:frames-paths.frame.move-op @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    // A solid black rectangle: every pixel that changes is its edge.
    const pageId = await firstPageId(page);
    const made = await mutate(page, {
      op: "insertFrame",
      args: { pageId, bounds: [100, 100, 200, 300] },
    });
    const rectRef = made.payload.createdId!;
    const filled = await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: rectRef,
        path: "frameFillColor",
        value: { type: "colorRef", value: "Color/Black" },
      },
    });
    expect(filled.kind, "the fill should apply").toBe("mutationApplied");
    const base = await shot(page);

    await select(page, [rectRef]);
    await invokeCommand(page, NUDGE_RIGHT_LARGE);
    const moved = await shot(page);
    const diff = diffPngPixels(base, moved);
    expect(diff.changed, "the page repainted").toBeGreaterThan(0);
    // A 10 pt move to the right changes two vertical strips and nothing
    // else: the 10 pt the rectangle left behind (x 100→110) and the
    // 10 pt it moved into (x 300→310), over its full height (y 100→200).
    expect(diff.bbox).not.toBeNull();
    const bbox = diff.bbox!;
    expect(bbox.x0).toBeGreaterThanOrEqual(99);
    expect(bbox.x0).toBeLessThanOrEqual(101);
    expect(bbox.x1).toBeGreaterThanOrEqual(309);
    expect(bbox.x1).toBeLessThanOrEqual(311);
    expect(bbox.y0).toBeGreaterThanOrEqual(99);
    expect(bbox.y1).toBeLessThanOrEqual(201);
    // Two 10 × 100 pt strips, give or take the anti-aliased edges —
    // the same rectangle 10 pt along, not a different rectangle.
    const strips = 2 * 10 * 100;
    expect(diff.changed).toBeGreaterThan(strips * 0.9);
    expect(diff.changed).toBeLessThan(strips * 1.1);

    await undo(page);
    expect(diffPngPixels(base, await shot(page)).changed).toBe(0);
  });

  /** Dark pixels per row — where the ink is, top to bottom. */
  function inkRows(png: Buffer): number[] {
    const img = PNG.sync.read(png);
    const rows: number[] = [];
    for (let y = 0; y < img.height; y += 1) {
      let dark = 0;
      for (let x = 0; x < img.width; x += 1) {
        if (img.data[(y * img.width + x) * 4] < 128) dark += 1;
      }
      rows.push(dark);
    }
    return rows;
  }

  // Three things drawn from something OTHER than their box: a text
  // frame (no fill, no stroke — the only ink is its text), a line and a
  // pen path (drawn from their anchors). A move that shifted the box
  // and left the content behind would change nothing on the page — and
  // for the line and the path that is precisely what the engine's own
  // drag does (AC-OBJ-ENGINE-4).
  const INKED: Array<{
    name: string;
    feat: string;
    make: (page: Page) => Promise<ElementRef>;
  }> = [
    {
      name: "a text frame takes its TEXT",
      feat: "@feat:editor-tools.text.caret-typing",
      make: async (page) => (await insertTextFrameWith(page, "Nudge me")).frame,
    },
    {
      name: "a line takes its STROKE",
      feat: "@feat:frames-paths.line.insert",
      make: async (page) =>
        (
          await mutate(page, {
            op: "insertLine",
            args: {
              pageId: await firstPageId(page),
              start: [100, 400],
              end: [300, 460],
            },
          })
        ).payload.createdId!,
    },
    {
      name: "a pen path takes its OUTLINE",
      feat: "@feat:frames-paths.path.insert",
      make: async (page) => {
        const at = (x: number, y: number) => ({
          anchor: [x, y],
          left: [x, y],
          right: [x, y],
        });
        return (
          await mutate(page, {
            op: "insertPath",
            args: {
              pageId: await firstPageId(page),
              open: false,
              anchors: [at(350, 400), at(450, 400), at(400, 480)],
            },
          })
        ).payload.createdId!;
      },
    },
  ];

  for (const inked of INKED) {
    test(`AC-OBJ-30 — nudged, ${inked.name} with it @feat:editor-tools.move.translate @feat:frames-paths.frame.move-op ${inked.feat} @level:happy`, async ({
      page,
    }) => {
      const ref = await inked.make(page);
      const base = await shot(page);
      const before = inkRows(base);
      expect(before.some((n) => n > 0), "there is ink on the page").toBe(true);

      await select(page, [ref]);
      await invokeCommand(page, NUDGE_DOWN_LARGE);
      await invokeCommand(page, NUDGE_DOWN_LARGE);
      const moved = await shot(page);
      expect(diffPngPixels(base, moved).changed).toBeGreaterThan(0);

      // Same ink, 20 pt lower: the moved page's row profile is the
      // baseline's, shifted down exactly 20 pixels.
      const after = inkRows(moved);
      expect(after.slice(20)).toEqual(before.slice(0, before.length - 20));

      await undo(page);
      await undo(page);
      expect(diffPngPixels(base, await shot(page)).changed).toBe(0);
    });
  }

  test("AC-OBJ-31 — a deleted object leaves the page as it was before it existed, and undo repaints it @feat:frames-paths.frame.delete @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const empty = await shot(page);
    const pageId = await firstPageId(page);
    const made = await mutate(page, {
      op: "insertFrame",
      args: { pageId, bounds: [100, 100, 200, 300] },
    });
    const rectRef = made.payload.createdId!;
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: rectRef,
        path: "frameFillColor",
        value: { type: "colorRef", value: "Color/Black" },
      },
    });
    const withRect = await shot(page);
    expect(diffPngPixels(empty, withRect).changed).toBeGreaterThan(0);

    await select(page, [rectRef]);
    await invokeCommand(page, DELETE);
    expect(diffPngPixels(empty, await shot(page)).changed).toBe(0);

    // The fill is one of the things the engine's undo record keeps.
    await undo(page);
    expect(diffPngPixels(withRect, await shot(page)).changed).toBe(0);
  });
});

// ───────────────────────────────────────────────── who owns the key

test.describe("E2E paged.object — the keys belong to whoever is being edited", () => {
  test.beforeEach(async ({ page }) => {
    await newBlankDocument(page);
  });

  test("AC-OBJ-24 — with a text caret, Backspace takes a CHARACTER and the arrows move the CARET; the frame stays @feat:editor-tools.text.caret-typing @feat:frames-paths.frame.delete @feat:editor-shell.keyboard-shortcuts @level:edge", async ({
    page,
  }) => {
    const { frame, storyId } = await insertTextFrameWith(page, "Hello");
    await select(page, [frame]);
    const [start] = await geometry(page, [frame]);
    expect(await characterCount(page, storyId)).toBe(5);

    // The frame is the element selection AND a caret sits in its text —
    // exactly the state after clicking into a frame with the Type tool.
    await setCaret(page, { storyId, start: 5, end: 5 });

    await page.keyboard.press("Backspace");
    await expect.poll(() => characterCount(page, storyId)).toBe(4);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Delete");
    await expect.poll(() => characterCount(page, storyId)).toBe(3);
    // The frame is still there, and it has not moved a point.
    expect(await geometry(page, [frame])).toEqual([start]);

    // The COMMAND is gated too — the palette and the menu run through
    // the same `when`, so "Delete" cannot be aimed at the frame while
    // the user is looking at its text.
    await invokeCommand(page, DELETE);
    await invokeCommand(page, NUDGE_RIGHT);
    expect(await geometry(page, [frame])).toEqual([start]);
    expect(await characterCount(page, storyId)).toBe(3);

    // Leave the text: the same keys act on the frame again.
    await setCaret(page, null);
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await geometry(page, [frame]))[0]?.transform ?? null)
      .toEqual([1, 0, 0, 1, 1, 0]);
    await page.keyboard.press("Backspace");
    await expect.poll(() => geometry(page, [frame])).toEqual([]);
  });

  test("AC-OBJ-25 — in a focused field, Backspace and the arrows edit the FIELD @feat:editor-shell.keyboard-shortcuts @feat:frames-paths.frame.delete @level:edge", async ({
    page,
  }) => {
    const [r] = await insertStack(page, 1);
    await select(page, [r]);
    const [start] = await geometry(page, [r]);

    // A plain text field with focus — what every panel input is.
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.id = "object-keys-probe";
      input.value = "abc";
      document.body.appendChild(input);
      input.focus();
      input.setSelectionRange(3, 3);
    });
    const field = page.locator("#object-keys-probe");
    await expect(field).toBeFocused();

    await page.keyboard.press("Backspace");
    await expect(field).toHaveValue("ab");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Delete");
    await expect(field).toHaveValue("a");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    // The selected frame was neither deleted nor moved.
    expect(await geometry(page, [r])).toEqual([start]);

    // Focus back on the document: the keys are the object's again.
    await page.evaluate(() => {
      document.getElementById("object-keys-probe")?.remove();
    });
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(async () => (await geometry(page, [r]))[0]?.transform ?? null)
      .toEqual([1, 0, 0, 1, 0, 1]);
  });

  test("AC-OBJ-26 — the Object menu lists the verbs with their keys, and the arrows that walk it do not nudge @feat:editor-shell.menus @feat:editor-shell.keyboard-shortcuts @feat:editor-tools.move.translate @level:gesture", async ({
    page,
  }) => {
    const [r] = await insertStack(page, 1);
    await select(page, [r]);
    const [start] = await geometry(page, [r]);

    await page.locator('[data-menu-trigger="Object"]').click();
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    // Discoverable where the other object verbs are, keys and all.
    await expect(
      menu.locator('[data-menu-accelerator="paged.object.delete"]'),
    ).toHaveText("⌫");
    await expect(
      menu.locator('[data-menu-accelerator="paged.object.nudgeLeft"]'),
    ).toHaveText("←");
    await expect(menu.getByRole("menuitem", { name: /^Delete/ })).toBeEnabled();

    // Walking the open menu is the menu's business.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    expect(await geometry(page, [r])).toEqual([start]);

    // Choosing the row runs the verb.
    await menu.getByRole("menuitem", { name: /^Nudge right/ }).click();
    await expect
      .poll(async () => (await geometry(page, [r]))[0]?.transform ?? null)
      .toEqual([1, 0, 0, 1, 1, 0]);
    await expect(menu).toBeHidden();

    // With a caret in text the rows grey: the verb is aimed at the
    // object, and the user is not looking at the object.
    const { storyId } = await insertTextFrameWith(page, "x");
    await setCaret(page, { storyId, start: 0, end: 0 });
    await page.locator('[data-menu-trigger="Object"]').click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^Delete/ })).toBeDisabled();
    await expect(
      menu.getByRole("menuitem", { name: /^Nudge left/ }),
    ).toBeDisabled();
  });

  test("AC-OBJ-27 — in path-edit mode Backspace is the anchor's key, not the frame's @feat:editor-tools.path.direct-edit @feat:frames-paths.frame.delete @feat:editor-shell.keyboard-shortcuts @level:edge", async ({
    page,
  }) => {
    const [r] = await insertStack(page, 1);
    await select(page, [r]);
    const [start] = await geometry(page, [r]);

    // Enter on a single path-bearing selection enters path-edit mode
    // (`usePathEditMode`). With no anchor picked, Backspace does
    // nothing there — and it must not fall through to the frame.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Delete");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    expect(await geometry(page, [r])).toEqual([start]);

    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
    await expect.poll(() => geometry(page, [r])).toEqual([]);
  });

  test("AC-OBJ-28 — with the Page tool in hand, Backspace is the page's key @feat:editor-tools.page-tool @feat:frames-paths.frame.delete @feat:editor-shell.keyboard-shortcuts @level:edge", async ({
    page,
  }) => {
    const [r] = await insertStack(page, 1);
    await select(page, [r]);
    const [start] = await geometry(page, [r]);

    await invokeCommand(page, "paged.tool.activate.paged.tool.page");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(200);
    expect(await geometry(page, [r])).toEqual([start]);

    await invokeCommand(page, "paged.tool.activate.paged.tool.select");
    // Switching tools must not have dropped the selection under test.
    await select(page, [r]);
    await page.keyboard.press("Backspace");
    await expect.poll(() => geometry(page, [r])).toEqual([]);
  });
});

// ───────────────────────────────────────────────── engine anchors
//
// Four things the ENGINE does that `paged.object.delete` and `.nudge*`
// are built around. Each test asserts the behaviour a user would expect and is
// marked `test.fail`, so it is green while the defect stands and turns
// RED the day core fixes it — which is the signal to delete the
// matching workaround (docs/engine-findings.md §10–§12, §14). They drive the
// wire directly: the host verb would refuse or revert before the
// defect could show.

test.describe("E2E engine anchors — what paged.object.* works around", () => {
  test.beforeEach(async ({ page }) => {
    await newBlankDocument(page);
  });

  test("AC-OBJ-ENGINE-1 — deleteFrame of an OLDER same-kind item leaves a group's members alone @feat:frames-paths.frame.delete @feat:frames-paths.groups @level:edge", async ({
    page,
  }) => {
    test.fail(
      true,
      "engine-findings §10: RemoveNode does not renumber Group::members",
    );
    const [older, a, b, bystander] = await insertStack(page, 4);
    const grouped = await mutate(page, {
      op: "createGroup",
      args: { memberIds: [a, b] },
    });
    const groupRef = grouped.payload.createdId!;
    const reply = await mutate(page, {
      op: "deleteFrame",
      args: { frameId: older.id },
    });
    expect(reply.kind).toBe("mutationApplied");
    // Today: `group[b, bystander], bystander` — a fell out, and an
    // unrelated frame was pulled in.
    expect(await structure(page)).toBe(
      `${key(groupRef)}[${key(a)},${key(b)}],${key(bystander)}`,
    );
  });

  test("AC-OBJ-ENGINE-2 — undo of a delete restores the frame's formatting and its image @feat:frames-paths.frame.delete @feat:round-tripping.undo-redo @level:edge", async ({
    page,
  }) => {
    test.fail(
      true,
      "engine-findings §11: NodeSpec captures geometry, fill and stroke only",
    );
    const [frame] = await insertStack(page, 1);
    const set = (path: string, value: unknown) =>
      mutate(page, {
        op: "setElementProperty",
        args: { elementId: frame, path, value },
      });
    expect((await set("frameOpacity", { type: "length", value: 40 })).kind).toBe(
      "mutationApplied",
    );
    expect(
      (await set("frameCornerRadiusTopLeft", { type: "length", value: 12 })).kind,
    ).toBe("mutationApplied");
    expect(await property(page, frame, "frameOpacity")).toBe(40);

    await mutate(page, { op: "deleteFrame", args: { frameId: frame.id } });
    await undo(page);
    // Today both read `null`: the frame comes back bare.
    expect(await property(page, frame, "frameOpacity")).toBe(40);
    expect(await property(page, frame, "frameCornerRadiusTopLeft")).toBe(12);
  });

  test("AC-OBJ-ENGINE-4 — the engine's own translate gesture repaints a dragged LINE @feat:editor-tools.move.translate @feat:frames-paths.line.insert @level:edge", async ({
    page,
  }) => {
    test.fail(
      true,
      "engine-findings §14: an un-rotated line's drag moves its box, not its anchors",
    );
    const pageId = await firstPageId(page);
    const line = (
      await mutate(page, {
        op: "insertLine",
        args: { pageId, start: [100, 400], end: [300, 460] },
      })
    ).payload.createdId!;
    const widthPt = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: { handle: { pageSizesPt: number[][] } };
          }
        ).__canvas.handle.pageSizesPt[0][0],
    );
    const base = await pagePng(page, pageId, widthPt, widthPt);
    await page.evaluate(async (id) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              beginGesture: (n: unknown[], g: unknown, a: null) => Promise<number>;
              updateGesture: (h: number, d: number[], m: unknown) => Promise<unknown>;
              commitGesture: (h: number) => Promise<unknown>;
            };
          };
        }
      ).__canvas.client;
      const handle = await c.beginGesture([id], { kind: "translate" }, null);
      await c.updateGesture(handle, [40, 20], {
        shift: false,
        alt: false,
        disableSnap: true,
      });
      await c.commitGesture(handle);
    }, line);
    // Today: 0 — the committed drag paints the line where it started.
    // This is why nudge does not copy what the gesture commits.
    expect(
      diffPngPixels(base, await pagePng(page, pageId, widthPt, widthPt)).changed,
    ).toBeGreaterThan(0);
  });

  test("AC-OBJ-ENGINE-3 — deleting a container takes what was pasted into it @feat:frames-paths.frame.delete @feat:frames-paths.nested-content @level:edge", async ({
    page,
  }) => {
    test.fail(
      true,
      "engine-findings §12: the pasted child is released to the top level instead",
    );
    const [container, child] = await insertStack(page, 2);
    await mutate(page, {
      op: "pasteInto",
      args: { containerId: container, childId: child },
    });
    expect(await structure(page)).toBe(key(container));
    await mutate(page, { op: "deleteFrame", args: { frameId: container.id } });
    // Today the child reappears as a free top-level item.
    expect(await structure(page)).toBe("");
  });
});
