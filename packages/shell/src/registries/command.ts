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

import type { Disposable, VisibilityPredicate } from "./types";

/**
 * Canonical action primitive. Every menu item, every keybinding,
 * every command-palette entry resolves to a command. The handler
 * receives the editor handle (and an optional payload for
 * parameterised commands like `paged.page.goto`).
 */
export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
  icon?: string;
  /** Handler return is `unknown` rather than `void` so command
   * implementations can surface a result through the registry's
   * `invoke` (bundles use this for the round-trip RPC). Most
   * shell-internal commands return nothing. */
  handler: (paged: unknown, payload?: unknown) => unknown | Promise<unknown>;
  /** Optional enablement predicate. Disabled commands appear greyed. */
  when?: VisibilityPredicate;
}

/**
 * One pass through `invoke`. `seq` is monotonic per registry instance
 * so an observer can pair a `started` with its `settled` even when
 * several async commands overlap.
 */
export interface CommandInvocation {
  seq: number;
  id: string;
  title: string;
  /** Exactly the payload the caller passed — NOT cloned. An observer
   *  that wants to keep it must copy it; the caller may mutate. */
  payload: unknown;
}

export type CommandInvocationEvent =
  | { phase: "started"; invocation: CommandInvocation }
  | { phase: "settled"; invocation: CommandInvocation; error: unknown };

export type CommandObserver = (event: CommandInvocationEvent) => void;

export interface CommandRegistry {
  register(contribution: CommandContribution): Disposable;
  unregister(id: string): void;
  invoke(id: string, payload?: unknown): Promise<unknown>;
  get(id: string): CommandContribution | undefined;
  list(): CommandContribution[];
  /**
   * Watch every invocation. `invoke` is the only place a command
   * handler is ever called (grep `.handler(` — one hit), so this is
   * THE tap for anything that needs to see user intent: the action
   * recorder, a future history/telemetry surface.
   *
   * Observers are advisory — a throwing observer is caught and logged
   * so a broken watcher can never break a command.
   */
  observe(observer: CommandObserver): Disposable;
}

/**
 * Backing for `invoke`: callers expect the registered handler to
 * run against the current `PagedEditor`. The registry holds a thunk
 * provided at construction so the shell can rebind the editor
 * reference without recreating the registry.
 */
export function createCommandRegistry(
  getEditor: () => unknown,
): CommandRegistry {
  const byId = new Map<string, CommandContribution>();
  const observers = new Set<CommandObserver>();
  let nextSeq = 1;

  const emit = (event: CommandInvocationEvent) => {
    for (const observer of observers) {
      try {
        observer(event);
      } catch (err) {
        // An observer is a bystander. Swallowing keeps a bad watcher
        // from turning every menu click into a failure.
        console.error("CommandRegistry: observer threw", err);
      }
    }
  };

  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `CommandRegistry: id "${contribution.id}" already registered`,
        );
      }
      byId.set(contribution.id, contribution);
      return {
        dispose() {
          byId.delete(contribution.id);
        },
      };
    },
    unregister(id) {
      byId.delete(id);
    },
    async invoke(id, payload) {
      const cmd = byId.get(id);
      if (!cmd) {
        // No observer event: an unknown id never ran, so there is
        // nothing for a recorder to record.
        throw new Error(`CommandRegistry: unknown command "${id}"`);
      }
      const editor = getEditor();
      if (observers.size === 0) return await cmd.handler(editor, payload);

      // Emit `started` BEFORE the handler so recorded order is call
      // order. Two async commands that overlap would otherwise be
      // recorded in completion order, which is not what the user did.
      const invocation: CommandInvocation = {
        seq: nextSeq++,
        id,
        title: cmd.title,
        payload,
      };
      emit({ phase: "started", invocation });
      try {
        const result = await cmd.handler(editor, payload);
        emit({ phase: "settled", invocation, error: null });
        return result;
      } catch (err) {
        emit({ phase: "settled", invocation, error: err ?? new Error(id) });
        throw err;
      }
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return Array.from(byId.values());
    },
    observe(observer) {
      observers.add(observer);
      return {
        dispose() {
          observers.delete(observer);
        },
      };
    },
  };
}
