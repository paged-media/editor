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

import { demoShowInfo } from "./overlay";

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
  /** Sleep for ms (lets the canvas settle / pace a sequence). */
  wait(ms: number): Promise<void>;
}

export interface DemoGlobals {
  paged: PagedScriptApi;
  editor: EditorAutomationApi;
  demo: DemoNarrationApi;
}

export function buildAutomation(h: CanvasHandleLike): DemoGlobals {
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
    showInfo: (title, body, opts) => demoShowInfo({ title, body, ...opts }),
    pause: (message) => demoShowInfo({ title: message }),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  };

  return { paged, editor, demo };
}
