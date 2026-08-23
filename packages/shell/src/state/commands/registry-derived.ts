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

// B-15 host-side fix (decision Q13, 2026-06-06) — derive tool
// activation commands/shortcuts and panel show/hide commands from
// the REGISTRIES, not the startup props. Anything that registers a
// tool or panel — built-in seed, bundle `activate`, future loader —
// gets the identical treatment, live: register → derived
// contributions appear; dispose → they vanish. This is registry
// SEMANTICS (what M3 freezes), replacing the startup-only wart the
// SDK had to work around bundle-side.

import type { Disposable } from "../../registries/types";
import type { PanelContribution } from "../../registries/panel";
import type { ToolContribution } from "../../registries/tool";
import type { ShellRegistries } from "../registries-context";
import type { PagedEditor } from "../paged-editor";

import { buildPanelToggleCommands } from "./built-in-commands";
import {
  contentSelectionInactive,
  TOOL_ACTIVATE_COMMAND_PREFIX,
} from "./tool-commands";

/**
 * Install the derivations over the current registry contents and
 * keep them in sync via `onChange`. Returns one Disposable that
 * tears down every derived contribution + both subscriptions.
 */
export function installRegistryDerivedContributions(
  registries: ShellRegistries,
): Disposable {
  const perTool = new Map<string, Disposable[]>();
  const perPanel = new Map<string, Disposable[]>();

  const addTool = (tool: ToolContribution) => {
    if (perTool.has(tool.id)) return;
    // Honest stubs contribute NOTHING executable — no activation
    // command (a command-palette entry that silently does nothing is
    // the same lie as an inert rail slot) and no keybinding. A
    // `shortcut` on a planned tool is an INV-REG-1 reservation, not a
    // binding; see `ToolStatus`. Applies to bundle tools too.
    if (tool.status === "planned") return;
    const ds: Disposable[] = [];
    const command = TOOL_ACTIVATE_COMMAND_PREFIX + tool.id;
    ds.push(
      registries.commands.register({
        id: command,
        title: `Tool: ${tool.title}`,
        category: "Tools",
        icon: tool.icon,
        handler: (paged) => {
          (paged as PagedEditor).tool.setBaseTool(tool.id);
        },
      }),
    );
    if (tool.shortcut) {
      ds.push(
        registries.keybindings.register({
          key: tool.shortcut,
          command,
          when: contentSelectionInactive,
        }),
      );
    }
    perTool.set(tool.id, ds);
  };

  const addPanel = (panel: PanelContribution) => {
    if (perPanel.has(panel.id)) return;
    const [show, hide] = buildPanelToggleCommands(panel);
    perPanel.set(panel.id, [
      registries.commands.register(show),
      registries.commands.register(hide),
    ]);
  };

  const drop = (map: Map<string, Disposable[]>, id: string) => {
    const ds = map.get(id);
    if (!ds) return;
    map.delete(id);
    for (const d of ds) d.dispose();
  };

  for (const tool of registries.tools.list()) addTool(tool);
  for (const panel of registries.panels.list()) addPanel(panel);

  const offTools = registries.tools.onChange((e) => {
    if (e.kind === "registered") addTool(e.contribution);
    else drop(perTool, e.id);
  });
  const offPanels = registries.panels.onChange((e) => {
    if (e.kind === "registered") addPanel(e.contribution);
    else drop(perPanel, e.id);
  });

  return {
    dispose() {
      offTools.dispose();
      offPanels.dispose();
      for (const id of [...perTool.keys()]) drop(perTool, id);
      for (const id of [...perPanel.keys()]) drop(perPanel, id);
    },
  };
}
