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

import { useEffect, useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import type { MenuItemContribution } from "../registries";
import { useRegistries } from "../state/registries-context";
import { useOptionalPaged } from "../state/paged-editor";
import { isEnabled, type VisibilityPredicate } from "../registries/types";

/**
 * Top-level menu bar. Reads from `MenuRegistry`, groups items by the
 * leading path segment (e.g. `"File"`, `"View"`), and renders each
 * group as a shadcn `DropdownMenu`. Items are dispatched through the
 * command registry — selecting one calls
 * `commands.invoke(item.command)`.
 *
 * Step 4 ships one level of grouping. Nested submenus aren't
 * supported yet; a path like `"View/Theme/Light"` collapses to a
 * "Theme/Light" leaf under the View group. Sub-menus land if a
 * later bundle needs them.
 */
export function MenuBar() {
  const { menus, commands, keybindings } = useRegistries();

  // Same source and same formatting as the command palette, so the two
  // surfaces cannot disagree about what a key does.
  // NOT memoised on the registry. Its object identity never changes,
  // while its CONTENTS grow as bundles load — so a memo keyed on it is
  // built once at first render, before any plugin has registered a
  // binding, and never recomputes. That is exactly what happened: 82
  // bindings live and 0 accelerators drawn. Rebuilding per render costs
  // one pass over ~80 entries, and only while the surface is open.
  const keyFor = (() => {
    const byCommand = new Map<string, string>();
    for (const b of keybindings.list()) {
      if (!byCommand.has(b.command)) byCommand.set(b.command, prettyKey(b.key));
    }
    return (id: string) => byCommand.get(id) ?? null;
  })();
  const [version, setVersion] = useState(0);
  // ADR 024 — the menu must reflect WHERE THE USER IS. `useOptionalPaged`
  // both supplies the state a `when` predicate is evaluated against and
  // provides the re-render: the handle is memoized on its slices, of
  // which the active edit context is now one, so entering or leaving a
  // context re-renders this bar. Optional so a standalone mount (tests,
  // a detached panel) degrades to "everything enabled" rather than
  // throwing.
  const paged = useOptionalPaged();

  // Re-render when items are added or removed so palette-toggle
  // commands etc. show up as soon as the shell registers them.
  useEffect(() => {
    const sub = menus.onChange(() => {
      setVersion((v) => v + 1);
    });
    return () => sub.dispose();
  }, [menus]);

  const groups = useMemo(
    () => groupByTopLevel(menus.list()),
    [menus, version],
  );

  if (groups.length === 0) return null;

  return (
    <nav aria-label="Main menu" style={menuBarStyle}>
      {groups.map(([label, items]) => (
        <DropdownMenu key={label}>
          <DropdownMenuTrigger style={triggerStyle} data-menu-trigger={label}>
            {label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            {renderItems(
              items,
              (id) => void commands.invoke(id),
              paged,
              keyFor,
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </nav>
  );
}

/** `cmd+shift+s` -> `\u2318\u21e7S`. Mirrors the command palette's
 *  formatter exactly; both read `KeybindingRegistry.list()`. */
function prettyKey(combo: string): string {
  const parts = combo.split("+");
  const key = parts.pop() ?? "";
  const mods = parts
    .map((m) =>
      m === "cmd" || m === "meta"
        ? "\u2318"
        : m === "shift"
          ? "\u21e7"
          : m === "alt" || m === "option"
            ? "\u2325"
            : m === "ctrl" || m === "control"
              ? "\u2303"
              : m,
    )
    .join("");
  return `${mods}${key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)}`;
}

interface GroupedItem {
  /** Display label — every path segment after the top-level group,
   * joined with " ▸ " for any nested labels. */
  label: string;
  command: string;
  order: number;
  group?: string;
  /** E4 — the group's human heading, carried through rather than
   *  dropped. Dropping it is what made the Window menu read as ~90 flat
   *  entries divided by unlabelled hairlines. */
  groupLabel?: string;
  disabled?: boolean;
  /** ADR 024 — carried through rather than dropped. This field was
   *  declared on the contribution and discarded HERE, which is why a
   *  menu item could declare itself inapplicable and still render live
   *  and still run. */
  when?: VisibilityPredicate;
}

function groupByTopLevel(
  items: MenuItemContribution[],
): Array<[string, GroupedItem[]]> {
  const groups = new Map<string, GroupedItem[]>();
  for (const item of items) {
    const segments = item.path.split("/").filter(Boolean);
    if (segments.length < 2) continue; // Drop items with no group prefix.
    const [top, ...rest] = segments;
    const grouped: GroupedItem = {
      label: rest.join(" ▸ "),
      command: item.command,
      order: item.order ?? 100,
      group: item.group,
      groupLabel: item.groupLabel,
      disabled: item.disabled,
      when: item.when,
    };
    const bucket = groups.get(top);
    if (bucket) bucket.push(grouped);
    else groups.set(top, [grouped]);
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }
  return Array.from(groups.entries()).sort(
    ([a], [b]) => topLevelOrder(a) - topLevelOrder(b),
  );
}

/** Canonical top-level menu ordering — the kit's nine-menu line
 * (File … Help) plus Tools. Anything not listed lands after the
 * named menus in alphabetical order. */
function topLevelOrder(label: string): number {
  const i = [
    "File",
    "Edit",
    "Layout",
    "Type",
    "Object",
    "Data",
    "View",
    "Tools",
    "Window",
    "Help",
  ].indexOf(label);
  return i >= 0 ? i : 100 + label.charCodeAt(0);
}

function renderItems(
  items: GroupedItem[],
  invoke: (commandId: string) => void,
  state: unknown,
  keyFor: (commandId: string) => string | null,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastGroup: string | undefined;
  items.forEach((item, idx) => {
    if (idx > 0 && item.group !== lastGroup) {
      out.push(<DropdownMenuSeparator key={`sep-${idx}`} />);
    }
    // E4 — render the group's NAME when it has one. The Window menu
    // computed these all along and MenuBar dropped them, so ~90 panel
    // entries read as one flat list divided by unlabelled hairlines.
    // A separator says "these differ"; a heading says how.
    if (item.groupLabel && item.group !== lastGroup) {
      out.push(
        <div
          key={`grouplabel-${idx}`}
          data-menu-group-label={item.groupLabel}
          className="pg-mono-meta"
          style={{ padding: "4px 8px 2px", opacity: 0.55 }}
        >
          {item.groupLabel}
        </div>,
      );
    }
    lastGroup = item.group;
    // TWO REASONS TO GREY, and they are different facts the user needs
    // told apart. `disabled` is a kit seam — the feature does not exist
    // yet, marked "soon". A false `when` is "this does not apply where
    // you are standing", which is not a promise about the future and
    // must not wear a "soon" badge.
    const inapplicable = !isEnabled(item.when, () => state);
    const greyed = Boolean(item.disabled) || inapplicable;
    out.push(
      <DropdownMenuItem
        key={item.command}
        disabled={greyed}
        onSelect={() => {
          // Re-checked at invoke, not trusted from render. A menu can be
          // open across a context change, and the click that lands after
          // it must not run against the surface the item was drawn for.
          if (!greyed) invoke(item.command);
        }}
      >
        {item.label}
        {/* E2 — the accelerator column. The menus rendered a label and,
            for seams, a `soon` pill, and nothing else — so Cmd+Z, Cmd+D,
            Cmd+G, Cmd+] and the rest were undiscoverable from the one
            surface that exists to list what the app can do. The TOOLS
            advertised their keys in rail tooltips all along; commands
            never did.

            A seam shows `soon` instead: it has no key, and a blank
            column beside a greyed item reads as a key that failed to
            render rather than a feature that does not exist yet. */}
        {item.disabled ? (
          <span className="pg-mono-meta" style={{ marginLeft: "auto" }}>
            soon
          </span>
        ) : (
          keyFor(item.command) && (
            <span
              className="pg-mono-meta"
              style={{ marginLeft: "auto", opacity: 0.6 }}
              data-menu-accelerator={item.command}
            >
              {keyFor(item.command)}
            </span>
          )
        )}
      </DropdownMenuItem>,
    );
  });
  return out;
}

const menuBarStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 0,
};

const triggerStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "4px 10px",
  fontSize: 13,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  cursor: "pointer",
  color: "var(--chrome-menu-text)",
  borderRadius: 4,
};
