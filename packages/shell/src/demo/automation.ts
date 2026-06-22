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

// The demo/automation scripting surface. Builds the unified globals a demo (or
// guided-tour) script runs against, from the editor's `__canvas` handle:
//
//   paged.*  — document ops: the REAL engine Boa. `paged.run(src)` executes a
//              paged.* snippet in the worker and returns its console output.
//   editor.* — UI automation: open panels, run commands/menu items, set tool/mode,
//              select elements, enter property values. Wraps the shell registries.
//   demo.*   — narration/pacing: showInfo/pause (suspends the script on the
//              message box), wait, highlight.
//
// This is the host-side surface; the script-author API is identical whether it
// runs here (main-thread runner) or, later, inside a host-extensible Boa.

import { demoShowInfo, demoHighlight } from "./overlay";

/** The subset of the `__canvas` dev handle the automation needs. */
export interface CanvasHandleLike {
  client: {
    executeScript(source: string): Promise<{ output: string[]; error: string | null }>;
    mutate(mutation: unknown): Promise<unknown>;
  };
  registries: {
    commands: {
      invoke?(id: string, payload?: unknown): Promise<unknown>;
      execute?(id: string, payload?: unknown): Promise<unknown>;
      run?(id: string, payload?: unknown): Promise<unknown>;
    };
  };
  openPanel?: (id: string) => void;
  setActiveTool?: (tool: string) => void;
  setMode?: (mode: string) => void;
  setElementSelection?: (ids: unknown[], mode: string) => void;
  elementSelection?: unknown[];
  handle?: { pageIds?: string[]; pageCount?: number } | null;
}

export interface PagedScriptApi {
  /** Run a paged.* Boa snippet in the worker; throws on error, returns output lines. */
  run(source: string): Promise<string[]>;
}

export interface EditorAutomationApi {
  /** Open a registered panel as a right-dock tab. */
  openPanel(id: string): void;
  /** Invoke a command id (the same ids menu items dispatch). */
  runCommand(id: string, payload?: unknown): Promise<unknown>;
  /** Activate a tool. */
  setTool(tool: string): void;
  /** Switch workflow mode. */
  setMode(mode: string): void;
  /** Replace the element selection. */
  select(ids: unknown[], mode?: string): void;
  /** Page ids of the open document (empty until a document exists). */
  pageIds(): string[];
  /** Set a property on the current selection (panel + document update together). */
  setProperty(path: string, value: unknown): Promise<void>;
  /**
   * Low-level document authoring via the protocol op channel (same channel the
   * journey tests + panels use): `editor.mutate({ op, args })`. The bridge for
   * content authoring on engines whose paged.* Boa lacks the authoring fns;
   * prefer paged.run(...) once the engine ships paged.insertFrame/etc.
   */
  mutate(op: unknown): Promise<unknown>;
}

export interface DemoNarrationApi {
  /** Show a titled message box and SUSPEND until the user advances (or autoMs). */
  showInfo(title: string, body?: string, opts?: { autoMs?: number; cta?: string; index?: number; total?: number }): Promise<void>;
  /** Alias for showInfo with just a message. */
  pause(message: string): Promise<void>;
  /** A chapter marker with no UI — names a step for the scrub bar / table of contents. */
  step(label: string): Promise<void>;
  /** Spotlight a UI target (CSS selector) — dims the editor + cuts out the target. Pass null to clear. */
  highlight(target: string | null): Promise<void>;
  /** Sleep for ms (lets the canvas settle / pace a sequence). */
  wait(ms: number): Promise<void>;
}

export interface DemoGlobals {
  paged: PagedScriptApi;
  editor: EditorAutomationApi;
  demo: DemoNarrationApi;
}

export interface AutomationOptions {
  /** When true, demo.* narration/pacing is suppressed (used by the session's
   *  silent replay/fast-forward when seeking to a chapter). */
  isSilent?: () => boolean;
}

export function buildAutomation(h: CanvasHandleLike, opts: AutomationOptions = {}): DemoGlobals {
  const silent = () => opts.isSilent?.() ?? false;
  const commandInvoke = (id: string, payload?: unknown): Promise<unknown> => {
    const c = h.registries.commands;
    const fn = c.invoke ?? c.execute ?? c.run;
    if (!fn) return Promise.reject(new Error("command registry has no invoke/execute/run"));
    return Promise.resolve(fn.call(c, id, payload));
  };

  const paged: PagedScriptApi = {
    async run(source: string): Promise<string[]> {
      const reply = await h.client.executeScript(source);
      if (reply.error) throw new Error(`paged.run: ${reply.error}`);
      return reply.output;
    },
  };

  const editor: EditorAutomationApi = {
    openPanel: (id) => h.openPanel?.(id),
    runCommand: (id, payload) => commandInvoke(id, payload),
    setTool: (tool) => h.setActiveTool?.(tool),
    setMode: (mode) => h.setMode?.(mode),
    select: (ids, mode = "replace") => h.setElementSelection?.(ids, mode),
    pageIds: () => h.handle?.pageIds ?? [],
    async setProperty(path, value) {
      const sel = h.elementSelection ?? [];
      for (const elementId of sel) {
        await h.client.mutate({ op: "setElementProperty", args: { elementId, path, value } });
      }
    },
    mutate: (op) => h.client.mutate(op),
  };

  const demo: DemoNarrationApi = {
    showInfo: (title, body, info) => (silent() ? Promise.resolve() : demoShowInfo({ title, body, ...info })),
    pause: (message) => (silent() ? Promise.resolve() : demoShowInfo({ title: message })),
    step: () => Promise.resolve(), // pure chapter marker; the scrub bar reads it from the source
    // Apply highlights even during silent replay — a spotlight is persistent
    // visual STATE (not a pause), so seeking must land on the correct one.
    highlight: (target) => {
      demoHighlight(target);
      return Promise.resolve();
    },
    wait: (ms) => (silent() ? Promise.resolve() : new Promise((r) => setTimeout(r, ms))),
  };

  return { paged, editor, demo };
}
