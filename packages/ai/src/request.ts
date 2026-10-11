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

// One function turns (mode, conversation) into a Messages API request. The
// direct transport calls it on the client, the proxy calls it on the server;
// the conversation is the only part a caller supplies.

import type Anthropic from "@anthropic-ai/sdk";

import { renderCatalog, type ApiCatalog } from "./catalog";
import { AUTHORING_GUIDE } from "./guide";
import { DEFAULT_MODEL, MODE_SPECS, type AiMode } from "./model";
import { SCRIPT_TOOLS } from "./tools";

const MODE_NOTES: Record<AiMode, string> = {
  script: "",
  assist: `# This request

You are the AI Assistant inside the paged editor. The user message describes the current selection and asks for one change. Make that change and nothing else: keep every other frame, story and style as it is. Prefer the smallest edit that does the job.`,
  complete: "",
  document: `# This request

You are building a whole document from a brief, starting from the document that is open (often one blank page). Work in this order: decide the page size, a palette and a small set of paragraph and character styles; create the styles and swatches; then build the document one page at a time, checking each page for overset text and, where layout matters, rendering it before you move on. Write real, specific copy that fits the brief; never leave placeholder text such as "Lorem ipsum" unless the brief asks for it.`,
};

const COMPLETE_SYSTEM = `You write text for print documents made in paged, a desktop-publishing application. A script running inside a document asks you for text. Reply with exactly the text requested and nothing else: no preamble, no quotation marks around it, no Markdown unless asked. Keep the length the request implies.`;

/** The system prompt for a mode. Byte-stable for a given catalog: it is
 *  the cached prefix. */
export function systemPrompt(mode: AiMode, catalog: ApiCatalog): string {
  if (mode === "complete") return COMPLETE_SYSTEM;
  const parts = [
    AUTHORING_GUIDE.trim(),
    "# Engine capability catalog\n\nGenerated from the engine. Where it and the text above disagree, the catalog is right.\n\n" + renderCatalog(catalog),
  ];
  if (MODE_NOTES[mode]) parts.push(MODE_NOTES[mode]);
  return parts.join("\n\n");
}

export interface BuildRequestOptions {
  mode: AiMode;
  messages: Anthropic.MessageParam[];
  catalog: ApiCatalog;
  model?: string;
}

export function buildRequest(options: BuildRequestOptions): Anthropic.MessageCreateParamsNonStreaming {
  const spec = MODE_SPECS[options.mode];
  return {
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: spec.maxTokens,
    // Haiku 5.5: adaptive thinking only, and effort set explicitly rather
    // than left at the model's default.
    thinking: { type: "adaptive" },
    output_config: { effort: spec.effort },
    system: [{ type: "text", text: systemPrompt(options.mode, options.catalog), cache_control: { type: "ephemeral" } }],
    ...(spec.tools ? { tools: SCRIPT_TOOLS } : {}),
    messages: options.messages,
  };
}
