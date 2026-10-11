/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This file is part of paged (https://paged.media) and is additionally
 * available under the Paged Media Enterprise License (PMEL). Full
 * copyright and license information is available in LICENSE.md which is
 * distributed with this source code.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    MPL-2.0 OR Paged Media Enterprise License (PMEL)
 */

// The agent loop: the model writes a script, the engine runs it, the result
// (output, error, overset stories) goes back, and the model corrects until it
// is done. Runs where the engine is — the browser for the editor, Node for
// the CLI — so tools execute locally and only model turns cross the network.

import type Anthropic from "@anthropic-ai/sdk";

import { lookupApi, type ApiCatalog } from "./catalog";
import { readStoryHealth, type ScriptEngine, type ScriptRun } from "./engine";
import { MODE_SPECS, type AiMode } from "./model";
import { LOOKUP_API, RENDER_PAGE, RUN_SCRIPT, parseToolInput } from "./tools";
import type { AiTransport } from "./transport";

export type AgentEvent =
  | { type: "turn"; turn: number }
  | { type: "text"; delta: string }
  | { type: "script"; source: string }
  | { type: "scriptResult"; source: string; run: ScriptRun; overset: string[] | null }
  | { type: "lookup"; query: string }
  | { type: "render"; page: number };

export interface AgentOptions {
  transport: AiTransport;
  engine: ScriptEngine;
  /** The catalog `lookup_api` answers from. */
  catalog: ApiCatalog;
  mode: Extract<AiMode, "script" | "assist" | "document">;
  /** The user's request, plus any context (selection, diagnosis). */
  prompt: string | Anthropic.ContentBlockParam[];
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  /** Overrides the mode's turn cap (never raises it past the mode's). */
  maxTurns?: number;
}

export interface AgentRefusal {
  category: string | null;
  explanation: string | null;
}

export interface AgentResult {
  /** The model's closing summary (its last text). */
  summary: string;
  /** Every script that ran, in order, with what it returned. */
  scripts: Array<{ source: string; run: ScriptRun }>;
  /** Why the loop ended. */
  outcome: "done" | "refused" | "turnLimit" | "truncated";
  refusal?: AgentRefusal;
  turns: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  /** The full conversation, for a follow-up request. */
  messages: Anthropic.MessageParam[];
}

/** Console and error text above this goes back cut, with a note: a script
 *  that logs a whole story should not fill the context. */
const RESULT_CHAR_LIMIT = 12_000;

/** Consecutive turns whose tool input did not validate before giving up. */
const MAX_BAD_INPUT_TURNS = 2;

function clip(text: string): string {
  return text.length <= RESULT_CHAR_LIMIT ? text : `${text.slice(0, RESULT_CHAR_LIMIT)}\n… (${text.length - RESULT_CHAR_LIMIT} more characters cut)`;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function lastText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const { transport, engine, catalog, mode, onEvent, signal } = options;
  const turnCap = Math.min(options.maxTurns ?? Infinity, MODE_SPECS[mode].maxTurns);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: options.prompt }];
  const scripts: AgentResult["scripts"] = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let summary = "";
  let badInputTurns = 0;

  const finish = (outcome: AgentResult["outcome"], turns: number, refusal?: AgentRefusal): AgentResult => ({
    summary,
    scripts,
    outcome,
    ...(refusal ? { refusal } : {}),
    turns,
    usage,
    messages,
  });

  for (let turn = 1; turn <= turnCap; turn++) {
    signal?.throwIfAborted();
    onEvent?.({ type: "turn", turn });
    const message = await transport.turn({ mode, messages }, { onText: (delta) => onEvent?.({ type: "text", delta }), signal });
    usage.inputTokens += message.usage.input_tokens;
    usage.outputTokens += message.usage.output_tokens;
    usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    const text = lastText(message);
    if (text) summary = text;

    // Haiku 5.5 has no server-side fallback: a refusal ends the run, and a
    // tool call cut off by it must not execute.
    if (message.stop_reason === "refusal") {
      return finish("refused", turn, {
        category: message.stop_details?.category ?? null,
        explanation: message.stop_details?.explanation ?? null,
      });
    }

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    // The assistant turn goes back whole — thinking blocks included and
    // unmodified, or the next turn's thinking is invalidated.
    messages.push({ role: "assistant", content: message.content });
    if (toolUses.length === 0) return finish("done", turn);
    // A tool input cut off at max_tokens can still parse; never run it.
    if (message.stop_reason === "max_tokens") return finish("truncated", turn);

    const results: Anthropic.ToolResultBlockParam[] = [];
    let anyBad = false;
    for (const use of toolUses) {
      const input = parseToolInput(use.name, use.input);
      if (!input) {
        anyBad = true;
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          is_error: true,
          content: `Invalid input for ${use.name}: ${clip(JSON.stringify(use.input))}. Send the call again with the required fields.`,
        });
        continue;
      }
      if (input.name === RUN_SCRIPT) {
        onEvent?.({ type: "script", source: input.source });
        const run = await engine.runScript(input.source);
        const health = await readStoryHealth(engine);
        scripts.push({ source: input.source, run });
        onEvent?.({ type: "scriptResult", source: input.source, run, overset: health?.overset ?? null });
        const report = {
          error: run.error,
          ...(run.budgetKind ? { budget: run.budgetKind } : {}),
          output: run.output,
          oversetStories: health ? health.overset : "unknown",
        };
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: run.error !== null, content: clip(JSON.stringify(report, null, 1)) });
      } else if (input.name === LOOKUP_API) {
        onEvent?.({ type: "lookup", query: input.query });
        results.push({ type: "tool_result", tool_use_id: use.id, content: clip(lookupApi(catalog, input.query)) });
      } else if (input.name === RENDER_PAGE) {
        onEvent?.({ type: "render", page: input.page });
        const png = engine.renderPage ? await engine.renderPage(input.page) : null;
        results.push(
          png
            ? { type: "tool_result", tool_use_id: use.id, content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: base64(png) } }] }
            : { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Page ${input.page} could not be rendered here. Judge the result from the script output instead.` },
        );
      }
    }
    badInputTurns = anyBad ? badInputTurns + 1 : 0;
    messages.push({ role: "user", content: results });
    if (badInputTurns > MAX_BAD_INPUT_TURNS) return finish("truncated", turn);
  }
  return finish("turnLimit", turnCap);
}

/** One plain-text answer (mode `complete`): what a script's
 *  `paged.ai.complete()` resolves to. */
export async function complete(
  transport: AiTransport,
  prompt: string,
  hooks?: { signal?: AbortSignal },
): Promise<{ text: string; refusal?: AgentRefusal }> {
  const message = await transport.turn({ mode: "complete", messages: [{ role: "user", content: prompt }] }, hooks);
  if (message.stop_reason === "refusal") {
    return { text: "", refusal: { category: message.stop_details?.category ?? null, explanation: message.stop_details?.explanation ?? null } };
  }
  return { text: lastText(message) };
}
