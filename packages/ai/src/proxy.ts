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

// The server half of the proxy transport, as a plain Fetch-API handler so a
// Cloudflare Pages Function (or any runtime with Request/Response) can mount
// it. It is NOT an open relay: it takes the conversation and the mode from
// the client and nothing else. System prompt, tools, model, effort and the
// token cap are rebuilt here from the mode, so a client cannot turn the
// platform key into a general-purpose Claude endpoint.

import Anthropic from "@anthropic-ai/sdk";

import type { ApiCatalog } from "./catalog";
import { isAiMode, type AiMode } from "./model";
import { buildRequest } from "./request";
import { MODE_HEADER } from "./transport";

export interface ProxyUsage {
  mode: AiMode;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiProxyOptions {
  apiKey: string;
  catalog: ApiCatalog;
  model?: string;
  /** Turnstile, rate limit, spend cap: return a Response to refuse the
   *  call, or null to let it through. Runs before the body is read. */
  authorize?: (request: Request, mode: AiMode) => Promise<Response | null>;
  /** Called once the reply has streamed, with what it cost. Use it to feed
   *  a spend counter. Wrap it in the runtime's waitUntil if it does I/O. */
  onUsage?: (usage: ProxyUsage) => void | Promise<void>;
  /** Largest accepted request body (bytes). Default 4 MB: a conversation
   *  with a few page renders. */
  maxBodyBytes?: number;
  /** Most messages one conversation may carry. Default 160 (a 60-turn
   *  document build is 121). */
  maxMessages?: number;
  /** For tests: the fetch the Anthropic client uses. */
  fetch?: typeof fetch;
}

const ALLOWED_BLOCKS = new Set(["text", "image", "tool_use", "tool_result", "thinking", "redacted_thinking"]);

function errorResponse(status: number, type: string, message: string): Response {
  // The Anthropic error envelope, so the SDK on the client raises its
  // typed error classes for proxy refusals too.
  return new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Check the conversation's shape: user/assistant turns only (no
 *  mid-conversation system messages — those carry operator authority), and
 *  only the block types the agent itself produces. */
export function validateMessages(value: unknown, maxMessages: number): Anthropic.MessageParam[] | string {
  if (!Array.isArray(value) || value.length === 0) return "messages must be a non-empty array";
  if (value.length > maxMessages) return `at most ${maxMessages} messages per conversation`;
  for (const [i, m] of value.entries()) {
    if (typeof m !== "object" || m === null) return `messages[${i}] is not an object`;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return `messages[${i}].role must be user or assistant`;
    if (typeof content === "string") continue;
    if (!Array.isArray(content)) return `messages[${i}].content must be a string or an array`;
    for (const [j, b] of content.entries()) {
      const type = (b as { type?: unknown } | null)?.type;
      if (typeof type !== "string" || !ALLOWED_BLOCKS.has(type)) return `messages[${i}].content[${j}]: block type ${String(type)} is not accepted`;
    }
  }
  return value as Anthropic.MessageParam[];
}

/** Read token usage off the streamed SSE without holding the stream up. */
async function meterStream(stream: ReadableStream<Uint8Array>, mode: AiMode, onUsage: NonNullable<AiProxyOptions["onUsage"]>): Promise<void> {
  const usage: ProxyUsage = { mode, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const event = JSON.parse(line.slice(5));
        const u = event.type === "message_start" ? event.message?.usage : event.type === "message_delta" ? event.usage : null;
        if (!u) continue;
        if (typeof u.input_tokens === "number") usage.inputTokens = u.input_tokens;
        if (typeof u.output_tokens === "number") usage.outputTokens = u.output_tokens;
        if (typeof u.cache_read_input_tokens === "number") usage.cacheReadTokens = u.cache_read_input_tokens;
        if (typeof u.cache_creation_input_tokens === "number") usage.cacheWriteTokens = u.cache_creation_input_tokens;
      } catch {
        // a partial or non-JSON data line: nothing to meter
      }
    }
  }
  await onUsage(usage);
}

export async function handleAiProxy(request: Request, options: AiProxyOptions): Promise<Response> {
  if (request.method !== "POST") return errorResponse(405, "invalid_request_error", "POST only");
  if (!new URL(request.url).pathname.endsWith("/v1/messages")) return errorResponse(404, "not_found_error", "unknown route");
  const mode = request.headers.get(MODE_HEADER);
  if (!isAiMode(mode)) return errorResponse(400, "invalid_request_error", `missing or unknown ${MODE_HEADER}`);

  const refused = await options.authorize?.(request, mode);
  if (refused) return refused;

  const maxBody = options.maxBodyBytes ?? 4 * 1024 * 1024;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBody) return errorResponse(413, "request_too_large", "request body too large");
  const raw = await request.text();
  if (raw.length > maxBody) return errorResponse(413, "request_too_large", "request body too large");
  let body: { messages?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse(400, "invalid_request_error", "body is not JSON");
  }
  const messages = validateMessages(body.messages, options.maxMessages ?? 160);
  if (typeof messages === "string") return errorResponse(400, "invalid_request_error", messages);

  const client = new Anthropic({ apiKey: options.apiKey, ...(options.fetch ? { fetch: options.fetch } : {}) });
  const params = buildRequest({ mode, messages, catalog: options.catalog, model: options.model });
  let upstream: Response;
  try {
    upstream = await client.messages.create({ ...params, stream: true }).asResponse();
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      // Pass the upstream status through, but not its message: it can name
      // the server-side prompt or account details.
      const status = typeof err.status === "number" ? err.status : 502;
      const type = status === 429 ? "rate_limit_error" : status === 529 ? "overloaded_error" : status >= 500 ? "api_error" : "invalid_request_error";
      return errorResponse(status, type, `upstream ${status}`);
    }
    return errorResponse(502, "api_error", "upstream unreachable");
  }
  if (!upstream.body) return errorResponse(502, "api_error", "upstream sent no body");

  let body$ = upstream.body;
  if (options.onUsage) {
    const [toClient, toMeter] = upstream.body.tee();
    body$ = toClient;
    void meterStream(toMeter, mode, options.onUsage).catch(() => undefined);
  }
  return new Response(body$, {
    status: upstream.status,
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

/** What a turn cost in US dollars on Claude Haiku 5.5's rate card: $0.10 /
 *  $0.50 per million input / output tokens for prompts up to 100K tokens,
 *  $0.50 / $2.50 above; cache reads 0.1× and 5-minute cache writes 1.25×
 *  the input rate. For a spend cap, not for billing — the invoice is the
 *  authority, and prices change. */
export function haikuCostUsd(usage: Pick<ProxyUsage, "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens">): number {
  const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const [inRate, outRate] = prompt > 100_000 ? [0.5, 2.5] : [0.1, 0.5];
  return (
    (usage.inputTokens * inRate + usage.cacheReadTokens * inRate * 0.1 + usage.cacheWriteTokens * inRate * 1.25 + usage.outputTokens * outRate) / 1_000_000
  );
}
