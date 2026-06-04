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
 * and invokes through the registry so visibility predicates + the
 * editor handle wiring apply uniformly. Cockpit additions: a Recent
 * group (localStorage), a "Suggested in <Mode>" group from the
 * active ModeContribution, and the AI-prompt affordance.
 */
export function CommandPalette() {
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

  const all = useMemo(() => commands.list(), [commands, open]);
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c] as const)), [all]);
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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search commands — or describe what you need…"
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

        {grouped.map(([category, items], idx) => (
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
    </CommandDialog>
  );
}

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
