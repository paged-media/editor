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

// @paged-media/ai — Claude for paged. The proxy's server half is a separate
// entry (`@paged-media/ai/proxy`) so the browser bundle never carries it.

export { DEFAULT_MODEL, MODE_SPECS, AI_MODES, isAiMode, type AiMode, type Effort, type ModeSpec } from "./model";
export { renderCatalog, lookupApi, type ApiCatalog } from "./catalog";
export { AUTHORING_GUIDE } from "./guide";
export { readStoryHealth, type ScriptEngine, type ScriptRun, type StoryHealth } from "./engine";
export { SCRIPT_TOOLS, RUN_SCRIPT, LOOKUP_API, RENDER_PAGE, parseToolInput, type ToolInput } from "./tools";
export { buildRequest, systemPrompt, type BuildRequestOptions } from "./request";
export {
  createDirectTransport,
  createProxyTransport,
  MODE_HEADER,
  type AiTransport,
  type TurnRequest,
  type TurnHooks,
  type DirectTransportOptions,
  type ProxyTransportOptions,
} from "./transport";
export { runAgent, complete, type AgentEvent, type AgentOptions, type AgentResult, type AgentRefusal } from "./agent";
export { aiObjectModel, AI_COMPLETE_COMMAND, AI_COMPLETE_MAX_PROMPT, AI_COMPLETE_PER_MINUTE, type AiCompleteBackend } from "./object-model";
