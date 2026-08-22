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

// E1 — Help ▸ Keyboard shortcuts.
//
// `Help` was the app's only offer to explain itself and BOTH its items
// were disabled `soon(...)` seams. Nothing anywhere listed a shortcut:
// the menus carried no accelerator column, the palette showed raw
// command ids, and `KeybindingRegistry.list()` — documented as existing
// "for diagnostics + the future 'Show keybindings' panel" — had zero
// call sites. A user who could not work something out had nowhere to
// look, in the app or out of it.
//
// Rendered from the LIVE registry rather than a hand-kept table, so it
// cannot drift: a binding that exists appears here, a binding that is
// removed disappears, and plugin bindings are listed the moment their
// bundle loads. The palette and the menu accelerators read the same
// source.
//
// THE HONEST LIMIT, stated in the panel itself rather than only here:
// roughly two dozen bindings never reach the registry. Undo/redo, zoom
// to fit and 100%, page navigation, caret motion and the spring-loaded
// tool holds are bound with ad-hoc `window`/`document` listeners in
// `useKeyboardShortcuts`, `useTextEditing`, `usePathEditMode` and
// `use-spring-loaded-tools`. A panel that silently omitted them would
// be a worse lie than the seam it replaces — it would look complete.
// They are listed from a maintained table below, and marked as such.

import { useMemo } from "react";

import {
  CockpitPanelHeader,
  CockpitSection,
  useRegistries,
  type PanelProps,
} from "@paged-media/shell";

export const KEYBOARD_SHORTCUTS_PANEL_ID = "paged.keyboard-shortcuts";

/** `cmd+shift+s` → `⌘⇧S`. Same formatting as the menus and the palette. */
function prettyKey(combo: string): string {
  const parts = combo.split("+");
  const key = parts.pop() ?? "";
  const mods = parts
    .map((m) =>
      m === "cmd" || m === "meta"
        ? "⌘"
        : m === "shift"
          ? "⇧"
          : m === "alt" || m === "option"
            ? "⌥"
            : m === "ctrl" || m === "control"
              ? "⌃"
              : m,
    )
    .join("");
  return `${mods}${key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)}`;
}

/** The bindings that bypass the KeybindingRegistry entirely.
 *
 *  Hand-maintained, and that is a liability worth naming: nothing fails
 *  when one of these is renamed. It is still far better than omitting
 *  them, because a user reading a shortcuts panel reasonably concludes
 *  that what is absent is unbound — and Cmd+Z is not unbound. */
const AD_HOC: { key: string; what: string; where: string }[] = [
  { key: "⌘Z", what: "Undo", where: "useTextEditing" },
  { key: "⌘⇧Z", what: "Redo", where: "useTextEditing" },
  { key: "⌘0", what: "Fit document", where: "useKeyboardShortcuts" },
  { key: "⌘1", what: "Zoom to 100%", where: "useKeyboardShortcuts" },
  { key: "Home", what: "First page", where: "useKeyboardShortcuts" },
  { key: "End", what: "Last page", where: "useKeyboardShortcuts" },
  { key: "PageUp", what: "Previous page", where: "useKeyboardShortcuts" },
  { key: "PageDown", what: "Next page", where: "useKeyboardShortcuts" },
  { key: "Space (hold)", what: "Pan — spring-loaded Hand", where: "use-spring-loaded-tools" },
  { key: "⌘Space (hold)", what: "Zoom — spring-loaded", where: "use-spring-loaded-tools" },
  { key: "⌘ (hold)", what: "Direct Selection — spring-loaded", where: "use-spring-loaded-tools" },
  { key: "Enter", what: "Enter path-edit mode", where: "usePathEditMode" },
  { key: "Esc", what: "Leave an edit context, or cancel a gesture", where: "edit-context-controller" },
  { key: "← → ↑ ↓", what: "Move the caret (with ⇧ to extend)", where: "useTextEditing" },
];

export function KeyboardShortcutsPanel(_props: PanelProps) {
  const { keybindings, commands } = useRegistries();

  const rows = useMemo(() => {
    const titles = new Map(commands.list().map((c) => [c.id, c.title]));
    // One row per COMMAND, collecting its keys: cmd+ and ctrl+ are
    // separate contributions for the same thing, and two rows saying
    // "Group" would read as two different commands.
    const byCommand = new Map<string, { keys: string[]; title: string }>();
    for (const b of keybindings.list()) {
      const entry = byCommand.get(b.command) ?? {
        keys: [],
        title: titles.get(b.command) ?? b.command,
      };
      const k = prettyKey(b.key);
      if (!entry.keys.includes(k)) entry.keys.push(k);
      byCommand.set(b.command, entry);
    }
    return [...byCommand.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [keybindings, commands]);

  return (
    <div data-keyboard-shortcuts-panel="ready">
      <CockpitPanelHeader title="Keyboard shortcuts" />
      <CockpitSection title={`Commands (${rows.length})`}>
        <div data-shortcut-rows>
          {rows.map((r) => (
            <div
              key={r.id}
              data-shortcut-row={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "3px 14px",
                fontSize: 12,
              }}
            >
              <span>{r.title}</span>
              <span className="pg-mono-meta" style={{ opacity: 0.75 }}>
                {r.keys.join("  ")}
              </span>
            </div>
          ))}
        </div>
      </CockpitSection>
      <CockpitSection title={`Not in the registry (${AD_HOC.length})`}>
        <div
          className="pg-ui-xs"
          style={{ padding: "0 14px 6px", opacity: 0.7 }}
          data-shortcut-adhoc-note
        >
          These are bound with their own listeners rather than through the
          keybinding registry, so they are listed from a maintained table.
          Undo and page navigation live here.
        </div>
        {AD_HOC.map((r) => (
          <div
            key={r.key + r.what}
            data-shortcut-adhoc={r.what}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "3px 14px",
              fontSize: 12,
            }}
          >
            <span>{r.what}</span>
            <span className="pg-mono-meta" style={{ opacity: 0.75 }}>
              {r.key}
            </span>
          </div>
        ))}
      </CockpitSection>
    </div>
  );
}
