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

// Scripts that call Claude (the other direction of the scripting
// integration): a host registers these typed commands in its object
// registry, and a paged.* script reaches them through the protocol-71 host
// bridge it already has —
//
//   const headline = JSON.parse(await paged.invoke("paged.ai.complete", { prompt: "A four-word headline for a spring tea sale" }));
//
// (`paged.invoke` resolves to the answer's JSON text, like every paged.*
// read — hence the JSON.parse.)
// No engine change and no new wire message: the script suspends on the
// host round trip like any plugin call, and the host answers with Claude's
// text. The editor answers through the same-origin proxy, the CLI with the
// caller's own credential.

import type { ObjectModelContribution } from "@paged-media/plugin-api";

import type { AgentRefusal } from "./agent";

export const AI_COMPLETE_COMMAND = "paged.ai.complete";

/** The longest prompt a script may send (characters). */
export const AI_COMPLETE_MAX_PROMPT = 20_000;

/** Calls allowed per rolling minute, per host — the runaway guard for a
 *  script that loops over the model. */
export const AI_COMPLETE_PER_MINUTE = 20;

export interface AiCompleteBackend {
  (prompt: string): Promise<{ text: string; refusal?: AgentRefusal }>;
}

/** The object-model contribution that gives scripts `paged.ai.complete`.
 *  Register it as the host's own: `registry.register({ plugin: "paged.ai",
 *  model: aiObjectModel(backend) })`. */
export function aiObjectModel(complete: AiCompleteBackend, now: () => number = Date.now): ObjectModelContribution {
  const recent: number[] = [];
  return {
    kinds: [],
    commands: [
      {
        id: AI_COMPLETE_COMMAND,
        title: "Ask Claude for text",
        args: { kind: "struct", fields: { prompt: { kind: "text", multiline: true, maxLength: AI_COMPLETE_MAX_PROMPT } } },
        result: { kind: "text", multiline: true },
        async handler(_ctx, args) {
          const { prompt } = args as { prompt: string };
          const t = now();
          while (recent.length && t - recent[0]! > 60_000) recent.shift();
          if (recent.length >= AI_COMPLETE_PER_MINUTE) {
            throw new Error(`rateLimited: at most ${AI_COMPLETE_PER_MINUTE} paged.ai.complete calls a minute`);
          }
          recent.push(t);
          const answer = await complete(prompt);
          if (answer.refusal) throw new Error(`refused: Claude declined this request${answer.refusal.category ? ` (${answer.refusal.category})` : ""}`);
          return answer.text;
        },
      },
    ],
  };
}
