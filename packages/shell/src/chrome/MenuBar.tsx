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

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import type { MenuItemContribution } from "../registries";
import { useRegistries } from "../state/registries-context";
import { useOptionalPaged } from "../state/paged-editor";
import { useOptionalEditContextStack } from "../state/edit-context-stack";
import { useSelectionEditContext } from "../state/use-selection-object-type";
import { useWorkflowMode } from "../state/workflow-mode-context";
import { isEnabled, type VisibilityPredicate } from "../registries/types";
import { Icon, hasIcon } from "../icons";

/**
 * Top-level menu bar. Reads from `MenuRegistry` and renders each
 * top-level path segment as a shadcn `DropdownMenu`. Items dispatch
 * through the command registry.
 *
 * The bar owns the menu INFORMATION ARCHITECTURE, so contributors only
 * name a path:
 *
 *  - Every further `/` segment is a real submenu (`Draw/Path/Outline
 *    stroke` → Draw ▸ Path ▸ Outline stroke).
 *  - Groups never interleave. A group ranks by its lowest `order` and
 *    items sort inside it; sorting items by `order` alone shuffled the
 *    groups of different contributors together and drew a separator at
 *    every boundary (Draw's 73 items rendered with ~70 of them).
 *  - "Insert X" verbs live in the Insert menu, wherever they were
 *    contributed (`Object/Insert spreadsheet…` → Insert ▸ Spreadsheet…).
 *  - The core menus are fixed in set and order — muscle memory is the
 *    point of a menu bar.
 *  - Every plugin has a home in the PLUGINS menu: one submenu per plugin
 *    with all of its commands and its panels (Plugins ▸ Draw ▸ Pathfinder
 *    ▸ Unite, Plugins ▸ Draw ▸ Stroke). Any top-level menu a plugin
 *    contributes is folded in there.
 *  - The same plugin menu ALSO appears on the bar as a CONTEXT menu while
 *    its content is selected or entered (Draw with a path selected, Image
 *    inside a raster frame), after a divider, in the accent colour — a
 *    one-click shortcut, the rule the tool rail applies to plugin tools.
 */
export const CORE_MENUS: readonly string[] = [
  "File",
  "Edit",
  "Insert",
  "Object",
  "Type",
  "Layout",
  "View",
  "Plugins",
  "Window",
  "Help",
];

const INSERT_VERB = /^Insert (.+)$/;

export function MenuBar() {
  const { menus, commands, keybindings, panels, tools, editContexts, modes } =
    useRegistries();
  const activeContext = useOptionalEditContextStack()?.active ?? null;
  const selectionContext = useSelectionEditContext();
  const { mode } = useWorkflowMode();
  // Rebuilt per render, not memoised on the registry: its identity never
  // changes while its CONTENTS grow as bundles load, so a memo would
  // freeze the accelerator column at first render (82 bindings live, 0
  // drawn, once).
  const keyFor = acceleratorLookup(keybindings.list());
  const iconFor = (item: MenuLeaf): string | null => {
    if (item.icon && hasIcon(item.icon)) return item.icon;
    const panel = item.command.match(/^paged\.panel\.show\.(.+)$/)?.[1];
    if (panel) {
      const icon = panels.get(panel)?.icon;
      if (icon && hasIcon(icon)) return icon;
    }
    const tool = item.command.match(/^paged\.tool\.activate\.(.+)$/)?.[1];
    if (tool) {
      const icon = tools.get(tool as never)?.icon;
      if (icon && hasIcon(icon)) return icon;
    }
    return null;
  };
  const [version, setVersion] = useState(0);
  // ADR 024 — the menus reflect WHERE THE USER IS: `useOptionalPaged`
  // supplies the state `when` is evaluated against AND the re-render on
  // a selection or context change. Optional so a standalone mount
  // degrades to "everything enabled" rather than throwing.
  const paged = useOptionalPaged();
  useEffect(() => {
    const sub = menus.onChange(() => setVersion((v) => v + 1));
    return () => sub.dispose();
  }, [menus]);

  const tree = useMemo(() => buildMenuTree(menus.list()), [menus, version]);
  if (tree.length === 0) return null;

  const applies = (leaf: MenuLeaf) =>
    !leaf.disabled && leaf.kind !== "label" && isEnabled(leaf.when, () => paged);

  // WHEN A CONTEXT MENU SHOWS. A plugin's items cannot say it: the SDK
  // gates every one of them on "a document is open", so with a document
  // loaded all five plugin menus applied at once and nothing was
  // contextual. What does say it is the plugin's FRAME: its edit context
  // (`metadataKey` = `x-paged:<namespace>`). A menu whose commands share
  // a framed namespace shows while that frame is entered, or while the
  // selection is something the frame claims (what a double-click would
  // enter). A plugin with no frame keeps "an item applies". A mode can
  // keep a menu on the bar (Data layout keeps Data).
  const framed = new Set<string>();
  const nsOfContext = (type: string | undefined | null) => {
    const key = type ? editContexts.get(type)?.metadataKey : undefined;
    return key?.startsWith("x-paged:") ? key.slice("x-paged:".length) : null;
  };
  for (const ec of editContexts.list()) {
    const ns = nsOfContext(ec.type);
    if (ns) framed.add(ns);
  }
  const here = new Set(
    [nsOfContext(activeContext?.type), nsOfContext(selectionContext?.type)].filter(
      (n): n is string => n !== null,
    ),
  );
  const keptByMode = modes.get(mode)?.menus ?? [];
  const showContextMenu = (label: string, nodes: MenuNode[]) => {
    if (keptByMode.includes(label) || keptByMode.includes("*")) return true;
    if (!someLeaf(nodes, applies)) return false;
    const own = [...framed].filter((ns) =>
      someLeaf(nodes, (l) => commandNamespaceIs(l.command, ns)),
    );
    return own.length === 0 || own.some((ns) => here.has(ns));
  };
  const core = tree.filter(([label]) => CORE_MENUS.includes(label));
  const context = tree.filter(
    ([label, nodes]) => !CORE_MENUS.includes(label) && showContextMenu(label, nodes),
  );

  const ctx: RenderCtx = {
    invoke: (id) => void commands.invoke(id),
    state: paged,
    keyFor,
    iconFor,
  };

  const menu = (label: string, nodes: MenuNode[], contextual: boolean) => (
    <DropdownMenu key={label}>
      <DropdownMenuTrigger
        style={contextual ? contextTriggerStyle : triggerStyle}
        data-menu-trigger={label}
        data-menu-context={contextual ? "true" : undefined}
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} style={contentStyle}>
        {renderNodes(nodes, ctx)}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <nav aria-label="Main menu" style={menuBarStyle}>
      {core.map(([label, nodes]) => menu(label, nodes, false))}
      {context.length > 0 && (
        <>
          <span style={dividerStyle} aria-hidden />
          {context.map(([label, nodes]) => menu(label, nodes, true))}
        </>
      )}
    </nav>
  );
}

// ── model ──────────────────────────────────────────────────────────

interface MenuLeaf {
  type: "leaf";
  label: string;
  command: string;
  order: number;
  group?: string;
  /** E4 — the group's heading, rendered above its first item. */
  groupLabel?: string;
  disabled?: boolean;
  /** ADR 024 — an inapplicable item greys and refuses the click. */
  when?: VisibilityPredicate;
  labelFor?: (state: unknown) => string | null;
  icon?: string;
  accelerator?: string;
  kind?: "item" | "label";
}

interface MenuSubmenu {
  type: "submenu";
  label: string;
  children: MenuNode[];
  /** Lowest order / first group of its children: where it sits. */
  order: number;
  group?: string;
  groupLabel?: string;
}

type MenuNode = MenuLeaf | MenuSubmenu;

/** Capitalise a relocated leaf: `Insert spreadsheet…` → `Spreadsheet…`. */
function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildMenuTree(
  items: MenuItemContribution[],
): Array<[string, MenuNode[]]> {
  const tops = new Map<string, MenuNode[]>();
  for (const item of items) {
    let segments = item.path.split("/").filter(Boolean);
    if (segments.length < 2) continue; // No top-level menu to live in.
    // Insert verbs filed under a CORE menu gather in the Insert menu (see
    // the header comment). A context menu's own verbs stay put: "Insert
    // rows" belongs to the sheet, not to the page.
    if (
      segments[0] !== "Insert" &&
      CORE_MENUS.includes(segments[0]) &&
      segments.length === 2
    ) {
      const verb = segments[1].match(INSERT_VERB);
      if (verb) segments = ["Insert", capitalise(verb[1])];
    }
    const [top, ...rest] = segments;
    const leaf: MenuLeaf = {
      type: "leaf",
      label: rest[rest.length - 1],
      command: item.command,
      order: item.order ?? 100,
      group: item.group,
      groupLabel: item.groupLabel,
      disabled: item.disabled,
      when: item.when,
      labelFor: item.labelFor,
      icon: item.icon,
      accelerator: item.accelerator,
      kind: item.kind,
    };
    let level: MenuNode[] = tops.get(top) ?? [];
    if (!tops.has(top)) tops.set(top, level);
    for (const name of rest.slice(0, -1)) {
      let sub: MenuSubmenu | undefined = level.find(
        (n): n is MenuSubmenu => n.type === "submenu" && n.label === name,
      );
      if (!sub) {
        sub = {
          type: "submenu",
          label: name,
          children: [],
          order: leaf.order,
          group: leaf.group,
          groupLabel: leaf.groupLabel,
        };
        level.push(sub);
      } else if (leaf.order < sub.order) {
        sub.order = leaf.order;
        sub.group = leaf.group;
        sub.groupLabel = leaf.groupLabel;
      }
      level = sub.children;
    }
    // One command, one row per level: a second registration of the same
    // command at the same place would render a second row under the same
    // React key.
    if (!level.some((n) => n.type === "leaf" && n.command === leaf.command)) {
      level.push(leaf);
    }
  }
  // Fold every plugin-contributed top-level menu into Plugins ▸ <name>,
  // beside that plugin's panels (registered as `Plugins/<name>/<panel>`).
  // The original top-level entry stays for the context-menu display.
  //
  // MERGED, not concatenated. Concatenation listed a panel twice when the
  // plugin's own menu also opens it (Data ▸ Data sources… beside the
  // shell's Data sources — one command, two rows, one React key), and
  // kept two submenus when both sides named one.
  const plugins = tops.get("Plugins") ?? [];
  for (const [top, nodes] of tops) {
    if (CORE_MENUS.includes(top)) continue;
    const existing = plugins.find(
      (n): n is MenuSubmenu => n.type === "submenu" && n.label === top,
    );
    if (existing) existing.children = mergeNodes(cloneNodes(nodes), existing.children);
    else plugins.push({ type: "submenu", label: top, children: cloneNodes(nodes), order: 0 });
  }
  // One section, alphabetical (the label tie-break in sortLevel).
  for (const n of plugins) {
    if (n.type !== "submenu") continue;
    n.order = 0;
    n.group = "plugins";
    n.groupLabel = undefined;
    nestPanelsUnderNamesakes(n.children);
  }
  if (plugins.length > 0) tops.set("Plugins", plugins);
  for (const nodes of tops.values()) sortLevel(nodes);
  return Array.from(tops.entries()).sort(
    ([a], [b]) => topLevelOrder(a) - topLevelOrder(b),
  );
}

/** Deep copy of a node list: the fold edits the Plugins copy, and the
 *  original top-level menu is still rendered as the context menu. */
function cloneNodes(nodes: MenuNode[]): MenuNode[] {
  return nodes.map((n) =>
    n.type === "submenu" ? { ...n, children: cloneNodes(n.children) } : { ...n },
  );
}

/** `into` + `from`, with submenus of one label merged (recursively) and
 *  a leaf whose command `into` already holds dropped — the first
 *  contributor's row wins. */
function mergeNodes(into: MenuNode[], from: MenuNode[]): MenuNode[] {
  const out = [...into];
  for (const node of from) {
    if (node.type === "leaf") {
      if (!out.some((n) => n.type === "leaf" && n.command === node.command)) {
        out.push(node);
      }
      continue;
    }
    const same = out.find(
      (n): n is MenuSubmenu => n.type === "submenu" && n.label === node.label,
    );
    if (same) {
      same.children = mergeNodes(same.children, node.children);
      if (node.order < same.order) same.order = node.order;
    } else {
      out.push(node);
    }
  }
  return out;
}

const PANEL_SHOW = "paged.panel.show.";

/** A plugin panel named like one of the plugin's command submenus
 *  (Draw ▸ Appearance the commands, Appearance the panel) was listed
 *  twice under one name — two rows a user cannot tell apart. The panel
 *  moves into its namesake submenu, first, as "<name> panel". */
function nestPanelsUnderNamesakes(nodes: MenuNode[]): void {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.type !== "leaf" || !n.command.startsWith(PANEL_SHOW)) continue;
    const namesake = nodes.find(
      (m): m is MenuSubmenu => m.type === "submenu" && m.label === n.label,
    );
    if (!namesake) continue;
    nodes.splice(i, 1);
    const first = Math.min(...namesake.children.map((c) => c.order), n.order);
    namesake.children.unshift({
      ...n,
      label: `${n.label} panel`,
      group: "namesake-panel",
      groupLabel: undefined,
      order: first - 1,
    });
  }
}

/** Groups rank by their lowest member order; members sort inside. */
function sortLevel(nodes: MenuNode[]): void {
  for (const n of nodes) if (n.type === "submenu") sortLevel(n.children);
  const rank = new Map<string, number>();
  for (const n of nodes) {
    const g = n.group ?? "";
    rank.set(g, Math.min(rank.get(g) ?? Infinity, n.order));
  }
  nodes.sort(
    (a, b) =>
      rank.get(a.group ?? "")! - rank.get(b.group ?? "")! ||
      (a.group ?? "").localeCompare(b.group ?? "") ||
      a.order - b.order ||
      a.label.localeCompare(b.label),
  );
}

/** `media.paged.draw.command.x` (or the panel-show form
 *  `paged.panel.show.media.paged.draw.panel.y`) is in namespace
 *  `media.paged.draw`. */
function commandNamespaceIs(command: string, ns: string): boolean {
  const id = command.startsWith("paged.panel.show.")
    ? command.slice("paged.panel.show.".length)
    : command;
  return id.startsWith(ns + ".");
}

function someLeaf(nodes: MenuNode[], pred: (l: MenuLeaf) => boolean): boolean {
  return nodes.some((n) =>
    n.type === "leaf" ? pred(n) : someLeaf(n.children, pred),
  );
}

/** Core menus keep their fixed order; context menus append after them,
 *  alphabetically. */
function topLevelOrder(label: string): number {
  const i = CORE_MENUS.indexOf(label);
  return i >= 0 ? i : 100 + label.charCodeAt(0);
}

// ── accelerators ───────────────────────────────────────────────────

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** command → display string, preferring the binding for THIS platform.
 *  Bundles register `cmd+…` and `ctrl+…` twins; taking whichever came
 *  first showed ⌃S on a Mac. */
function acceleratorLookup(
  bindings: ReadonlyArray<{ key: string; command: string }>,
): (command: string) => string | null {
  const byCommand = new Map<string, string[]>();
  for (const b of bindings) {
    const keys = byCommand.get(b.command);
    if (keys) keys.push(b.key);
    else byCommand.set(b.command, [b.key]);
  }
  return (command) => {
    const keys = byCommand.get(command);
    return keys ? prettyKey(nativeKey(keys)) : null;
  };
}

/** Of a command's bindings, the one for THIS platform (bundles register
 *  `cmd+…` and `ctrl+…` twins; the other twin is noise to show). */
export function nativeKey(keys: readonly string[]): string {
  const native = (k: string) => {
    const mods = k.toLowerCase().split("+").slice(0, -1);
    const mac = mods.some((m) => m === "cmd" || m === "meta");
    const pc = mods.some((m) => m === "ctrl" || m === "control");
    return IS_MAC ? !pc || mac : !mac;
  };
  return keys.find(native) ?? keys[0];
}

/** Named keys that read as a glyph (`arrowleft` → ←). */
const KEY_GLYPHS: Record<string, string> = {
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  backspace: "⌫",
  delete: "⌦",
};

/** `cmd+shift+s` → `⇧⌘S` on a Mac (Apple's modifier order), `Ctrl+Shift+S`
 *  elsewhere. Mirrors what the command palette shows. */
export function prettyKey(combo: string): string {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  const has = (...names: string[]) => parts.some((p) => names.includes(p));
  const glyph =
    KEY_GLYPHS[key] ??
    (key.length === 1 ? key.toUpperCase() : capitalise(key));
  if (IS_MAC) {
    return (
      (has("ctrl", "control") && !has("cmd", "meta") ? "⌃" : "") +
      (has("alt", "option") ? "⌥" : "") +
      (has("shift") ? "⇧" : "") +
      (has("cmd", "meta") ? "⌘" : "") +
      glyph
    );
  }
  return [
    has("ctrl", "control", "cmd", "meta") ? "Ctrl" : "",
    has("alt", "option") ? "Alt" : "",
    has("shift") ? "Shift" : "",
    glyph,
  ]
    .filter(Boolean)
    .join("+");
}

// ── rendering ──────────────────────────────────────────────────────

interface RenderCtx {
  invoke: (commandId: string) => void;
  state: unknown;
  keyFor: (commandId: string) => string | null;
  iconFor: (leaf: MenuLeaf) => string | null;
}

function displayLabel(item: MenuLeaf, state: unknown): string {
  if (!item.labelFor) return item.label;
  try {
    return item.labelFor(state) ?? item.label;
  } catch {
    return item.label;
  }
}

function renderNodes(nodes: MenuNode[], ctx: RenderCtx): ReactNode[] {
  // An icon column only where icons are the norm (a third of the rows
  // or more): a menu with one stray glyph reads as patchy, not as
  // guided, and a plain menu keeps its text flush left.
  const leaves = nodes.filter((n): n is MenuLeaf => n.type === "leaf");
  const iconColumn =
    leaves.length > 0 &&
    leaves.filter((n) => ctx.iconFor(n) !== null).length * 3 >= leaves.length;
  // A heading names a section among several; a submenu that is one
  // section would only repeat its parent's.
  const sections = new Set(nodes.map((n) => n.group ?? "")).size;
  const out: ReactNode[] = [];
  let lastGroup: string | undefined;
  nodes.forEach((node, idx) => {
    if (idx > 0 && node.group !== lastGroup) {
      out.push(<DropdownMenuSeparator key={`sep-${idx}`} />);
    }
    // E4 — a separator says "these differ"; a heading says how.
    if (sections > 1 && node.groupLabel && (idx === 0 || node.group !== lastGroup)) {
      out.push(
        <div
          key={`grouplabel-${idx}`}
          data-menu-group-label={node.groupLabel}
          className="pg-mono-meta"
          style={{ padding: "4px 8px 2px", opacity: 0.55 }}
        >
          {node.groupLabel}
        </div>,
      );
    }
    lastGroup = node.group;
    out.push(
      node.type === "submenu" ? (
        <DropdownMenuSub key={`sub-${node.label}`}>
          <DropdownMenuSubTrigger data-menu-submenu={node.label}>
            {iconColumn && <span style={iconSlotStyle} aria-hidden />}
            {node.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent style={contentStyle}>
            {renderNodes(node.children, ctx)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : (
        renderLeaf(node, ctx, iconColumn)
      ),
    );
  });
  return out;
}

function renderLeaf(item: MenuLeaf, ctx: RenderCtx, iconColumn: boolean): ReactNode {
  const icon = iconColumn ? ctx.iconFor(item) : null;
  const iconSlot = iconColumn && (
    <span style={iconSlotStyle} aria-hidden>
      {icon && <Icon name={icon} size={15} />}
    </span>
  );
  if (item.kind === "label") {
    return (
      <div
        key={item.command}
        className="pg-mono-meta"
        data-menu-label={item.command}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", opacity: 0.55 }}
      >
        {iconSlot}
        {displayLabel(item, ctx.state)}
      </div>
    );
  }
  // TWO REASONS TO GREY, which the user needs told apart: `disabled` is
  // a seam (the feature does not exist yet — "soon"); a false `when` is
  // "does not apply where you are standing", which promises nothing.
  const inapplicable = !isEnabled(item.when, () => ctx.state);
  const greyed = Boolean(item.disabled) || inapplicable;
  const accel = ctx.keyFor(item.command) ?? (item.accelerator ? prettyKey(item.accelerator) : null);
  return (
    <DropdownMenuItem
      key={item.command}
      disabled={greyed}
      onSelect={() => {
        // Re-checked at invoke: a menu can stay open across a context
        // change, and the click must not run against the old surface.
        if (!greyed) ctx.invoke(item.command);
      }}
    >
      {iconSlot}
      {displayLabel(item, ctx.state)}
      {/* E2 — the accelerator column; a seam shows `soon` instead, since
          a blank column beside a greyed item reads as a missing key. */}
      {item.disabled ? (
        <span className="pg-mono-meta" style={{ marginLeft: "auto", paddingLeft: 16 }}>
          soon
        </span>
      ) : (
        accel && (
          <span
            className="pg-mono-meta"
            style={{ marginLeft: "auto", paddingLeft: 16, opacity: 0.6 }}
            data-menu-accelerator={item.command}
          >
            {accel}
          </span>
        )
      )}
    </DropdownMenuItem>
  );
}

const menuBarStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 0,
};

const triggerStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "4px 9px",
  fontSize: 13,
  fontFamily: "inherit",
  cursor: "pointer",
  color: "var(--chrome-menu-text)",
  borderRadius: 4,
  whiteSpace: "nowrap",
};

/** A context menu wears the accent: it is there because of what you
 *  selected, and goes when you deselect. */
const contextTriggerStyle: CSSProperties = {
  ...triggerStyle,
  color: "var(--pg-primary)",
  fontWeight: 500,
};

const dividerStyle: CSSProperties = {
  width: 1,
  height: 16,
  margin: "0 6px",
  background: "var(--pg-border)",
};

const contentStyle: CSSProperties = {
  minWidth: 220,
  maxHeight: "calc(100vh - 80px)",
  overflowY: "auto",
};

const iconSlotStyle: CSSProperties = {
  width: 16,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 8,
  opacity: 0.8,
};
