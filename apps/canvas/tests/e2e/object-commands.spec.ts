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

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";

const BRING_TO_FRONT = "paged.object.bringToFront";
const BRING_FORWARD = "paged.object.bringForward";
const SEND_BACKWARD = "paged.object.sendBackward";
const SEND_TO_BACK = "paged.object.sendToBack";
const GROUP = "paged.object.group";
const UNGROUP = "paged.object.ungroup";
const SELECT_PARENT_GROUP = "paged.object.selectParentGroup";

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

test.describe("E2E paged.object — the structural command layer", () => {
  // File ▸ New through the real command path. A BLANK document is the
  // point: its stacking list holds exactly the frames this spec
  // inserts, so "bring forward" means "swap with the next one of MINE"
  // and every assertion is exact. Load a fixture instead and its own
  // page items sit in the same list — a step verb then walks past
  // furniture the assertion cannot see, which reads as "nothing moved"
  // and would pass a broken blocking rule.
  test.beforeEach(async ({ page }) => {
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
  });

  test("AC-OBJ-1 — all seven verbs are HOST commands under paged.object.* @feat:editor-shell.menus @feat:frames-paths.groups @feat:layers.z-ordering @level:smoke", async ({
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
