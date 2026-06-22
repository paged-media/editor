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

// Concept 1 (T5) — tool single-key shortcuts, registered as a CLASS
// with one shared text-suppression guard, plus the screen-mode `W`
// key. Each tool's shortcut activates `paged.tool.activate.<id>`;
// every binding carries `contentSelectionInactive` so typing in a
// story never switches tools (the canonical "typing v switches tool"
// regression). Group cycling, Tab/Shift+Tab, Escape→cancel, and the
// X/D fill-stroke keys land with the gesture spine (Phase 2) and the
// fill/stroke cluster (Phase 4) respectively.

import type { CommandContribution } from "../../registries/command";
import type { KeybindingContribution } from "../../registries/keybinding";
import type { ToolContribution } from "../../registries/tool";
import type { VisibilityPredicate } from "../../registries/types";
import type { PagedEditor } from "../paged-editor";

export const TOOL_ACTIVATE_COMMAND_PREFIX = "paged.tool.activate.";
export const SCREEN_PREVIEW_TOGGLE_COMMAND = "paged.view.toggleScreenPreview";

/**
 * The class-wide guard: a tool single-key shortcut is inert while a
 * text caret is active. Reads the live editor handle supplied to the
 * KeybindingRegistry as its state thunk.
 */
export const contentSelectionInactive: VisibilityPredicate = (state) => {
  const editor = state as PagedEditor | null;
  return editor?.contentSelection?.contentSelection == null;
};

export interface ToolbarContributions {
  commands: CommandContribution[];
  keybindings: KeybindingContribution[];
}

/**
 * Build the activation command + guarded keybinding for every tool
 * with a shortcut, plus the `W` screen-preview toggle. Caller
 * registers the result against the command + keybinding registries
 * and disposes on unmount.
 */
export function buildToolbarContributions(
  tools: ToolContribution[],
): ToolbarContributions {
  const commands: CommandContribution[] = [];
  const keybindings: KeybindingContribution[] = [];

  for (const tool of tools) {
    const command = TOOL_ACTIVATE_COMMAND_PREFIX + tool.id;
    commands.push({
      id: command,
      title: `Tool: ${tool.title}`,
      category: "Tools",
      icon: tool.icon,
      handler: (paged) => {
        (paged as PagedEditor).tool.setBaseTool(tool.id);
      },
    });
    if (tool.shortcut) {
      keybindings.push({
        key: tool.shortcut,
        command,
        when: contentSelectionInactive,
      });
    }
  }

  // `W` — toggle Normal ⇄ Preview, text-suppressed like tool shortcuts.
  commands.push({
    id: SCREEN_PREVIEW_TOGGLE_COMMAND,
    title: "Toggle preview screen mode",
    category: "View",
    handler: (paged) => {
      (paged as PagedEditor).screenMode.togglePreview();
    },
  });
  keybindings.push({
    key: "w",
    command: SCREEN_PREVIEW_TOGGLE_COMMAND,
    when: contentSelectionInactive,
  });

  return { commands, keybindings };
}
