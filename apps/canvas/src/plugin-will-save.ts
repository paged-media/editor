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

// v66 — the host side of `host.document.onWillSave`
// (`document.onWillSave@1`). Save (.paged) runs every registered
// listener and waits for them BEFORE it asks the engine for the bytes,
// so a plugin that keeps an edit session outside the document (a raster
// stack, a spreadsheet's unflushed cells) can commit it first and the
// file holds what the user sees.
//
// A listener is bounded, not trusted: one that throws or hangs is
// reported and the save goes ahead without it. A save that never
// finishes because a plugin never answered is worse than a save that
// carries that plugin's last committed state.

export interface WillSaveEvent {
  format: "paged";
}

type Listener = (e: WillSaveEvent) => Promise<void>;

export interface WillSaveOutcome {
  /** Plugin ids whose listener threw. */
  failed: string[];
  /** Plugin ids whose listener did not settle within the bound. */
  timedOut: string[];
}

export interface WillSaveRegistry {
  register(pluginId: string, listener: Listener): { dispose(): void };
  run(e: WillSaveEvent, timeoutMs?: number): Promise<WillSaveOutcome>;
  size(): number;
}

export function createWillSaveRegistry(): WillSaveRegistry {
  const entries = new Set<{ pluginId: string; listener: Listener }>();
  return {
    register(pluginId, listener) {
      const entry = { pluginId, listener };
      entries.add(entry);
      return { dispose: () => void entries.delete(entry) };
    },
    async run(e, timeoutMs = 10_000) {
      const outcome: WillSaveOutcome = { failed: [], timedOut: [] };
      await Promise.all(
        [...entries].map(async ({ pluginId, listener }) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<"timeout">((resolve) => {
            timer = setTimeout(() => resolve("timeout"), timeoutMs);
          });
          try {
            const r = await Promise.race([listener(e), timeout]);
            if (r === "timeout") outcome.timedOut.push(pluginId);
          } catch {
            outcome.failed.push(pluginId);
          } finally {
            clearTimeout(timer);
          }
        }),
      );
      return outcome;
    },
    size: () => entries.size,
  };
}
