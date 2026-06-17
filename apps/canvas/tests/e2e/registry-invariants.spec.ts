// Registry invariants (decision Q14, 2026-06-06) — the lint that
// keeps built-in and bundle contributions coherent after the W2.5
// division of labor (built-in Pen authors paths; the paged.draw
// bundle contributes the anchor-editing companions in the same
// slot). Asserts over the LIVE registries after boot — built-ins,
// loadBundle contributions, everything:
//
//   INV-REG-1  no two tools claim the same single-key shortcut
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
