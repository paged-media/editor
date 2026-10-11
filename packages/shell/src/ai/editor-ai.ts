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

// Claude in the editor: the agent from @paged-media/ai, wired to this
// document. Scripts run in the canvas worker (the same door as the Script
// panel, so every write is undoable); model turns go to the same-origin
// proxy at /api/ai (ADR 221), which holds the key. Nothing here talks to
// Anthropic directly — the CSP would refuse it anyway (ADR 218).

import {
  complete,
  createProxyTransport,
  runAgent,
  type AgentEvent,
  type AgentResult,
  type AiTransport,
  type ApiCatalog,
  type ScriptEngine,
} from "@paged-media/ai";
import type { CanvasClient } from "@paged-media/client";

/** Where the proxy is mounted, relative to the editor's origin. */
export const AI_PROXY_PATH = "/api/ai";

/** Rendered page width for the model's `render_page` — enough to read
 *  layout and headings, small enough to stay cheap. */
const RENDER_WIDTH_PX = 1024;

let catalogLoad: Promise<ApiCatalog> | null = null;

/** The engine catalog the agent's lookup_api answers from — 140 KB, so it
 *  loads on the first AI request, never at boot. */
export function loadAiCatalog(): Promise<ApiCatalog> {
  catalogLoad ??= import("@paged-media/ai/catalog").then((m) => m.default);
  return catalogLoad;
}

/** The canvas worker behind the agent's engine door. */
export function canvasScriptEngine(client: CanvasClient): ScriptEngine {
  return {
    runScript: (source) => client.executeScript(source),
    async renderPage(pageIndex) {
      const run = await client.executeScript("console.log(paged.pages())");
      const line = run.output[0]?.replace(/^\[\w+\] /, "");
      const pages = line ? (JSON.parse(line) as Array<{ selfId: string }>) : [];
      const page = pages[pageIndex - 1];
      if (!page) return null;
      const shot = await client.requestSnapshot(page.selfId, RENDER_WIDTH_PX);
      return new Uint8Array(shot.pngBytes);
    },
  };
}

export function editorAiTransport(): AiTransport {
  return createProxyTransport({ baseURL: new URL(AI_PROXY_PATH, window.location.origin).href });
}

export interface EditorAgentRequest {
  mode: "script" | "assist" | "document";
  prompt: string;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

/** Run the agent on the open document. */
export async function runEditorAgent(client: CanvasClient, request: EditorAgentRequest): Promise<AgentResult> {
  return runAgent({
    transport: editorAiTransport(),
    engine: canvasScriptEngine(client),
    catalog: await loadAiCatalog(),
    mode: request.mode,
    prompt: request.prompt,
    ...(request.onEvent ? { onEvent: request.onEvent } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  });
}

/** One plain-text answer, for a script's paged.ai.complete(). */
export async function completeText(prompt: string, signal?: AbortSignal): Promise<string> {
  const answer = await complete(editorAiTransport(), prompt, signal ? { signal } : undefined);
  if (answer.refusal) throw new Error("Claude declined this request");
  return answer.text;
}

/** Claude's summary as plain text for a plain-text surface: the prompt
 *  asks for no Markdown, and this removes what slips through — emphasis
 *  markers, heading hashes, inline code ticks — keeping line breaks and
 *  list dashes, which read fine as text. */
export function plainSummary(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** A human sentence for an error the proxy or the SDK raised. */
export function describeAiError(err: unknown): string {
  const e = err as { status?: number; error?: { error?: { type?: string; message?: string } }; name?: string; message?: string };
  if (e?.name === "AbortError" || e?.name === "APIUserAbortError") return "Stopped.";
  const type = e?.error?.error?.type;
  const message = e?.error?.error?.message;
  if (e?.status === 503 || type === "ai_unavailable") return message ?? "The AI service is not available on this deployment.";
  if (e?.status === 429) return message ?? "Too many AI requests right now. Try again shortly.";
  if (e?.status === 529) return "Claude is overloaded right now. Try again shortly.";
  if (e?.status === 404) return "This deployment has no AI service.";
  return message ?? e?.message ?? String(err);
}

/** The sequence number of the newest undoable mutation, or 0 when there is
 *  none. The engine has no read for it, so this undoes and immediately
 *  redoes — the document ends exactly as it was. */
export async function undoTop(client: CanvasClient): Promise<number> {
  const undone = (await client.undo()) as { kind: string; payload?: { undoneSeq?: number } };
  if (undone.kind !== "undoApplied" || typeof undone.payload?.undoneSeq !== "number") return 0;
  await client.redo();
  return undone.payload.undoneSeq;
}

/** Undo every mutation newer than `seq`, as long as the newest one is
 *  still `expectTop` — i.e. nothing was edited after Claude finished.
 *  Returns false (and changes nothing) when something was. */
export async function undoBackTo(client: CanvasClient, seq: number, expectTop: number): Promise<boolean> {
  if ((await undoTop(client)) !== expectTop) return false;
  for (;;) {
    const undone = (await client.undo()) as { kind: string; payload?: { undoneSeq?: number } };
    if (undone.kind !== "undoApplied" || typeof undone.payload?.undoneSeq !== "number") return true;
    if (undone.payload.undoneSeq <= seq) {
      await client.redo(); // one too far: that step predates Claude's run
      return true;
    }
  }
}

// ---- the palette's "Ask Claude" hand-off -------------------------------
//
// The command palette (shell) asks; the Script panel (app) answers. The
// panel may not be mounted yet when the request is made — opening it is
// part of the command — so the request waits here until a listener takes it.

type AskListener = (prompt: string) => void;
let pendingAsk: string | null = null;
const askListeners = new Set<AskListener>();

/** Hand a request to the Script panel's Ask bar. */
export function requestAiAsk(prompt: string): void {
  if (askListeners.size === 0) {
    pendingAsk = prompt;
    return;
  }
  for (const l of askListeners) l(prompt);
}

/** Receive Ask requests (and the one made before this listener existed). */
export function onAiAsk(listener: AskListener): () => void {
  askListeners.add(listener);
  if (pendingAsk !== null) {
    const p = pendingAsk;
    pendingAsk = null;
    listener(p);
  }
  return () => askListeners.delete(listener);
}

/** The command the palette's assistant row invokes. */
export const AI_ASK_COMMAND = "paged.ai.ask";
