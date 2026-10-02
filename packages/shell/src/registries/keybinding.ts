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

import type { CommandRegistry } from "./command";
import { isEnabled } from "./types";
import type { Disposable, VisibilityPredicate } from "./types";

/**
 * Declarative keybinding manifest. `key` uses the modifier-prefixed
 * dotted form: `"cmd+k"`, `"shift+escape"`, `"cmd+shift+p"`.
 * Recognised modifiers: `cmd` / `meta`, `ctrl` / `control`, `alt` /
 * `option`, `shift`. `cmd` aliases `meta` so the same contribution
 * works on macOS + Linux/Windows (with `cmd` resolving to the Cmd
 * key on macOS and the Ctrl key elsewhere — but we keep them as
 * separate flags here and let consumers register both forms if
 * they want OS-specific behaviour).
 *
 * Step 4 wires this up as a real listener; the existing
 * `useKeyboardShortcuts` hook stays as the canvas-app navigation
 * provider until that migration is done in its own slice.
 */
export interface KeybindingContribution {
  key: string;
  command: string;
  when?: VisibilityPredicate;
}

export interface KeybindingRegistry {
  register(contribution: KeybindingContribution): Disposable;
  /** Listing for diagnostics + the future "Show keybindings" panel. */
  list(): KeybindingContribution[];
  /** (Re-)install the global keydown listener. Idempotent — the
   * provider calls this from a mount effect so StrictMode's
   * mount→unmount→mount cycle re-attaches what `detach` removed
   * (the registry instance itself survives in a ref). */
  attach(): void;
  /** Remove the global keydown listener, keeping the bindings. */
  detach(): void;
}

/** Internal: parsed key combo + the command to invoke. */
interface ParsedBinding {
  contribution: KeybindingContribution;
  combo: KeyCombo;
}

interface KeyCombo {
  /** Lowercased single key (e.g. "k", "escape", "arrowleft"). */
  key: string;
  cmd: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

/**
 * Parse `"cmd+shift+k"` into a normalised `KeyCombo`. Throws on
 * malformed input — bundles are expected to use static strings so
 * a typo surfaces loudly rather than as a silently-broken
 * shortcut.
 */
function parseCombo(key: string): KeyCombo {
  const parts = key.trim().toLowerCase().split("+");
  if (parts.length === 0 || parts.some((p) => !p)) {
    throw new Error(`KeybindingRegistry: malformed key "${key}"`);
  }
  const last = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  const combo: KeyCombo = {
    key: last,
    cmd: false,
    ctrl: false,
    alt: false,
    shift: false,
  };
  for (const m of mods) {
    switch (m) {
      case "cmd":
      case "meta":
        combo.cmd = true;
        break;
      case "ctrl":
      case "control":
        combo.ctrl = true;
        break;
      case "alt":
      case "option":
        combo.alt = true;
        break;
      case "shift":
        combo.shift = true;
        break;
      default:
        throw new Error(
          `KeybindingRegistry: unknown modifier "${m}" in "${key}"`,
        );
    }
  }
  return combo;
}

function eventMatches(combo: KeyCombo, event: KeyboardEvent): boolean {
  const eventKey = event.key.toLowerCase();
  if (eventKey !== combo.key) return false;
  if (combo.cmd !== event.metaKey) return false;
  if (combo.ctrl !== event.ctrlKey) return false;
  if (combo.alt !== event.altKey) return false;
  if (combo.shift !== event.shiftKey) return false;
  return true;
}

/**
 * The keys a focused WIDGET consumes itself, whatever modifiers ride
 * along: Backspace/Delete edit a field, the arrows move its caret (or
 * a menu's highlight, a slider's thumb, a tab strip's focus), Home/End
 * jump within it.
 *
 * WHY THIS SET EXISTS. The guard below used to know one fact — "a pure
 * letter typed into a field is text, not a shortcut" — and that was
 * the whole of it, because every binding was either a letter or a
 * Cmd/Ctrl chord. The first bindings on Backspace and the arrow keys
 * (`paged.object.delete` / `.nudge*`) would have walked straight
 * through it: Backspace in the Transform panel's X field deleting the
 * selected frame, and the arrow keys walking the Object menu nudging
 * the selection one point per row. A `when` predicate cannot fix that
 * — it is handed application STATE, not the event — so the fact
 * belongs here, once, for every binding on these keys that ever
 * registers.
 *
 * Deliberately NOT in the set: Tab, Enter, Escape and the function
 * keys. Bindings on those exist (`tab` / `shift+tab`) and have always
 * fired from inside a field; widening the rule to them would change
 * shipped behaviour this change has no business touching.
 */
const WIDGET_KEYS = new Set([
  "backspace",
  "delete",
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
  "home",
  "end",
]);

/**
 * ARIA composites that own the arrow keys (and, for a tree or a
 * listbox, Delete) while focus is inside them. `toolbar` is absent on
 * purpose: clicking a tool leaves focus on its rail button, and the
 * very next thing a user does is press an arrow to nudge.
 */
const WIDGET_KEY_OWNERS = [
  '[role="menu"]',
  '[role="menubar"]',
  '[role="listbox"]',
  '[role="tree"]',
  '[role="grid"]',
  '[role="tablist"]',
  '[role="radiogroup"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="combobox"]',
  '[role="dialog"]',
].join(",");

/**
 * Does the element the key was pressed in consume this key itself?
 * True ⇒ no binding may fire; the event is the widget's.
 *
 * Reads only `key`, the modifier flags and `target`, so the rule is
 * testable in Node with a plain object (it is exported for exactly
 * that; the five keyboard hooks that each carry a private
 * `isEditableTarget` are a consolidation this change does not attempt).
 */
export function targetOwnsKey(
  event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "target" | "defaultPrevented"
  >,
): boolean {
  const isWidgetKey = WIDGET_KEYS.has(event.key.toLowerCase());
  // Something upstream already took this key. React's handlers run at
  // the root container, before this window listener, so a widget with
  // no telltale role still gets to say "mine" the ordinary way: a
  // focused menu TRIGGER opens on ArrowDown and prevents the default,
  // and must not nudge the selection as it does. Scoped to the widget
  // keys — applying it to every binding would change what happens to
  // chords other hooks already `preventDefault` today.
  if (isWidgetKey && event.defaultPrevented) return true;
  const target = event.target as HTMLElement | null;
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  const isEditable =
    tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  if (isEditable) {
    // Cmd-K + similar modifier combos still apply inside inputs so the
    // palette opens regardless; pure-letter keys are suppressed. The
    // widget keys are suppressed WITH their modifiers — Cmd+Left is
    // "line start" in a field, Alt+Backspace is "delete word".
    const isPureLetter =
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.key.length === 1;
    return isPureLetter || isWidgetKey;
  }
  if (!isWidgetKey) return false;
  // A <select> walks its options with the arrows.
  if (tag === "SELECT") return true;
  return (
    typeof target.closest === "function" &&
    target.closest(WIDGET_KEY_OWNERS) !== null
  );
}

/** Evaluate a keybinding's `when` predicate. Undefined → enabled. The
 *  function form is called with the state snapshot; the string DSL
 *  form is inert (treated as disabled) until an evaluator lands —
 *  matching `VisibilityPredicate`'s documented contract. */
/**
 * Backing for `register` / dispatch. Takes the command registry so
 * matched keybindings can invoke their target command; the optional
 * `getState` thunk supplies an application-state snapshot for `when`
 * predicate evaluation (Concept 1's tool shortcuts use this for the
 * class-wide `contentSelection == null` text-suppression guard).
 */
export function createKeybindingRegistry(
  commands: CommandRegistry,
  getState?: () => unknown,
): KeybindingRegistry & Disposable {
  const bindings: ParsedBinding[] = [];

  const onKeyDown = (event: KeyboardEvent) => {
    // Skip when the focused widget consumes this key itself, so typing
    // (and editing, and menu navigation) doesn't trigger commands. The
    // canvas's content-selection model lives on its own layer and isn't
    // an editable element — bindings guard that through `when`.
    if (targetOwnsKey(event)) return;
    for (const b of bindings) {
      if (eventMatches(b.combo, event)) {
        // A disabled binding yields to any lower-priority binding that
        // also matches this combo (e.g. a guarded tool shortcut vs. a
        // future unguarded one).
        if (!isEnabled(b.contribution.when, getState)) continue;
        event.preventDefault();
        void commands.invoke(b.contribution.command);
        return;
      }
    }
  };

  let listening = false;
  const attach = () => {
    if (listening) return;
    window.addEventListener("keydown", onKeyDown);
    listening = true;
  };
  const detach = () => {
    if (!listening) return;
    window.removeEventListener("keydown", onKeyDown);
    listening = false;
  };
  attach();

  return {
    register(contribution) {
      const combo = parseCombo(contribution.key);
      const entry: ParsedBinding = { contribution, combo };
      bindings.push(entry);
      return {
        dispose() {
          const idx = bindings.indexOf(entry);
          if (idx >= 0) bindings.splice(idx, 1);
        },
      };
    },
    list() {
      return bindings.map((b) => b.contribution);
    },
    attach,
    detach,
    dispose() {
      detach();
      bindings.length = 0;
    },
  };
}
