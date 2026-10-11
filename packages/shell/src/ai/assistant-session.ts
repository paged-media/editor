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

// The AI Assistant's session: one store every entry point feeds — the
// panel itself, the command palette's "Ask Claude", File ▸ New from a
// brief, the Properties panel's shortcut — so a run started anywhere shows
// in the one AI Assistant panel, and survives the panel being hidden.
// The run executes here, not in a component.

import type { CanvasClient } from "@paged-media/client";

import { describeAiError, plainSummary, runEditorAgent, undoBackTo, undoTop } from "./editor-ai";

export type AssistantView = "ask" | "brief";

export interface AssistantStep {
  label: string;
  state: "ok" | "failed" | "info";
}

export type AssistantRun =
  | { phase: "idle" }
  | { phase: "running"; prompt: string; steps: AssistantStep[]; controller: AbortController }
  | { phase: "done"; prompt: string; steps: AssistantStep[]; summary: string; stopped: boolean; before: number; after: number; changed: boolean }
  | { phase: "error"; prompt: string; steps: AssistantStep[]; message: string };

export interface AssistantState {
  view: AssistantView;
  /** Text to put into the request field (from the palette, a suggestion). */
  draft: string;
  /** Run `draft` as soon as the panel shows (the palette's "Ask Claude"). */
  autoRun: boolean;
  run: AssistantRun;
}

let state: AssistantState = { view: "ask", draft: "", autoRun: false, run: { phase: "idle" } };
const listeners = new Set<() => void>();
let opener: (() => void) | null = null;

function set(next: Partial<AssistantState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function getAssistantState(): AssistantState {
  return state;
}

export function subscribeAssistant(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The app tells the store how to show the AI Assistant panel. */
export function setAssistantOpener(open: (() => void) | null): void {
  opener = open;
}

/** Show the panel, optionally switching view or pre-filling the request. */
export function openAssistant(options: { view?: AssistantView; draft?: string; autoRun?: boolean } = {}): void {
  set({
    ...(options.view ? { view: options.view } : {}),
    ...(options.draft !== undefined ? { draft: options.draft } : {}),
    autoRun: options.autoRun === true,
  });
  opener?.();
}

export function setAssistantView(view: AssistantView): void {
  set({ view });
}

export function setAssistantDraft(draft: string): void {
  set({ draft });
}

/** Take the pending auto-run request, if any (clears it). */
export function takeAssistantAutoRun(): string | null {
  if (!state.autoRun) return null;
  set({ autoRun: false });
  return state.draft;
}

export function dismissAssistantRun(): void {
  if (state.run.phase !== "running") set({ run: { phase: "idle" } });
}

export function stopAssistantRun(): void {
  if (state.run.phase === "running") state.run.controller.abort();
}

/** The first comment line of a script names the step, else a generic one. */
function stepLabel(source: string, n: number): string {
  const first = source.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const comment = /^\/\/\s*(.+)$/.exec(first)?.[1];
  return comment ? comment.slice(0, 90) : `Step ${n}: changing the document`;
}

export interface StartRunOptions {
  client: CanvasClient;
  mode: "script" | "assist" | "document";
  prompt: string;
  /** Before the agent runs (File ▸ New from a brief mints its page here). */
  prepare?: () => Promise<boolean>;
}

/** Start a run. Returns immediately; progress lands in the store. */
export function startAssistantRun(options: StartRunOptions): void {
  if (state.run.phase === "running") return;
  const controller = new AbortController();
  const steps: AssistantStep[] = [];
  const push = (step: AssistantStep) => {
    steps.push(step);
    if (state.run.phase === "running") set({ run: { ...state.run, steps: [...steps] } });
  };
  set({ run: { phase: "running", prompt: options.prompt, steps: [], controller }, draft: "" });
  void (async () => {
    try {
      if (options.prepare && !(await options.prepare())) {
        set({ run: { phase: "idle" } });
        return;
      }
      const before = await undoTop(options.client);
      let scripts = 0;
      const result = await runEditorAgent(options.client, {
        mode: options.mode,
        prompt: options.prompt,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === "script") push({ label: stepLabel(e.source, ++scripts), state: "info" });
          else if (e.type === "scriptResult") {
            const last = steps[steps.length - 1];
            if (last) last.state = e.run.error ? "failed" : "ok";
            if (e.run.error) push({ label: `Retrying: ${e.run.error.split("\n")[0]!.slice(0, 80)}`, state: "info" });
            if (e.overset && e.overset.length > 0) push({ label: `${e.overset.length} ${e.overset.length === 1 ? "story is" : "stories are"} overset`, state: "info" });
            if (state.run.phase === "running") set({ run: { ...state.run, steps: [...steps] } });
          } else if (e.type === "render") push({ label: `Checked the look of page ${e.page}`, state: "ok" });
        },
      });
      const after = await undoTop(options.client);
      if (result.outcome === "refused") {
        set({ run: { phase: "error", prompt: options.prompt, steps, message: "Claude declined this request." } });
        return;
      }
      set({
        run: {
          phase: "done",
          prompt: options.prompt,
          steps,
          summary: plainSummary(result.summary) || "Done.",
          stopped: result.outcome !== "done",
          before,
          after,
          changed: after !== before,
        },
      });
    } catch (err) {
      set({ run: { phase: "error", prompt: options.prompt, steps, message: describeAiError(err) } });
    }
  })();
}

/** Undo exactly the last run's steps — refused after a later edit. */
export async function undoAssistantRun(client: CanvasClient): Promise<void> {
  const run = state.run;
  if (run.phase !== "done") return;
  const ok = await undoBackTo(client, run.before, run.after);
  set({
    run: ok
      ? { phase: "idle" }
      : { phase: "error", prompt: run.prompt, steps: run.steps, message: "The document changed after Claude's edit, so it was not undone. Use Edit ▸ Undo instead." },
  });
}
