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

// The tools the model drives the document with. Fixed per mode and in a
// fixed order: they sit in the cached prefix, and the proxy rebuilds them
// server-side, so a client cannot add one.

import type Anthropic from "@anthropic-ai/sdk";

export const RUN_SCRIPT = "run_script";
export const LOOKUP_API = "lookup_api";
export const RENDER_PAGE = "render_page";

export const SCRIPT_TOOLS: Anthropic.Tool[] = [
  {
    name: RUN_SCRIPT,
    description:
      "Run a paged.* JavaScript program against the open document. Returns the console output, the error if the script threw or a budget tripped, and which stories are overset afterwards. Writes made before an error stay applied.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", description: "The Boa (ECMAScript) source to run." },
      },
      required: ["source"],
      additionalProperties: false,
    },
  },
  {
    name: LOOKUP_API,
    description:
      "Look up the engine catalog: host functions whose name contains the query, and property paths that contain it with their type, unit and allowed values. Use it before setting a property you have not used yet.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Part of a function name or property path, e.g. insertTextFrame or StrokeWeight." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: RENDER_PAGE,
    description: "Render one page of the document to an image so you can judge layout and look. Costs more than a script; use it to check visual results.",
    input_schema: {
      type: "object",
      properties: {
        page: { type: "integer", description: "1-based page number." },
      },
      required: ["page"],
      additionalProperties: false,
    },
  },
];

export type ToolInput =
  | { name: typeof RUN_SCRIPT; source: string }
  | { name: typeof LOOKUP_API; query: string }
  | { name: typeof RENDER_PAGE; page: number };

/** Validate a tool call's input. With eager input streaming the API no
 *  longer validates it, and the SDK's tolerant parser can hand back a
 *  truncated object — so every call is checked here before it runs. */
export function parseToolInput(name: string, input: unknown): ToolInput | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  switch (name) {
    case RUN_SCRIPT:
      return typeof o.source === "string" && o.source.trim() ? { name, source: o.source } : null;
    case LOOKUP_API:
      return typeof o.query === "string" ? { name, query: o.query } : null;
    case RENDER_PAGE:
      return typeof o.page === "number" && Number.isInteger(o.page) && o.page >= 1 ? { name, page: o.page } : null;
    default:
      return null;
  }
}
