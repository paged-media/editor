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
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../components/ui/command";
import { Icon } from "../icons";
import type { CommandContribution } from "../registries";
import { useRegistries } from "../state/registries-context";
import { useOptionalPaged } from "../state/paged-editor";
import { isEnabled } from "../registries/types";
import { useOptionalWorkflowMode } from "../state/workflow-mode-context";

/**
 * Module-level event emitter for the palette's open/toggle state.
 * Listeners are the mounted palette components; emitters are
 * registered commands (`paged.palette.toggle`, `…open`, `…close`)
 * + the keybinding registry that routes Cmd+K through them.
 *
 * Module scope so external command handlers can fire the toggle
 * without crossing the React context boundary.
 */
type PaletteAction = "toggle" | "open" | "close";
const listeners = new Set<(action: PaletteAction) => void>();

/** Emit a palette action. Idempotent — safe to call from anywhere. */
export function notifyPalette(action: PaletteAction): void {
  for (const fn of listeners) fn(action);
}

/** Recently-run command ids, most recent first. */
const RECENTS_KEY = "paged.palette.recents.v1";
const RECENTS_MAX = 5;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string): string[] {
  const next = [id, ...loadRecents().filter((x) => x !== id)].slice(
    0,
    RECENTS_MAX,
  );
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* convenience only */
  }
  return next;
}

/**
 * The kit's "looks like an AI prompt" heuristic: imperative
 * generate/fix verbs or a long natural-language query. The AI group
 * it surfaces is a STYLED SEAM — the entry is disabled until an
 * assistant backend exists; the affordance (wand, primary tint)
 * ships so the command bar's final shape is already real.
 */
function looksLikePrompt(query: string): boolean {
  if (query.trim().split(/\s+/).length > 3) return true;
  return /\b(make|generate|turn|prepare|create|shorten|fix|rewrite)\b/i.test(
    query,
  );
}

/**
 * Cmd+K-driven command bar. Reads from the active `CommandRegistry`
 * and invokes through the registry.
 *
 * CORRECTED 2026-08-07: this comment used to say that invoking through
 * the registry meant "visibility predicates apply uniformly". They did
 * not — `invoke` never read `when`, and this list was unfiltered, so
 * the palette offered every registered command in every context and ran
 * whatever was picked. The claim was plausible enough that nobody
 * checked, which is the more useful half of the lesson: a comment
 * asserting a guarantee is worth exactly as much as the test pinning
 * it. The gate now exists in `CommandRegistry.invoke`; the filtering
 * below is noise reduction on top of it, not the safety.
 *
 * Cockpit additions: a Recent group (localStorage), a "Suggested in
 * <Mode>" group from the active ModeContribution, and the AI-prompt
 * affordance.
 */
export function CommandPalette() {
  const paged = useOptionalPaged();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { commands, modes } = useRegistries();
  const workflowMode = useOptionalWorkflowMode();
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [version, setVersion] = useState(0);
  void version;

  useEffect(() => {
    const handler = (action: PaletteAction) => {
      if (action === "toggle") {
        setOpen((v) => !v);
        setVersion((v) => v + 1);
      } else if (action === "open") {
        setOpen(true);
        setVersion((v) => v + 1);
      } else {
        setOpen(false);
      }
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  // Fresh query each open so the zero-state groups show.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // ADR 024 — HIDDEN, not greyed, and that differs from the menu on
  // purpose. A menu has stable positions a user learns, so an
  // inapplicable item greys in place; a palette is a SEARCH surface
  // with no positions to preserve, and a dead hit is just a wrong
  // answer to a query. `paged` supplies both the predicate's state and
  // the re-render, since the handle is memoized on the active context.
  const all = useMemo(
    () => commands.list().filter((c) => isEnabled(c.when, () => paged)),
    [commands, open, paged],
  );
  const byId = useMemo(
    () => new Map(all.map((c) => [c.id, c] as const)),
    [all],
  );
  const grouped = useMemo(() => groupByCategory(all), [all]);

  const run = (cmd: CommandContribution) => {
    setOpen(false);
    setRecents(pushRecent(cmd.id));
    void commands.invoke(cmd.id);
  };

  const recentItems = recents
    .map((id) => byId.get(id))
    .filter((c): c is CommandContribution => Boolean(c));

  const mode = workflowMode?.mode;
  const suggested =
    (mode ? modes.get(mode)?.paletteSuggestions : undefined)
      ?.map((id) => byId.get(id))
      .filter((c): c is CommandContribution => Boolean(c)) ?? [];
  const modeTitle = mode ? modes.get(mode)?.title : undefined;

  const showAiSeam = query.length > 0 && looksLikePrompt(query);

  // Zero state stays curated (kit): the per-panel Show/Hide pairs
  // (~100 ids) only surface once the user types.
  const visibleGroups = useMemo(
    () =>
      query.length > 0
        ? grouped
        : grouped
            .map(
              ([category, items]) =>
                [
                  category,
                  items.filter(
                    (c) =>
                      !c.id.startsWith("paged.panel.show.") &&
                      !c.id.startsWith("paged.panel.hide."),
                  ),
                ] as [string, CommandContribution[]],
            )
            .filter(([, items]) => items.length > 0),
    [grouped, query],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      // Kit command-bar.jsx: 660px, parked high (11vh) like a
      // launcher, not centred like a modal form.
      contentClassName="max-w-[660px] top-[11vh] translate-y-0"
    >
      <CommandInput
        placeholder="Ask or search anything…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {showAiSeam && (
          <>
            <CommandGroup heading="Assistant">
              <CommandItem
                value={`assistant ${query}`}
                disabled
                data-palette-ai-seam
              >
                <Icon
                  name="ui-wand"
                  size={15}
                  style={{ color: "var(--pg-primary)", marginRight: 8 }}
                />
                <span>“{query}”</span>
                <span className="ml-auto text-xs opacity-60">
                  assistant coming soon
                </span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {query.length === 0 && recentItems.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentItems.map((cmd) => (
                <CommandItem
                  key={`recent-${cmd.id}`}
                  value={`recent ${cmd.title} ${cmd.id}`}
                  data-palette-recent={cmd.id}
                  onSelect={() => run(cmd)}
                >
                  <Icon
                    name="ui-history"
                    size={14}
                    style={{ color: "var(--pg-muted-fg)", marginRight: 8 }}
                  />
                  <span>{cmd.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {query.length === 0 && suggested.length > 0 && (
          <>
            <CommandGroup heading={`Suggested in ${modeTitle ?? "this mode"}`}>
              {suggested.map((cmd) => (
                <CommandItem
                  key={`suggested-${cmd.id}`}
                  value={`suggested ${cmd.title} ${cmd.id}`}
                  data-palette-suggested={cmd.id}
                  onSelect={() => run(cmd)}
                >
                  <span>{cmd.title}</span>
                  <span className="ml-auto text-xs opacity-50">{cmd.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {visibleGroups.map(([category, items], idx) => (
          <div key={category}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={category}>
              {items.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  value={`${category} ${cmd.title} ${cmd.id}`}
                  onSelect={() => run(cmd)}
                >
                  <span>{cmd.title}</span>
                  <span className="ml-auto text-xs opacity-50">{cmd.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
      {/* Kit footer: run / navigate / the AI affordance. */}
      <div
        data-palette-footer
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: 34,
          padding: "0 14px",
          borderTop: "1px solid var(--pg-border)",
          background: "var(--chrome-panel-bg)",
          color: "var(--pg-muted-fg)",
          fontFamily: "var(--font-sans)",
          fontSize: 11,
        }}
      >
        <span>
          <kbd style={kbdStyle}>↵</kbd> run
        </span>
        <span>
          <kbd style={kbdStyle}>↑↓</kbd> navigate
        </span>
        <span
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Icon
            name="ui-sparkle"
            size={12}
            style={{ color: "var(--pg-primary)" }}
          />
          AI-assisted
        </span>
      </div>
    </CommandDialog>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  border: "1px solid var(--pg-border)",
  borderRadius: "var(--radius-sm)",
  padding: "1px 5px",
  marginRight: 4,
  background: "var(--pg-bg)",
};

function groupByCategory(
  items: CommandContribution[],
): Array<[string, CommandContribution[]]> {
  const groups = new Map<string, CommandContribution[]>();
  for (const cmd of items) {
    const category = cmd.category ?? "Other";
    const bucket = groups.get(category);
    if (bucket) {
      bucket.push(cmd);
    } else {
      groups.set(category, [cmd]);
    }
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}
