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

/** Evaluate a keybinding's `when` predicate. Undefined → enabled. The
 *  function form is called with the state snapshot; the string DSL
 *  form is inert (treated as disabled) until an evaluator lands —
 *  matching `VisibilityPredicate`'s documented contract. */
function isEnabled(
  when: VisibilityPredicate | undefined,
  getState: (() => unknown) | undefined,
): boolean {
  if (when === undefined) return true;
  if (typeof when === "function") {
    try {
      return Boolean(when(getState?.()));
    } catch {
      return false;
    }
  }
  return false;
}

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
    // Skip when focus is in a text-editable surface so typing
    // doesn't trigger commands. Limited to plain inputs; the
    // canvas's content-selection model lives on its own layer and
    // isn't an editable element.
    const target = event.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
      // Cmd-K + similar modifier combos still apply inside inputs
      // so the palette opens regardless; pure-letter keys are
      // suppressed.
      const isPureLetter =
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.length === 1;
      if (isEditable && isPureLetter) {
        return;
      }
    }
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
