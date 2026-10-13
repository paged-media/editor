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
import type { ShellObjectsSurface } from "../catalog/object-model-types";
import { buildObjectAutomation, type ObjectAutomationApi } from "./object-automation";

/** The subset of the `__canvas` dev handle the automation needs. */
export interface CanvasHandleLike {
  client: {
    executeScript(source: string): Promise<{ output: string[]; error: string | null }>;
    mutate(mutation: unknown): Promise<unknown>;
    /** The worker's selection; answers the ids it applied. */
    setElementSelection?(ids: unknown[], mode: string): Promise<unknown[]>;
    elementGeometry?(ids: unknown[]): Promise<unknown[]>;
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
  /** The geometry mirror the selection box is drawn from. */
  setElementGeometry?: (items: unknown[]) => void;
  elementSelection?: unknown[];
  handle?: { pageIds?: string[]; pageCount?: number } | null;
  /** ADR 323 — the app's shared object registry (`host.objects`). */
  objects?: Pick<ShellObjectsSurface, "query" | "get" | "set" | "batch" | "schema"> | null;
}

export interface PagedScriptApi {
  /** Run a paged.* Boa snippet in the worker; throws on error, returns output lines. */
  run(source: string): Promise<string[]>;
}

export interface EditorAutomationApi extends ObjectAutomationApi {
  /** Open a registered panel as a right-dock tab. */
  openPanel(id: string): void;
  /** Invoke a command id (the same ids menu items dispatch). */
  runCommand(id: string, payload?: unknown): Promise<unknown>;
  /** Activate a tool. */
  setTool(tool: string): void;
  /** Switch workflow mode. */
  setMode(mode: string): void;
  /** Select elements as a click does: the engine, the panels and the
   *  selection box all follow. */
  select(ids: unknown[], mode?: string): Promise<void>;
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

export function buildAutomation(handle: CanvasHandleLike, opts: AutomationOptions = {}): DemoGlobals {
  const silent = () => opts.isSilent?.() ?? false;
  // `window.__canvas` is republished on every render (PagedShell), so the
  // object a script was started with goes stale: after `paged.file.new` its
  // `handle` still names no document and `editor.pageIds()` stays empty. Every
  // read goes to the live publication, falling back to the handle given (a
  // host without the global, or a test double).
  const live = (): CanvasHandleLike => (globalThis as { __canvas?: CanvasHandleLike }).__canvas ?? handle;
  const commandInvoke = (id: string, payload?: unknown): Promise<unknown> => {
    const c = live().registries.commands;
    const fn = c.invoke ?? c.execute ?? c.run;
    if (!fn) return Promise.reject(new Error("command registry has no invoke/execute/run"));
    return Promise.resolve(fn.call(c, id, payload));
  };

  const paged: PagedScriptApi = {
    async run(source: string): Promise<string[]> {
      const reply = await live().client.executeScript(source);
      if (reply.error) throw new Error(`paged.run: ${reply.error}`);
      return reply.output;
    },
  };

  const editor: EditorAutomationApi = {
    openPanel: (id) => live().openPanel?.(id),
    runCommand: (id, payload) => commandInvoke(id, payload),
    setTool: (tool) => live().setActiveTool?.(tool),
    setMode: (mode) => live().setMode?.(mode),
    select: async (ids, mode = "replace") => {
      // A bad id would reach the panels and take the whole UI down; a script
      // gets an error it can read instead.
      const bad = ids.find((x) => !x || typeof x !== "object" || !("kind" in x) || !("id" in x));
      if (bad !== undefined) throw new Error(`editor.select: ${JSON.stringify(bad) ?? String(bad)} is not an element id ({ kind, id })`);
      // The click path's three steps. Setting only the panels' mirror left
      // the engine's selection where it was (so `paged.selection()` and the
      // commands that read it disagreed with the panels) and the selection
      // box on whatever was selected before.
      const c = live();
      const applied = c.client.setElementSelection ? await c.client.setElementSelection(ids, mode) : ids;
      c.setElementSelection?.(applied, mode);
      if (!c.client.elementGeometry || !c.setElementGeometry) return;
      try {
        c.setElementGeometry(await c.client.elementGeometry(applied));
      } catch {
        // Geometry is selection chrome; the selection itself is set.
      }
    },
    pageIds: () => live().handle?.pageIds ?? [],
    async setProperty(path, value) {
      const sel = live().elementSelection ?? [];
      for (const elementId of sel) {
        await live().client.mutate({ op: "setElementProperty", args: { elementId, path, value } });
      }
    },
    mutate: (op) => live().client.mutate(op),
    // ADR 323 — get/set/query/batch/schema over `host.objects`.
    ...buildObjectAutomation(() => live().objects),
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
