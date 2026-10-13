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

// Registry invariants (decision Q14, 2026-06-06) — the lint that
// keeps built-in and bundle contributions coherent after the W2.5
// division of labor (built-in Pen authors paths; the paged.draw
// bundle contributes the anchor-editing companions in the same
// slot). Asserts over the LIVE registries after boot — built-ins,
// loadBundle contributions, everything:
//
//   INV-REG-1  no two tools claim the same single-key shortcut, and a
//              tool shortcut that shares its key with any OTHER binding
//              is scoped: inside an edit context claiming the tool the
//              key arms the tool, everywhere else the other binding
//              keeps it (an unscoped tool may not share a key at all)
//   INV-REG-2  at most one isGroupDefault per flyout slot (group)
//   INV-REG-3  no duplicate keybindings (key+command pairs unique;
//              one key may fan out only to DIFFERENT guarded commands)
//
// This conflict class (two pens in one slot, duplicate "p") was hit
// once for real — it never reaches a human again.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";

interface ToolLite {
  id: string;
  shortcut?: string;
  group: string;
  isGroupDefault?: boolean;
}

async function snapshot(page: Page): Promise<{
  tools: ToolLite[];
  keybindings: { key: string; command: string }[];
}> {
  return page.evaluate(() => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            tools: { list: () => ToolLite[] };
            keybindings: {
              list: () => { key: string; command: string }[];
            };
          };
        };
      }
    ).__canvas;
    return {
      tools: c.registries.tools
        .list()
        .map(({ id, shortcut, group, isGroupDefault }) => ({
          id,
          shortcut,
          group,
          isGroupDefault,
        })),
      keybindings: c.registries.keybindings
        .list()
        .map(({ key, command }) => ({ key, command })),
    };
  });
}

test.describe("registry invariants (built-ins + bundles)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    // Bundles load in a mount effect; wait until their contributions
    // are present (the draw bundle's anchor tools are the sentinel).
    await expect
      .poll(
        () =>
          snapshot(page).then((s) =>
            s.tools.some((t) => t.id.startsWith("media.paged.draw.")),
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test("INV-REG-1 — tool shortcuts are unique @feat:editor-shell.tool-rail @level:happy", async ({ page }) => {
    const { tools } = await snapshot(page);
    const byShortcut = new Map<string, string[]>();
    for (const t of tools) {
      if (!t.shortcut) continue;
      const list = byShortcut.get(t.shortcut) ?? [];
      list.push(t.id);
      byShortcut.set(t.shortcut, list);
    }
    const dupes = [...byShortcut.entries()].filter(([, ids]) => ids.length > 1);
    expect(
      dupes,
      `duplicate tool shortcuts: ${dupes
        .map(([k, ids]) => `"${k}" → ${ids.join(", ")}`)
        .join("; ")}`,
    ).toEqual([]);
  });

  // IMG-3 — paged.image's healing brush and the fill/stroke cluster
  // both bind `j`, both guarded alike, so registration order (history)
  // chose: inside a raster frame J toggled formatting. Checked through
  // the registry's own dispatch rule, with the state each side needs.
  test("INV-REG-1 — a tool shortcut never collides unscoped with another binding @feat:editor-shell.tool-rail @level:edge", async ({
    page,
  }) => {
    const problems = await page.evaluate(() => {
      type Kb = { key: string; command: string; when?: (s: unknown) => boolean };
      type Ev = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean };
      const r = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              tools: { list: () => Array<{ id: string; shortcut?: string; status?: string }> };
              editContexts: { list: () => Array<{ type: string; toolIds?: string[] }> };
              keybindings: {
                list: () => Kb[];
                resolve: (e: Ev, state?: unknown) => Kb | null;
              };
            };
          };
        }
      ).__canvas.registries;
      const eventFor = (combo: string): Ev => {
        const parts = combo.toLowerCase().split("+");
        const key = parts.pop()!;
        const has = (...m: string[]) => parts.some((p) => m.includes(p));
        return {
          key,
          metaKey: has("cmd", "meta"),
          ctrlKey: has("ctrl", "control"),
          altKey: has("alt", "option"),
          shiftKey: has("shift"),
        };
      };
      // No caret: the state every single-key binding is guarded on.
      const base = { contentSelection: { contentSelection: null } };
      const out: string[] = [];
      const bindings = r.keybindings.list();
      for (const tool of r.tools.list()) {
        if (!tool.shortcut || tool.status === "planned") continue;
        const own = `paged.tool.activate.${tool.id}`;
        const key = tool.shortcut.toLowerCase();
        const others = bindings.filter(
          (b) => b.key.toLowerCase() === key && b.command !== own,
        );
        if (others.length === 0) continue;
        const claiming = r.editContexts
          .list()
          .filter((c) => c.toolIds?.includes(tool.id));
        if (claiming.length === 0) {
          out.push(
            `"${key}": ${tool.id} shares its key with ${others.map((o) => o.command).join(", ")} and no edit context scopes it`,
          );
          continue;
        }
        const ev = eventFor(key);
        for (const c of claiming) {
          const won = r.keybindings.resolve(ev, {
            ...base,
            editContext: { type: c.type, toolIds: c.toolIds },
          });
          if (won?.command !== own) {
            out.push(`inside ${c.type}, "${key}" fires ${won?.command ?? "nothing"}, not ${tool.id}`);
          }
        }
        const outside = { ...base, editContext: null };
        const live = others.filter((o) => {
          try {
            return o.when ? Boolean(o.when(outside)) : true;
          } catch {
            return false;
          }
        });
        const won = r.keybindings.resolve(ev, outside);
        if (live.length > 0 && won?.command === own) {
          out.push(`outside its frame, "${key}" arms ${tool.id} over ${live.map((o) => o.command).join(", ")}`);
        }
      }
      return out;
    });
    expect(problems, problems.join("; ")).toEqual([]);
  });

  test("INV-REG-2 — one group default per flyout slot @feat:editor-shell.tool-rail @level:happy", async ({ page }) => {
    const { tools } = await snapshot(page);
    const defaults = new Map<string, string[]>();
    for (const t of tools) {
      if (!t.isGroupDefault) continue;
      const list = defaults.get(t.group) ?? [];
      list.push(t.id);
      defaults.set(t.group, list);
    }
    const dupes = [...defaults.entries()].filter(([, ids]) => ids.length > 1);
    expect(
      dupes,
      `multiple isGroupDefault in slot: ${dupes
        .map(([g, ids]) => `"${g}" → ${ids.join(", ")}`)
        .join("; ")}`,
    ).toEqual([]);
  });

  test("INV-REG-3 — keybindings are unique per key+command @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    const { keybindings } = await snapshot(page);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const kb of keybindings) {
      const sig = `${kb.key}→${kb.command}`;
      if (seen.has(sig)) dupes.push(sig);
      seen.add(sig);
    }
    expect(dupes, `duplicate keybindings: ${dupes.join("; ")}`).toEqual([]);
  });
});
