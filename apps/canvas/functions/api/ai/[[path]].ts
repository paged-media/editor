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

// The editor's one server call (ADR 221): the same-origin Claude proxy,
// a Cloudflare Pages Function on the playground project, served at
// /api/ai/v1/messages. The handler itself (@paged-media/ai/proxy) rebuilds
// every request from the mode — system prompt, tools, model, caps — so the
// platform key cannot be used for anything but paged's own agent. This file
// adds what a public deployment needs around it:
//
//   - same-origin only (the editor calls it; other sites' pages cannot)
//   - a per-IP turn limit per hour
//   - a daily spend cap in dollars, metered from each reply's usage
//
// Bindings (set on the Pages project, not in the repo):
//   ANTHROPIC_API_KEY        secret — absent: every call answers 503
//   AI_USAGE                 KV namespace for the counters — absent: 503,
//                            unless AI_ALLOW_UNCAPPED = "1" (local dev)
//   AI_DAILY_BUDGET_USD      default "20"
//   AI_IP_TURNS_PER_HOUR     default "120"

import { handleAiProxy, haikuCostUsd } from "@paged-media/ai/proxy";
import catalog from "@paged-media/ai/catalog";

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  ANTHROPIC_API_KEY?: string;
  AI_USAGE?: KV;
  AI_DAILY_BUDGET_USD?: string;
  AI_IP_TURNS_PER_HOUR?: string;
  AI_ALLOW_UNCAPPED?: string;
}

interface Context {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

function refuse(status: number, type: string, message: string): Response {
  return new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const today = (): string => new Date().toISOString().slice(0, 10);
const hour = (): string => new Date().toISOString().slice(0, 13);

/** KV counters are read-modify-write and eventually consistent: the caps
 *  are approximate (a burst can overshoot by a few turns), which is the
 *  trade for needing nothing but a KV namespace. */
async function bump(kv: KV, key: string, by: number, ttlSeconds: number): Promise<number> {
  const next = Number((await kv.get(key)) ?? "0") + by;
  await kv.put(key, String(next), { expirationTtl: ttlSeconds });
  return next;
}

export async function onRequest(context: Context): Promise<Response> {
  const { request, env } = context;
  if (!env.ANTHROPIC_API_KEY) return refuse(503, "ai_unavailable", "The AI service is not configured on this deployment.");
  const uncapped = env.AI_ALLOW_UNCAPPED === "1";
  const kv = env.AI_USAGE;
  if (!kv && !uncapped) return refuse(503, "ai_unavailable", "The AI service has no usage store on this deployment.");

  // Same-origin only: the editor sends Origin on every POST.
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return refuse(403, "permission_error", "same-origin requests only");

  const budget = Number(env.AI_DAILY_BUDGET_USD ?? "20");
  const perHour = Number(env.AI_IP_TURNS_PER_HOUR ?? "120");
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

  return handleAiProxy(request, {
    apiKey: env.ANTHROPIC_API_KEY,
    catalog,
    async authorize() {
      if (!kv) return null;
      const spent = Number((await kv.get(`spend:${today()}`)) ?? "0");
      if (spent >= budget) return refuse(503, "ai_unavailable", "Today's AI budget for this deployment is used up. It resets at midnight UTC.");
      const turns = await bump(kv, `turns:${ip}:${hour()}`, 1, 2 * 3600);
      if (turns > perHour) return refuse(429, "rate_limit_error", "Too many AI requests from this address. Try again within the hour.");
      return null;
    },
    onUsage(usage) {
      if (!kv) return;
      context.waitUntil(bump(kv, `spend:${today()}`, haikuCostUsd(usage), 3 * 86_400));
    },
  });
}
