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

// Step 4 — shell-owned built-in commands. Registered automatically
// from ShellChrome so every app gets the palette toggle + panel
// toggles without writing them itself.

import { notifyPalette } from "../../chrome/CommandPalette";
import { cockpitActions } from "../../cockpit/cockpit-state-context";
import type { PanelContribution, CommandContribution } from "../../registries";

export const PAGED_PALETTE_TOGGLE = "paged.palette.toggle";

/**
 * Toggles the command palette. Bound to Cmd+K via the keybinding
 * registry; can also be invoked from a menu or programmatically.
 */
export const PALETTE_TOGGLE_COMMAND: CommandContribution = {
  id: PAGED_PALETTE_TOGGLE,
  title: "Toggle command palette",
  category: "View",
  handler: () => {
    notifyPalette("toggle");
  },
};

/**
 * Shorthand for the keybinding contribution that routes Cmd+K
 * (and Ctrl+K on non-Mac) to the palette-toggle command.
 */
export const PALETTE_TOGGLE_KEYBINDING = {
  key: "cmd+k",
  command: PAGED_PALETTE_TOGGLE,
} as const;

/**
 * Same as above for non-Mac platforms — `cmd` aliases `meta` so
 * the macOS form covers the Cmd key; this entry covers Ctrl+K on
 * Linux / Windows. Both are registered so either modifier works
 * regardless of platform.
 */
export const PALETTE_TOGGLE_KEYBINDING_CTRL = {
  key: "ctrl+k",
  command: PAGED_PALETTE_TOGGLE,
} as const;

/**
 * Build a show/hide command pair for a panel contribution. The
 * cockpit owns panel placement: show opens the panel as the active
 * right-dock tab, hide closes that tab.
 *
 * IDs follow `paged.panel.show.{id}` / `.hide.{id}` so bundles can
 * bind keybindings to a panel toggle without depending on the
 * layout implementation.
 */
export function buildPanelToggleCommands(
  panel: PanelContribution,
): [CommandContribution, CommandContribution] {
  const show: CommandContribution = {
    id: `paged.panel.show.${panel.id}`,
    title: `Show: ${panel.title}`,
    category: "View",
    handler: () => {
      cockpitActions.openPanel?.(panel.id);
    },
  };
  const hide: CommandContribution = {
    id: `paged.panel.hide.${panel.id}`,
    title: `Hide: ${panel.title}`,
    category: "View",
    handler: () => {
      cockpitActions.closeTab?.(panel.id);
    },
  };
  return [show, hide];
}
